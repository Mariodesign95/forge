# Security

Version: 1.0.0
Status: Draft
Owner: Forge Core
Depends on: mission-protocol.md, architecture.md

## Purpose

Define the security model of Forge. This document specifies the permission levels, the sandboxing model, the approval workflow, the transaction log guarantees, the Security Center UI, and the threat model.

## Threat Model

Forge operates on the user's machine with access to:
- the user's filesystem (within the workspace)
- the user's terminal (with user permissions)
- the user's network (for model calls, web search, MCP)
- the user's API keys (OpenAI, Anthropic, etc.)
- external services via MCP (databases, CRMs, cloud infrastructure)

The threat model considers:

| Threat                                          | Mitigation in this document                          |
|-------------------------------------------------|------------------------------------------------------|
| Malicious prompt injection from web content     | Sanitization, untrusted-context flag                 |
| Agent runaway (infinite loop, excessive calls)  | Time and step limits per task                        |
| Accidental destructive operations               | Permission levels 3-4 require explicit approval      |
| Cross-mission data leak                         | Workspace isolation, no shared state                 |
| API key exfiltration                             | Keys stored in OS keychain, never logged             |
| Supply chain attack via MCP                     | MCP allowlist, user-approved servers only            |
| Filesystem escape                                | Workspace scoping enforced at tool layer             |
| Model provider compromise                        | Per-call payload limits, output sanitization         |
| User error (wrong deploy, wrong delete)         | Transaction log, snapshot, easy rollback              |

## Permission Levels

Forge defines four permission levels, escalating in risk.

### Level 1 — Read

**Examples**:
- Reading files in the workspace
- Listing directories
- Reading git history
- Web search
- Web fetch
- Reading MCP resources

**Approval**: none required. Runs autonomously.

**Logging**: TOOL_INVOKED and TOOL_RESULT logged. No file snapshots.

### Level 2 — Modify

**Examples**:
- Writing or modifying files in the workspace
- Creating new files
- Git add, commit, branch, push to a user-approved remote
- Creating MCP resources

**Approval**: none required by default. The user can set a global "approve all writes" toggle in the Security Center.

**Logging**: TOOL_INVOKED, TOOL_RESULT, and FILE_SNAPSHOT (pre-modification hash and content) logged. The transaction log is the audit trail.

**Rollback**: any file can be restored to a prior snapshot via the UI.

### Level 3 — System

**Examples**:
- Running terminal commands
- Installing packages (npm install, pip install, brew install)
- Running Docker commands
- Git push to non-approved remotes
- Calling MCP tools with side effects

**Approval**: **required** before each invocation. The user sees the exact command and confirms in the UI.

**Logging**: full command logged with stdout, stderr, exit code, and timestamp.

**Safeguards**:
- A whitelist of allowed commands is configurable per workspace.
- A blacklist of always-blocked commands is hardcoded (e.g., `rm -rf /`, `mkfs`, `dd if=`, fork bombs).
- Commands are run in the workspace directory, not the user's home.

**Autonomous run mode**: if the user enables "autonomous run" for a mission, all Level 3 actions in that mission are pre-approved by a single explicit consent at mission start. The consent is logged.

### Level 4 — Destructive

**Examples**:
- Deleting files
- Dropping database tables
- SSH commands
- Production deployments
- Force push to Git
- Irreversible cloud operations (S3 delete, RDS delete)

**Approval**: **required, with explicit typed confirmation**. The user must type the target name (e.g., the file path, the deployment target) to confirm. No "yes/no" clicks for Level 4.

**Logging**: full action logged with user confirmation text, timestamp, and result.

**Safeguards**:
- Pre-action snapshot mandatory for file operations.
- SSH and deployments are off by default and must be enabled per workspace.
- A "dry-run" mode is available for any Level 4 action.

**Autonomous run mode**: Level 4 actions are **never** covered by autonomous consent. Each action requires explicit approval, even in autonomous mode.

## Permission Decision Flow

```
Agent requests tool invocation
        |
        v
+-----------------------+
| Tool permission level |
+-----------------------+
        |
        +-- Level 1 --> Execute
        |
        +-- Level 2 --> Execute (if writes-allowed)
        |              |
        |              +-- writes-disallowed --> Request approval
        |
        +-- Level 3 --> Request approval
        |              |
        |              +-- autonomous run + pre-approved --> Execute
        |
        +-- Level 4 --> Request typed confirmation
                       |
                       +-- (never pre-approved)
```

The Orchestrator's PermissionGate queues requests, displays them in the UI, and holds the task until the user responds. A timeout policy applies: if the user does not respond within a configurable window (default 10 minutes for Level 3, 24 hours for Level 4), the request is denied and the task fails.

## Sandboxing

### Phase 1: Lightweight isolation

- All tool executions receive a `ToolContext` with the workspace root path.
- File system tools reject any path outside the workspace.
- Symbolic links pointing outside the workspace are rejected.
- Terminal commands are executed with the workspace as the working directory.
- A `--no-isolation` flag exists for advanced users and requires a confirmation dialog on first use per workspace.

