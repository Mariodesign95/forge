# Mission Protocol

Version: 1.0.0
Status: Draft
Owner: Forge Core
Depends on: -

## Purpose

Define the contract between the user and Forge. A mission is the atomic unit of work. This document specifies how a mission is created, structured, decomposed, executed, observed, governed and completed. Every other technical document depends on the vocabulary defined here.

## Definitions

- **Mission**: a high-level objective the user wants Forge to accomplish.
- **Task**: a unit of work derived from a mission, assigned to a single agent.
- **Step**: an atomic action performed by an agent (file read, file write, terminal command, web search, tool call).
- **Agent**: a specialized role (Architect, Planner, Researcher, Coder, QA, Reviewer, Designer, Marketing, Automation, Operations).
- **Orchestrator**: the component that owns mission state and routes tasks to agents.
- **User**: the human who launched the mission and retains governance authority.
- **Workspace**: the isolated directory on the user's filesystem where mission artifacts are produced.

## Mission Lifecycle

A mission moves through a strict state machine. Transitions are explicit and logged.

```
DRAFT → PLANNING → AWAITING_APPROVAL → APPROVED → EXECUTING
  → (PAUSED ↔ EXECUTING) → COMPLETED
  → (FAILED | CANCELLED)
```

| State              | Description                                                                 | Allowed transitions                         |
|--------------------|-----------------------------------------------------------------------------|--------------------------------------------|
| DRAFT              | User is composing the mission statement. No system work yet.                | PLANNING, CANCELLED                        |
| PLANNING           | Architect and Planner agents generate blueprint documents.                  | AWAITING_APPROVAL, FAILED                  |
| AWAITING_APPROVAL  | Blueprint is ready. User must approve before execution.                     | APPROVED, DRAFT (revisions), CANCELLED     |
| APPROVED           | User approved. Execution not yet started.                                   | EXECUTING, CANCELLED                       |
| EXECUTING          | Tasks are being dispatched and executed.                                    | PAUSED, COMPLETED, FAILED                  |
| PAUSED             | Execution halted (budget, user request, blocking failure).                  | EXECUTING, CANCELLED, FAILED               |
| COMPLETED          | All tasks finished successfully. Terminal state.                            | -                                          |
| FAILED             | Unrecoverable error. Terminal state, requires new mission.                  | -                                          |
| CANCELLED          | User cancelled. Terminal state.                                             | -                                          |

## Mission Structure

A mission is a JSON document stored in `.forge/missions/<mission_id>/mission.json`.

```json
{
  "id": "msn_2026_06_13_001",
  "title": "Create a plumber website with booking",
  "statement": "Build a marketing website for a local plumber with online booking, service area pages and SEO optimization.",
  "state": "DRAFT",
  "created_at": "2026-06-13T10:00:00Z",
  "updated_at": "2026-06-13T10:00:00Z",
  "owner": "user",
  "workspace": "/forge/workspaces/msn_2026_06_13_001",
  "blueprint": {
    "requirements": null,
    "architecture": null,
    "design": null,
    "brand": null,
    "landing": null,
    "marketing": null,
    "seo": null,
    "user_personas": null
  },
  "task_graph": [],
  "budget": {
    "cap_eur": 5.0,
    "spent_eur": 0.0,
    "fallback_model": null
  },
  "permissions": {
    "level": 2,
    "autonomous_run": false
  },
  "context": {
    "stack_preference": null,
    "design_references": [],
    "constraints": []
  }
}
```

## Blueprint Phase

When a mission enters PLANNING, the Architect and Planner agents produce blueprint documents. Blueprint documents are written to `.forge/missions/<mission_id>/blueprint/`.

Required documents (per Master Spec):

- `requirements.md` — functional and non-functional requirements
- `architecture.md` — system architecture, components, data flow
- `design.md` — UI/UX direction, components, motion
- `brand.md` — brand identity, tone of voice
- `landing.md` — landing page structure
- `marketing.md` — channels, messaging, assets plan
- `seo.md` — keyword strategy, content plan
- `user_personas.md` — target audience segments

