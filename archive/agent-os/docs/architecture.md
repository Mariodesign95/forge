# Architecture

Version: 1.0.0
Status: Draft
Owner: Forge Core
Depends on: mission-protocol.md

## Purpose

Define the runtime architecture of Forge. This document specifies the components, the message bus that connects them, the orchestrator pattern, the sandboxing model, and the data flow for a mission execution.

## Architectural Principles

1. **Local-first**: every component runs on the user's machine. No Forge server is required for core functionality.
2. **Event-driven**: components communicate exclusively through the message bus. Direct calls between components are forbidden.
3. **Stateless workers, stateful orchestrator**: agents are pure functions of their inputs. The Orchestrator owns all mission state.
4. **Workspace isolation**: every mission gets a sandboxed workspace. The user's real filesystem is never touched without explicit commit.
5. **Append-only logs**: every state transition is logged. Logs are the source of truth for replay and recovery.
6. **Provider-agnostic**: model providers are abstracted behind a single interface.

## High-Level Diagram

```
+--------------------------------------------------------------+
|                         User (Governance)                    |
+--------------------------------------------------------------+
                              |
                              v
+--------------------------------------------------------------+
|                       Mission UI (React)                     |
|  MissionBar | Kanban | Workspace | LiveFeed | ChatSidebar    |
+--------------------------------------------------------------+
                              |
                              v
+--------------------------------------------------------------+
|                          Orchestrator                        |
|  - Mission State Machine                                     |
|  - Task Scheduler                                            |
|  - Budget Meter                                              |
|  - Permission Gate                                           |
+--------------------------------------------------------------+
        |               |               |               |
        v               v               v               v
+-------------+  +-------------+  +-------------+  +-------------+
|  Agent:     |  |  Agent:     |  |  Agent:     |  |  Agent:     |
|  Architect  |  |  Coder      |  |  Researcher |  |  ...        |
|  (Model X)  |  |  (Model Y)  |  |  (Model Z)  |  |             |
+------+------+  +------+------+  +------+------+  +------+------+
       |                |                |                |
       v                v                v                v
+--------------------------------------------------------------+
|                         Message Bus                          |
|   Events: TASK_DISPATCHED, TASK_COMPLETED, TASK_FAILED,    |
|           BUDGET_WARNING, PERMISSION_REQUEST, AGENT_LOG    |
+--------------------------------------------------------------+
        |               |               |               |
        v               v               v               v
+-------------+  +-------------+  +-------------+  +-------------+
|  Tool:      |  |  Tool:      |  |  Tool:      |  |  Tool:      |
|  Filesystem |  |  Terminal   |  |  Web Search |  |  MCP        |
+-------------+  +-------------+  +-------------+  +-------------+
                              |
                              v
+--------------------------------------------------------------+
|              Workspace (Sandboxed, per mission)              |
|  /forge/workspaces/<mission_id>/                             |
+--------------------------------------------------------------+
                              |
                              v
+--------------------------------------------------------------+
|                  Transaction Log (Append-only)               |
|  .forge/missions/<mission_id>/log.ndjson                    |
+--------------------------------------------------------------+
```

## Components

### 1. Mission UI

- **Stack**: React + TypeScript + Tailwind, running inside the VS Code webview.
- **Responsibilities**: render the mission lifecycle, display the kanban, stream the live feed, handle user approvals, host the chat sidebar.
- **State source**: subscribes to events from the Orchestrator via the message bus. UI is a pure projection of mission state.
- **Local persistence**: UI preferences only. Mission state lives in the Orchestrator.

### 2. Orchestrator

The Orchestrator is the single owner of mission state. It is a long-running process (Node.js or Rust service) that:

- holds the in-memory state machine for all active missions
- exposes a state mutation API (every mutation is an event)
- schedules tasks respecting the task graph and concurrency limits
- enforces budget caps
- gates permission requests through the UI
- writes to the transaction log on every state change
- recovers mission state from the log on restart

#### Orchestrator internals