### Phase 2: Container-based isolation

- Each mission can opt into running inside a Docker container.
- The workspace is bind-mounted into the container.
- The container has no network access by default; the Search Layer and model calls go through a controlled proxy.
- The container is destroyed at mission end (configurable: archive or delete).
- Docker-in-Docker is available for missions that need to run Docker themselves (e.g., test stacks).

### Phase 3: Per-agent isolation (optional)

- Each agent runs in its own container or micro-VM.
- Communication is restricted to the message bus.
- Cost: higher startup latency, higher resource use. Opt-in per mission.

## Transaction Log Guarantees

The transaction log is the foundation of recoverability and audit.

**Properties**:
- **Append-only**: events are never modified or deleted (except during log compaction after mission close).
- **Atomic writes**: each event is written as a single line; the write is fsync'd before the operation it represents completes.
- **Tamper-evident**: an optional hash chain links each event to the previous (event N contains hash of event N-1). The user can verify integrity with a CLI command.
- **Versioned**: log segments are committed to Git if the workspace is a Git repo.
- **Inspectable**: the user can view the log in the Security Center, filter by event type, and export it.

**Snapshot policy**:
- Before any Level 2 file write, the original file content is captured as a FILE_SNAPSHOT event.
- Snapshots are deduplicated by content hash.
- Snapshots older than 30 days are garbage-collected (configurable).

**Rollback**:
- File rollback: restore any file to any prior snapshot.
- Mission rollback: revert the workspace to the state at any log event.
- Rollback operations are themselves logged as FILE_RESTORED or MISSION_RESTORED events.

## Secret Management

- API keys are stored in the OS keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux).
- Keys are never written to logs, transaction logs, or workspace files.
- Keys are loaded into the Model Router at startup and held in memory only.
- Keys are never passed to agents as inputs; agents receive a `ModelRouter` interface that injects the key at call time.
- The user can rotate keys from the Security Center.

## MCP Security

- MCP servers are configured by the user, never auto-discovered.
- Each MCP server has a trust level: `untrusted`, `trusted`, `verified`.
- `untrusted` servers cannot be called in autonomous mode.
- `verified` servers have been audited by Forge (Phase 3+).
- MCP tool calls follow the same permission level rules as built-in tools.
- The user can inspect every MCP call in the live feed and transaction log.

## Prompt Injection Defense

- Web content fetched by the Search Layer is wrapped in a clear delimiter and labeled as `untrusted-context` in the model prompt.
- Agents are instructed to treat untrusted content as data, not as instructions.
- The Architect agent's system prompt includes a defense-in-depth reminder against instruction injection.
- A heuristic detector flags suspicious patterns in fetched content (e.g., "ignore previous instructions"). Flagged content is summarized by a sanitization step before being passed to the model.
- Phase 2: full structured prompt assembly with explicit role separation.

## Security Center UI

A dedicated panel in Forge for security and governance:

- **Activity tab**: real-time stream of all tool invocations across all missions.
- **Approvals tab**: pending permission requests, with approve/deny and a comment field.
- **Log tab**: searchable transaction log with filters by event type, agent, time range.
- **Rollback tab**: file browser with snapshot timeline, rollback action.
- **Keys tab**: API key management (add, remove, rotate).
- **Policies tab**: permission level defaults, command whitelist/blacklist, autonomous run settings.
- **Audit tab**: export full audit trail as JSON or CSV.

## Autonomous Run Mode

The user can launch a mission in autonomous mode with explicit, mission-scoped consent.

**Consent manifest** (shown to user at launch):

```
Mission: Create a plumber website with booking
Autonomous actions pre-approved:
  - File writes in /forge/workspaces/msn_001
  - Terminal commands for: npm install, npm test, npm run build
  - Git operations in /forge/workspaces/msn_001
  - Deploys to staging environment (not production)
  - Web searches and web fetches

NOT pre-approved (require explicit approval):
  - File deletions
  - SSH commands
  - Production deploys
  - Force push
  - Any action on a path outside /forge/workspaces/msn_001

Budget cap: €5.00
Duration cap: 2 hours

[Confirm] [Edit] [Cancel]
```

The user can edit the consent manifest before confirming. The consent is logged as PERMISSION_GRANTED with the full manifest.

## Open Questions

- Should Level 2 writes be approval-gated by default? **Decision: no, only if user enables in Policies. Default is autonomous writes within workspace.**
- Should the transaction log be encrypted at rest? **Decision: Phase 3 with team features (encryption keys are a team concern). Local single-user does not require it.**
- Should we support a "paranoid mode" where every Level 2 action also requires approval? **Decision: yes, toggle in Policies.**

## Change Log

- 1.0.0 — 2026-06-13 — Initial security spec. Permission levels, sandboxing, transaction log, secret management, MCP, prompt injection defense, autonomous mode.