Optional documents (mission-specific):

- `data-model.md`
- `api-contract.md`
- `deployment.md`
- `compliance.md`

Blueprint generation is itself a task graph. The Orchestrator sequences it: requirements → architecture → personas → design/brand in parallel → marketing/seo/landing in parallel → review.

User approval is a hard gate. Execution cannot start without explicit APPROVED transition.

## Task Graph

A mission is decomposed into a directed acyclic graph of tasks. Each task is a JSON document:

```json
{
  "id": "tsk_001",
  "mission_id": "msn_2026_06_13_001",
  "title": "Generate requirements.md",
  "agent": "Architect",
  "model": "claude-opus-4",
  "depends_on": [],
  "state": "PENDING",
  "inputs": { "mission_statement": "..." },
  "outputs": { "files": ["requirements.md"] },
  "attempts": 0,
  "max_attempts": 3,
  "cost_eur": 0.0,
  "duration_ms": 0,
  "error": null
}
```

Task states: PENDING → DISPATCHED → RUNNING → COMPLETED | FAILED | BLOCKED | SKIPPED.

Task states with allowed transitions:

| State      | Transitions                              |
|------------|------------------------------------------|
| PENDING    | DISPATCHED, SKIPPED                      |
| DISPATCHED | RUNNING, FAILED (dispatch error)         |
| RUNNING    | COMPLETED, FAILED, BLOCKED               |
| COMPLETED  | - (terminal)                             |
| FAILED     | PENDING (retry), SKIPPED, ESCALATED      |
| BLOCKED    | PENDING (unblocked)                      |
| SKIPPED    | - (terminal)                             |
| ESCALATED  | PENDING (user resolved), FAILED          |

## User Governance

The user retains three governance primitives during EXECUTING:

1. **Pause / Resume**: stop the mission, inspect state, resume from where it stopped.
2. **Approve / Reject at checkpoints**: certain tasks (deploys, destructive ops) require explicit user approval before running.
3. **Inject context**: add constraints, references, or decisions mid-flight. The Orchestrator propagates new context to PENDING and RUNNING tasks.

The user can also:
- Cancel the mission at any time (CANCELLED state, current state preserved).
- Reject a task output, forcing regeneration with feedback.
- Adjust the budget cap during execution.

## Mission History

Completed missions are archived. The Brain indexes:
- mission title and statement
- final blueprint documents
- task graph with outcomes
- total cost and duration
- decisions made
- skills acquired during the mission

History is searchable and is the primary input for context in future missions.

## Failure Semantics

A mission fails (FAILED state) only when:
- A required task has exhausted retries (max_attempts reached) and no fallback model is available.
- The user explicitly aborts after a critical error.
- A precondition check fails irrecoverably (e.g., workspace not writable).

A mission is paused (PAUSED state) when:
- Budget cap is reached.
- A Level 3 or 4 permission action is queued and requires user approval.
- A blocking external dependency fails.
- The user pauses manually.

Partial progress is preserved in all cases. The user can resume a paused mission or extract artifacts from a failed one.

## Concurrency

- Within a mission, multiple tasks can run in parallel if the task graph allows.
- Default max parallel tasks: 4. User-configurable per mission.
- Cross-mission concurrency: supported but isolated. Each mission has its own workspace and task graph.

## Versioning

Mission documents are versioned. The mission file is append-only for state transitions:

```
mission.json
mission.v1.json
mission.v2.json
```

This allows replay and debugging of orchestration decisions.

## Open Questions

- Should the user be able to fork a mission (clone its blueprint for a new variant)? **Decision: yes, Phase 2.**
- Should missions support human handoff (one user starts, another resumes)? **Decision: out of scope Phase 1-2, Phase 3 with team features.**
- Should the mission statement support rich media (audio, sketches)? **Decision: Phase 3, text-only in Phase 1.**

## Change Log

- 1.0.0 — 2026-06-13 — Initial protocol. State machine, task graph, blueprint gate, user governance.
