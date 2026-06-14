# Budget Policy

Version: 1.0.0
Status: Draft
Owner: Forge Core
Depends on: mission-protocol.md, architecture.md, security.md

## Purpose

Define how Forge budgets, meters, caps, and reports cost across missions, tasks, and tool calls. This document specifies the cost estimation pipeline, the real-time metering, the warning and hard-stop thresholds, the fallback routing policy, and the user-facing transparency surface.

Cost is a first-class concern. Every mission, every task, every model call is metered. The user always knows what has been spent, what is estimated to be spent, and what the cap is.

## Design Principles

1. **Transparent**: cost is visible in real time, in the UI, in the live feed, and in the transaction log.
2. **Predictable**: the user sets a cap before the mission starts and can adjust it during execution.
3. **Forgiving**: pre-execution estimates can be wrong. Hard stops are pauses with user consent, not silent failures.
4. **Efficient**: fallback routing kicks in automatically before the cap is hit, to extend mission runway.
5. **Provider-agnostic**: the same metering applies to Anthropic, OpenAI, Google, OpenRouter, and local Ollama.

## Cost Model

### Cost components

A mission's total cost is the sum of:

| Component         | Source                                          | Metered at         |
|-------------------|-------------------------------------------------|--------------------|
| Model input       | Token count × provider input rate               | Per model call     |
| Model output      | Token count × provider output rate              | Per model call     |
| Model reasoning   | Reasoning tokens (Claude extended thinking)     | Per model call     |
| Web search        | Per-search flat or per-result rate              | Per search call    |
| Web fetch         | Per-fetch flat or per-page rate                 | Per fetch call     |
| MCP calls         | Provider-defined (often free in Phase 1)         | Per MCP call       |
| Image generation  | Per-image flat rate                             | Per generation     |
| PDF generation    | Per-page flat rate                              | Per generation     |
| Other tools       | Provider-defined                                | Per call           |

Local models (Ollama) have a **compute cost**, not a financial cost. The user can set a virtual cost per local call to keep the budget uniform, or opt out of local model metering.

### Rate source

- **Cloud providers**: rates are fetched at startup from the provider's pricing page (cached) or from a static rate table shipped with Forge.
- **OpenRouter**: rates are returned in the API response itself, used directly.
- **Local models**: zero financial cost, optional virtual cost configured by the user.

If a rate is unknown (new model, new provider), the Model Router uses a conservative upper-bound estimate and flags the call as `cost_estimated: true` in the transaction log.

## Pre-Execution Estimation

When a mission enters PLANNING, the Planner agent produces a cost estimate as part of the task graph.

**Estimation method** (heuristic for Phase 1):

```
estimated_cost =
  sum_over_tasks(
    agent.base_cost_per_task
    + estimated_input_tokens * input_rate
    + estimated_output_tokens * output_rate
    + estimated_tool_calls * tool_rate
  )
```

**Base costs per agent** (calibrated defaults, configurable):

| Agent       | Default base cost (EUR) | Typical task size  |
|-------------|-------------------------|--------------------|
| Architect   | 0.50                    | 1-3 tasks          |
| Planner     | 0.30                    | 1 task             |
| Researcher  | 0.40                    | 2-5 tasks          |
| Coder       | 0.80                    | 3-10 tasks         |
| QA          | 0.40                    | 1-3 tasks          |
| Reviewer    | 0.30                    | 1-2 tasks          |
| Designer    | 0.60                    | 2-5 tasks          |
| Marketing   | 0.50                    | 2-4 tasks          |

**Token estimates**: derived from the mission statement length, blueprint documents size, and historical averages from Mission Memory (per agent role, per task type).

The estimate is **always** a range: `low_estimate` and `high_estimate`. The user sets the cap relative to the high estimate, with a buffer (default 30%).

### Estimation display

In the AWAITING_APPROVAL blueprint review, the user sees:

```
Estimated cost: €1.20 - €2.50
Recommended cap: €3.25 (high estimate + 30% buffer)
Default cap:     €5.00
[Use recommended] [Use default] [Set custom] [Cancel]
```

## Real-Time Metering

Every model call and tool call is metered in real time.

**Metering flow**:

1. Model Router intercepts the call.
2. Pre-call: records `estimated_input_tokens` and computes `estimated_call_cost`.
3. Call executes.
4. Post-call: records `actual_input_tokens`, `actual_output_tokens`, `actual_call_cost`.
5. The Meter updates `mission.budget.spent_eur` and emits a `BUDGET_UPDATE` event.
6. The UI Live Feed shows the running total.

**Per-task and per-mission totals** are computed by aggregating call costs.

**Cost event** (in transaction log):

```json
{
  "event_id": "evt_2026_06_13_001",
  "type": "COST_RECORDED",
  "mission_id": "msn_001",
  "task_id": "tsk_001",
  "call_id": "call_abc",
  "data": {
    "provider": "anthropic",
    "model": "claude-opus-4",
    "input_tokens": 1500,
    "output_tokens": 800,
    "input_cost": 0.0225,
    "output_cost": 0.0360,
    "total_cost": 0.0585,
    "currency": "EUR"
  }
}
```

## Thresholds and Actions

The Budget Meter enforces three thresholds, configurable per mission:

| Threshold       | Default    | Action                                           |
|-----------------|------------|--------------------------------------------------|
| Warning         | 70% of cap | BUDGET_WARNING event, UI shows yellow indicator  |
| Soft stop       | 100% of cap| BUDGET_SOFT_STOP event, mission PAUSED, user prompted |
| Hard stop       | 120% of cap| BUDGET_HARD_STOP event, current task cancelled, mission PAUSED |