- **MissionRegistry**: in-memory map of mission_id → MissionState.
- **TaskScheduler**: topological sort of the task graph, parallel dispatch up to the concurrency limit.
- **BudgetMeter**: real-time cost tracking per mission, with warning and hard-stop thresholds.
- **PermissionGate**: queues permission requests, holds the task, awaits user response.
- **EventEmitter**: publishes all state changes to the message bus.
- **LogWriter**: appends every state change to the transaction log.

#### Orchestrator does NOT

- execute tools directly
- call models directly
- read or write the workspace directly
- render UI

### 3. Message Bus

The Message Bus is the only communication channel between components.

**Implementation**: an in-process event emitter for Phase 1 (Node.js EventEmitter or equivalent), with a clear interface that allows replacement with a cross-process bus (NATS, Redis Streams) in later phases without changing component code.

**Event categories**:

| Category       | Examples                                              | Subscribers                  |
|----------------|-------------------------------------------------------|------------------------------|
| Mission events | MISSION_CREATED, MISSION_STATE_CHANGED                | UI, Logger, Brain            |
| Task events    | TASK_DISPATCHED, TASK_STARTED, TASK_COMPLETED, TASK_FAILED | UI, Logger, BudgetMeter      |
| Agent events   | AGENT_LOG, AGENT_THINKING, AGENT_TOOL_CALL            | UI (Live Feed), Logger       |
| Budget events  | BUDGET_WARNING, BUDGET_EXHAUSTED                       | UI, Orchestrator             |
| Permission     | PERMISSION_REQUESTED, PERMISSION_GRANTED, PERMISSION_DENIED | UI, Orchestrator        |
| Tool events    | TOOL_INVOKED, TOOL_RESULT, TOOL_ERROR                  | Logger, Transaction Log      |
| Brain events   | SKILL_PROPOSED, MEMORY_UPDATED                         | UI, Brain                    |

**Event envelope**:

```json
{
  "event_id": "evt_2026_06_13_001",
  "timestamp": "2026-06-13T10:00:00.000Z",
  "type": "TASK_COMPLETED",
  "mission_id": "msn_2026_06_13_001",
  "task_id": "tsk_001",
  "payload": { "outputs": { "files": ["requirements.md"] } }
}
```

**Guarantees**:

- At-least-once delivery (subscribers must be idempotent).
- Ordered delivery per (mission_id, task_id) tuple.
- No cross-mission event ordering guarantee.
- Events are JSON-serializable.

### 4. Agents

An agent is a worker that consumes TASK_DISPATCHED events and emits TASK_COMPLETED or TASK_FAILED.

**Generic agent contract**:

```typescript
interface Agent {
  role: AgentRole;
  model: ModelConfig;
  
  execute(task: Task, context: MissionContext): Promise<TaskResult>;
}
```

**Agent roles** (Phase 1 minimum viable set):

- **Architect**: produces blueprint documents (requirements, architecture).
- **Planner**: decomposes a mission into a task graph.
- **Researcher**: gathers external information via the Search Layer.
- **Coder**: produces source code, modifies files, runs tests.
- **QA**: validates outputs, runs checks, reports defects.
- **Reviewer**: reviews code and artifacts, accepts or rejects.

**Phase 2+**: Designer, Marketing, Automation, Operations.

**Agent lifecycle**:

1. Receive TASK_DISPATCHED event with task inputs and mission context.
2. Load relevant Brain memory (project, skills, preferences).
3. Optionally invoke Search Layer.
4. Optionally invoke tools (filesystem, terminal, web).
5. Produce outputs.
6. Emit TASK_COMPLETED with outputs and cost.
7. Or emit TASK_FAILED with error and retry eligibility.

**Statelessness**: agents hold no state between tasks. All state is in the Orchestrator and the Workspace.

### 5. Tool Registry

Tools are capabilities exposed to agents through a unified interface. Every tool call is a logged event.

**Tool contract**:

```typescript
interface Tool {
  name: string;
  description: string;
  permission_level: 1 | 2 | 3 | 4;
  input_schema: JSONSchema;
  
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}
```

**Phase 1 tools**:

| Tool              | Permission | Notes                                              |
|-------------------|------------|----------------------------------------------------|
| fs.read           | 1          | Read files from workspace.                         |
| fs.write          | 2          | Write files to workspace.                          |
| fs.delete         | 4          | Delete files. Requires explicit approval.          |
| terminal.run      | 3          | Run commands in workspace shell. Whitelist enforced. |
| git.*             | 2-3        | Init, add, commit, push, diff, log.                |
| web.search        | 1          | Delegate to Search Layer.                          |
| web.fetch         | 1          | Fetch a URL and extract content.                   |
| mcp.call          | 2-3        | Call a configured MCP server.                      |

**Phase 2+ tools**: docker, ssh, browser automation (Playwright), image generation, PDF generation, spreadsheet generation, email drafting.

**Tool execution rules**:

- Tools receive a `ToolContext` with the mission workspace path, current user, and permission level.
- Tools cannot escape the workspace unless explicitly authorized.
- Tools emit TOOL_INVOKED before execution and TOOL_RESULT or TOOL_ERROR after.
- Tools are pure: no shared state, no global side effects outside the workspace.

### 6. Search Layer

A platform service that gives all agents (including local models) access to fresh web information.

**Flow**:

```
Agent → SearchService.search(query, options) → Sources → ContextAssembler → Model
```

**SearchService responsibilities**:

- Query construction (optional query rewriting via a small model).
- Multi-provider search (configurable: Brave, Serper, Tavily, or local SearXNG).
- Result ranking and deduplication.
- Content extraction (fetch + extract main text).
- Caching with TTL.

**ContextAssembler responsibilities**:

- Select top-k results.
- Format as a context block (markdown with citations).
- Inject into the model call as a system or user message.

Local models use the Search Layer transparently. The agent does not need to know the model is local — the model router handles context injection.

### 7. Model Router

A thin abstraction over model providers.

**Interface**:

```typescript
interface ModelRouter {
  complete(request: CompletionRequest): Promise<CompletionResult>;
  stream(request: CompletionRequest): AsyncIterable<CompletionChunk>;
  estimateCost(request: CompletionRequest): CostEstimate;
}
```

**Providers** (Phase 1):

- Anthropic (Claude)
- OpenAI (GPT)
- Google (Gemini)
- OpenRouter (any model via single API)
- Ollama (local)

**Routing rules**:

- Per-agent default model (configured globally).
- Per-mission model override (in mission.json).
- Fallback model if primary fails or budget exhausted.
- Cost reported per call, accumulated per task and per mission.

### 8. Workspace

A directory on the user's filesystem, owned by a single mission.

**Path**: `/forge/workspaces/<mission_id>/`

**Layout**:

```
/forge/workspaces/<mission_id>/
├── src/                  # Mission artifacts
├── .forge/
│   ├── mission.json
│   ├── task-graph.json
│   ├── budget.json
│   ├── snapshots/        # Pre-modification backups
│   └── log.ndjson        # Transaction log
```

**Isolation guarantees** (Phase 1, lightweight):

- All tool executions are scoped to the workspace path.
- Paths outside the workspace are rejected by default.
- A `--no-isolation` flag is available for advanced users (with a confirmation dialog).
- Symbolic links pointing outside the workspace are rejected.

**Isolation upgrade** (Phase 2, full sandbox):

- Each mission runs in a Docker container with the workspace bind-mounted.
- Agents execute inside the container.
- The user's host filesystem is untouched.

### 9. Transaction Log

Append-only log of all state-changing events. Lives at `.forge/missions/<mission_id>/log.ndjson`.

**Format**: newline-delimited JSON, one event per line.

**Logged events**:

- MISSION_CREATED
- MISSION_STATE_CHANGED
- TASK_CREATED, TASK_DISPATCHED, TASK_STARTED, TASK_COMPLETED, TASK_FAILED
- TOOL_INVOKED, TOOL_RESULT, TOOL_ERROR
- FILE_SNAPSHOT (path, hash, timestamp)
- FILE_RESTORED (path, snapshot_id, timestamp)
- BUDGET_UPDATE (spent, cap)
- PERMISSION_REQUESTED, PERMISSION_GRANTED, PERMISSION_DENIED