**Soft stop behavior**: the mission is paused. The UI shows:

```
Mission paused: budget cap reached.
Spent: €5.00 / Cap: €5.00
Tasks completed: 6/9

Options:
  [Raise cap to €7.50]  [Continue with fallback model]  [Cancel mission]
```

**Hard stop behavior**: the currently running task is allowed to finish (so cost accounting is clean), then the mission is paused. This prevents partial task states.

**Warning behavior**: the mission continues. A persistent banner appears in the UI:

```
Budget at 72% (€3.60 / €5.00). Consider raising the cap or switching to fallback models.
```

## Fallback Routing

When the budget is tight, the Model Router can automatically fall back to cheaper models for non-critical tasks.

**Fallback policy** (configurable per mission):

| Task type             | Primary model   | Fallback model                |
|-----------------------|-----------------|-------------------------------|
| Architecture planning | Claude Opus     | Claude Sonnet                 |
| Blueprint generation  | Claude Opus     | Claude Sonnet                 |
| Code generation       | Qwen Coder 32B  | DeepSeek Coder (local)        |
| Code review           | Claude Sonnet   | Qwen Coder 32B                |
| QA validation         | Claude Sonnet   | Local Qwen                    |
| Research              | Gemini Pro      | OpenRouter (cheapest viable)  |
| Marketing copy        | Claude Sonnet   | GPT-4o-mini                   |
| Design rationale      | Claude Sonnet   | Local Qwen                    |

**Trigger conditions** for automatic fallback:
- Budget > 80% AND task type has a fallback configured.
- Primary model call fails (timeout, rate limit, error) AND fallback is configured.
- User explicitly enables "aggressive fallback" in the mission settings.

**User override**: the user can disable automatic fallback per mission. The setting is logged.

**Quality note**: fallback routing is a tradeoff between cost and quality. The UI always shows which model actually executed a task. The Reviewer agent can flag quality degradation.

## Budget UI Surface

The user sees cost in four places:

1. **Mission bar (top)**: a budget meter with spent / cap and a percentage indicator. Color-coded (green / yellow / red).

2. **Kanban card**: each task card shows the model used, the cost, and the duration. Hovering shows input/output tokens.

3. **Live feed**: every model call appears in the feed with provider, model, cost, and tokens.

4. **Mission summary (on completion)**: a full cost breakdown:

```
Mission: Create a plumber website with booking
Duration: 47 minutes
Total cost: €2.84 / Cap: €5.00

By agent:
  Architect:   €0.62
  Planner:     €0.28
  Researcher:  €0.41
  Coder:       €0.89
  QA:          €0.34
  Reviewer:    €0.30

By model:
  claude-opus-4:        €1.20
  claude-sonnet-4:      €0.95
  qwen2.5-coder:32b:    €0.45
  gemini-2.5-pro:       €0.24

By tool:
  Web search:           €0.12
  Web fetch:            €0.04
  MCP calls:            €0.00

Fallback events: 2 (saved ~€0.60)
```

## Default Budget Settings

Out of the box, Forge ships with sensible defaults:

| Setting                          | Default        |
|----------------------------------|----------------|
| Default mission cap              | €5.00          |
| Default buffer over high estimate| 30%            |
| Warning threshold                | 70%            |
| Soft stop threshold              | 100%           |
| Hard stop threshold              | 120%           |
| Auto-fallback                    | enabled        |
| Local model virtual cost         | €0.00          |
| Currency                         | user-configured (EUR, USD, GBP) |

The user can change any of these globally in Preferences or per mission at launch.

## Per-Provider Rate Configuration

Rates are stored in `.forge/config/rates.json` and can be edited by the user:

```json
{
  "version": "2026-06-13",
  "providers": {
    "anthropic": {
      "claude-opus-4": {
        "input_per_million_tokens": 15.00,
        "output_per_million_tokens": 75.00,
        "currency": "USD"
      },
      "claude-sonnet-4": {
        "input_per_million_tokens": 3.00,
        "output_per_million_tokens": 15.00,
        "currency": "USD"
      }
    },
    "openai": {
      "gpt-4o": {
        "input_per_million_tokens": 2.50,
        "output_per_million_tokens": 10.00,
        "currency": "USD"
      }
    },
    "ollama": {
      "default": {
        "input_per_million_tokens": 0.00,
        "output_per_million_tokens": 0.00,
        "currency": "USD"
      }
    }
  }
}
```

Forge ships with up-to-date rate tables. The user can override per model.

## Mission-Level Caps vs. Global Caps

Two scopes of cap:

- **Global cap**: monthly or weekly cap across all missions. The user sets it in Preferences. Forge tracks rolling spend and warns when approaching the global cap.
- **Mission cap**: per-mission cap, set at mission launch. Default is the recommended cap from the estimate.

The effective limit is the **minimum** of the two. Both are checked on every BUDGET_UPDATE.

## Open Questions

- Should costs be deducted in fiat or in "compute credits" abstracted from providers? **Decision: fiat for Phase 1, optional credits abstraction in Phase 3.**
- Should we expose a public cost API for power users to build dashboards? **Decision: Phase 3.**
- Should we support cost attribution (e.g., split a mission's cost across team members)? **Decision: Phase 3 with team features.**

## Change Log

- 1.0.0 — 2026-06-13 — Initial budget policy. Estimation, metering, thresholds, fallback routing, UI, rate configuration.