**Replay**: the Orchestrator can rebuild mission state from the log on restart.

**Compaction**: the log is split into segments. After a mission completes, segments are compressed and archived in `.forge/missions/<mission_id>/archive/`.

**Git integration**: if the workspace is a Git repo, the log directory is committed alongside artifacts. This provides a second audit trail.

### 10. Brain

The persistent memory of Forge. Detailed in `brain.md`.

**Phase 1 scope**:

- Project Memory: per-workspace context (stack, conventions, architecture).
- Skill Memory: indexed procedures, versioned, user-approved.
- User Memory: preferences (UI, defaults, model choices).
- Mission Memory: history of completed missions, searchable.

The Brain is queried by agents at task start. Brain updates are proposed by agents and approved by the user (skills) or auto-applied (preferences inferred from user actions).

## Data Flow: A Mission Execution

1. **User launches mission** → UI sends MISSION_CREATED → Orchestrator creates mission in DRAFT.
2. **User submits** → Orchestrator transitions to PLANNING → dispatches Architect + Planner tasks.
3. **Architect produces requirements.md** → TASK_COMPLETED → Orchestrator updates task graph.
4. **Planner produces architecture.md and task graph** → TASK_COMPLETED → Orchestrator transitions to AWAITING_APPROVAL.
5. **User reviews blueprint** → UI shows documents → user clicks Approve → Orchestrator transitions to APPROVED.
6. **Orchestrator transitions to EXECUTING** → TaskScheduler dispatches all PENDING tasks respecting dependencies and concurrency.
7. **Coder agent runs** → invokes tools → produces files → emits TASK_COMPLETED.
8. **QA agent runs** → reviews Coder output → emits TASK_COMPLETED or TASK_FAILED.
9. **Loop continues** until all tasks are terminal → Orchestrator transitions to COMPLETED.
10. **Brain indexes** mission outcomes and any proposed skills.

At any point, the user can:
- pause the mission
- approve a queued permission request
- reject a task output (forces regeneration)
- inject context (propagated to PENDING and RUNNING tasks)
- cancel the mission

## Failure Recovery

- **Orchestrator crash**: on restart, replay log.ndjson to rebuild state. PENDING tasks are re-dispatched. RUNNING tasks are marked BLOCKED and re-dispatched after a grace period.
- **Agent crash**: the task times out after a configurable threshold. The Orchestrator marks it FAILED and applies retry policy.
- **Tool failure**: the TOOL_ERROR event is logged. The agent decides whether to retry, switch approach, or fail the task.
- **Workspace corruption**: the Transaction Log contains FILE_SNAPSHOT entries. The user can restore any file to a prior snapshot.
- **Budget exhaustion**: a BUDGET_EXHAUSTED event pauses the mission. The user can raise the cap, switch to fallback models, or cancel.

## Concurrency Model

- **Within a mission**: max 4 parallel tasks (configurable).
- **Across missions**: each mission is isolated. The Orchestrator can run multiple missions in parallel, each with its own concurrency limit.
- **Agent instances**: agents are stateless and can be instantiated per task. The Model Router may pool connections to providers.
- **Locking**: the Orchestrator holds a per-mission write lock. Multiple readers (UI) can read state via subscriptions.

## Deployment

- **Phase 1**: single binary installer (Electron or Tauri). The Orchestrator runs as a sidecar process. No external services required.
- **Phase 2**: optional Docker-based isolation. The user installs Docker; Forge uses it for mission sandboxes.
- **Phase 3+**: optional cloud sync. Local-first remains the default.

## Open Questions

- Rust vs Node for the Orchestrator? **Decision: Node.js for Phase 1 (faster iteration), Rust rewrite candidate for Phase 2 if performance requires it.**
- Cross-process message bus in Phase 1 or Phase 2? **Decision: in-process for Phase 1, interface designed to allow swap.**
- Git integration: is the workspace always a Git repo, or only when the user opts in? **Decision: opt-in. The Orchestrator does not auto-init Git.**

## Change Log

- 1.0.0 — 2026-06-13 — Initial architecture. Message bus, orchestrator, sandboxing, transaction log.
