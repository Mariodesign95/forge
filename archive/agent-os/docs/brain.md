# Brain

Version: 1.0.0
Status: Draft
Owner: Forge Core
Depends on: mission-protocol.md, architecture.md

## Purpose

Define the persistent memory system of Forge. The Brain replaces the generic "context window" approach used by current AI editors. It is structured, queryable, versioned and curated. This document specifies the four memory stores, the criteria for skill generation, the validation and approval workflow, and the versioning scheme.

## Design Principles

1. **Structured over opaque**: memory is organized into typed stores. The Brain is a database, not a bag of embeddings.
2. **Curated over accumulated**: every entry is either user-authored, user-approved, or auto-derived from explicit user actions. No silent growth.
3. **Queryable**: agents retrieve memory through typed queries, not free-form similarity search alone.
4. **Versioned**: every memory entry has a version. Updates never destroy history.
5. **Local**: the Brain lives on the user's filesystem. No external sync in Phase 1-2.
6. **Inspectable**: the user can browse, edit, export and delete any memory entry from the UI.

## The Four Memory Stores

### 1. Project Memory

**Scope**: per workspace. Bound to a directory (typically the workspace root).

**Contents**:
- Stack (languages, frameworks, runtimes, package managers)
- Architecture (components, layers, data flow)
- Conventions (naming, formatting, testing, commit style)
- Key files and their roles
- External dependencies and their configurations
- Known constraints (license, deployment target, performance budget)

**Source**:
- Auto-derived at mission start by the Architect agent reading the workspace
- Updated incrementally as missions produce new artifacts
- Manually editable by the user from the Brain UI

**Format**: structured JSON + markdown documents.

**Storage**: `.forge/brain/projects/<project_id>/`

**Example entry**:

```json
{
  "id": "proj_001_stack",
  "type": "stack",
  "version": 2,
  "data": {
    "language": "TypeScript",
    "framework": "Next.js 14",
    "runtime": "Node.js 20",
    "package_manager": "pnpm",
    "database": "PostgreSQL",
    "orm": "Prisma"
  },
  "source": "derived",
  "updated_at": "2026-06-13T10:00:00Z"
}
```

### 2. Skill Memory

**Scope**: global (user-wide) or per project. Phase 1 supports per-project skills; global skills are Phase 2.

**Contents**: reusable procedures that an agent discovered and that solved a non-trivial problem.

**Format**: structured procedure with inputs, steps, outputs, success criteria.

**Storage backend**: **SQLite** (single file at `.forge/brain/skills.db`), with full-text search enabled via FTS5.

#### Why SQLite

- **Single file, fully portable**: `.forge/brain/skills.db` is copied to another machine and works identically. No server, no daemon, no installation.
- **Queryable**: SQL gives us "skills used in the last 30 days", "skills with success rate < 0.5", "skills tagged deployment AND docker" out of the box.
- **Fast**: indexed lookups, FTS5 for text search, no read overhead even with thousands of skills.
- **Safe**: WAL mode + fsync gives crash safety; ACID transactions prevent partial writes.
- **Zero infrastructure**: a single npm dependency (`better-sqlite3` for Node, or `rusqlite` for Rust).
- **Human-inspectable**: a CLI (`forge brain skills list`, `forge brain skills show <id>`) and a JSON export (`forge brain export --format json`) cover the "open it in a text editor" use case.

JSON-on-disk was the alternative. Rejected because: query implementation is custom, indexing is manual, and aggregation (success rates, usage windows) becomes a full-time engineering project. SQLite is the boring, correct choice.

#### Schema

The database has three tables: `skills`, `skill_versions`, and `skill_invocations`.

```sql
CREATE TABLE skills (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  scope           TEXT NOT NULL CHECK(scope IN ('global', 'project')),
  project_id      TEXT,
  current_version TEXT NOT NULL,
  state           TEXT NOT NULL CHECK(state IN ('active', 'pending', 'rejected', 'archived')),
  author          TEXT NOT NULL,
  source_mission  TEXT,
  tags            TEXT NOT NULL DEFAULT '[]',  -- JSON array
  inputs_schema   TEXT NOT NULL DEFAULT '{}',  -- JSON Schema
  outputs_schema  TEXT NOT NULL DEFAULT '{}',  -- JSON Schema
  success_criteria TEXT NOT NULL DEFAULT '[]', -- JSON array
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  archived_at     TEXT,
  archive_reason  TEXT
);

CREATE TABLE skill_versions (
  skill_id        TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version         TEXT NOT NULL,              -- semver
  steps           TEXT NOT NULL,              -- JSON array
  notes           TEXT,
  created_at      TEXT NOT NULL,
  created_by      TEXT NOT NULL,
  PRIMARY KEY (skill_id, version)
);

CREATE TABLE skill_invocations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  skill_id        TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version         TEXT NOT NULL,
  mission_id      TEXT NOT NULL,
  task_id         TEXT NOT NULL,
  started_at      TEXT NOT NULL,
  completed_at    TEXT,
  outcome         TEXT CHECK(outcome IN ('success', 'failure', 'cancelled', 'timeout')),
  error           TEXT,
  duration_ms     INTEGER
);

CREATE INDEX idx_skills_state ON skills(state);
CREATE INDEX idx_skills_scope ON skills(scope, project_id);
CREATE INDEX idx_invocations_skill ON skill_invocations(skill_id, started_at);
CREATE INDEX idx_invocations_mission ON skill_invocations(mission_id);

-- Full-text search over name, tags, steps
CREATE VIRTUAL TABLE skills_fts USING fts5(
  skill_id UNINDEXED,
  name,
  tags,
  steps,
  content='skills',
  content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER skills_ai AFTER INSERT ON skills BEGIN
  INSERT INTO skills_fts(rowid, skill_id, name, tags, steps)
  VALUES (new.rowid, new.id, new.name, new.tags,
          (SELECT steps FROM skill_versions WHERE skill_id = new.id AND version = new.current_version));
END;
```

#### Storage location

```
.forge/brain/
├── skills.db              -- SQLite database (the source of truth)
├── skills.db-wal          -- Write-ahead log (do not delete while running)
├── skills.db-shm          -- Shared memory file (do not delete while running)
└── exports/               -- Optional JSON exports created by `forge brain export`
    └── skills-2026-06-13.json
```

WAL mode is enabled at database initialization. The `.db-wal` and `.db-shm` files are created automatically and must not be deleted while Forge is running.

#### Backup and portability

- **Manual backup**: copy `skills.db` (Forge flushes WAL on graceful shutdown).
- **Automated backup**: Forge snapshots `skills.db` to `.forge/brain/backups/skills-<timestamp>.db` on a configurable schedule (default: daily, keep last 7).
- **Migration to another machine**: copy `skills.db` to the same path on the target machine. No schema migration needed for Phase 1; the schema is embedded in the application and applied with `CREATE TABLE IF NOT EXISTS`.
- **Export for inspection**: `forge brain export --format json --output skills.json` produces a single JSON file with all skills and their current version, suitable for reading in any editor or version-controlling alongside the project.

**This is the most sensitive store. See Skill Lifecycle below.**

### 3. User Memory

**Scope**: global, per user.

**Contents**:
- UI preferences (theme, density, default views)
- Default models per agent role
- Default budget caps
- Communication style (verbose vs concise, formal vs casual)
- Common constraints (no Tailwind, prefer pnpm, dark mode default)
- Recurring corrections (e.g., "always use semicolons", "never use any")

**Source**:
- Explicitly set by the user
- Inferred from repeated user actions (e.g., user always rejects verbose output → preference for concise)

**Storage**: `.forge/brain/user/`

**Format**: flat key-value with typed values.

**Example**:

```json
{
  "preferences": {
    "ui.theme": "dark",
    "ui.density": "compact",
    "code.style.semicolons": true,
    "code.style.indentation": "spaces:2",
    "models.coder.default": "qwen2.5-coder:32b",
    "models.architect.default": "claude-opus-4",
    "budget.default_cap_eur": 5.0,
    "communication.verbosity": "concise"
  },
  "corrections": [
    {
      "pattern": "uses `var` in TypeScript",
      "correction": "always use `const` or `let`",
      "occurrences": 3,
      "auto_applied": true
    }
  ]
}
```

### 4. Mission Memory

**Scope**: global, indexed.

**Contents**:
- Mission title and statement
- Final blueprint documents (archived)
- Task graph with outcomes (completed, failed, duration, cost)
- Decisions made (architectural choices, tradeoffs)
- Skills acquired during the mission
- User feedback (rejections, modifications)

**Source**: every completed mission is indexed at mission close.

**Storage**: `.forge/brain/missions/`

**Format**: searchable index + per-mission archive directory.

**Purpose**: future missions query Mission Memory for similar past work, past decisions and past failures. This is the primary mechanism for "Forge remembers what you did before."

## Skill Lifecycle (Critical Section)

The Skill Memory is the only store that can grow without explicit user action. It needs the most rigorous controls.

### Step 1: Detection

A skill is proposed when an agent task meets **at least three** of the following criteria:

| Criterion                       | Threshold                              |
|---------------------------------|----------------------------------------|
| Duration                        | > 5 minutes wall-clock                 |
| Retries                         | >= 2 retries on the same task          |
| Tool call failures              | >= 3 tool errors before success        |
| Human intervention              | >= 1 user message required to unblock  |
| Novelty                         | no matching skill in Skill Memory      |
| Reusability signal              | inputs/outputs generalize beyond the specific mission |

If criteria are met, the agent emits a `SKILL_PROPOSED` event with:
- task summary
- solution steps
- inputs and outputs
- success criteria
- suggested tags

### Step 2: Validation

The proposal is **not** added to Skill Memory automatically. It is inserted into the `skills` table with `state = 'pending'`.

The pending skill is reviewed by:
1. The user, in the Brain UI, with a clear summary of what the skill does and when it would be used.
2. Optionally, a second agent pass (a "skill reviewer") that checks for correctness, generality, and safety.

### Step 3: Approval

The user has three options:
- **Approve**: the skill's state is set to `active` and assigned version `1.0.0`.
- **Approve with edits**: the user modifies the skill before approval.
- **Reject**: the skill's state is set to `rejected`. It is retained in the database for audit, never executed.

### Step 4: Versioning

Skills use semantic versioning: MAJOR.MINOR.PATCH.

- **MAJOR**: breaking change to inputs, outputs, or core behavior.
- **MINOR**: backward-compatible addition (new optional input, new step).
- **PATCH**: typo fix, clarification, no behavior change.

When a skill is updated, the previous version is retained in the `skill_versions` table. Agents can pin to a specific version if needed.

### Step 5: Usage Tracking

Every time a skill is invoked, the Brain updates:
- `metrics.times_used`
- `metrics.last_used`
- `metrics.success_rate` (rolling window of last 20 invocations)

A skill's state is set to `archived` (with `archive_reason` recorded) if:
- `times_used` == 0 for 90 days, OR
- `success_rate` < 0.5 over 20 invocations, OR
- the user explicitly archives it.

Archived skills are not deleted. They can be restored by the user.

### Step 6: Conflict Resolution

If two skills apply to the same situation, the agent picks:
1. The most recently used successful skill.
2. The skill with the highest success rate.
3. The skill with the most specific scope (per-project beats global).

The user can explicitly mark a skill as preferred.

## Querying the Brain

Agents query the Brain at task start. The query interface:

```typescript
interface BrainQuery {
  project?: { id: string };
  user?: { id: string };
  mission?: { id: string };
  skills?: {
    tags?: string[];
    name_pattern?: string;
    min_success_rate?: number;
  };
}

interface BrainResult {
  project?: ProjectMemory;
  user?: UserMemory;
  skills: SkillMemory[];
  similar_missions: MissionMemory[];
}
```

**Implementation Phase 1**: SQLite database at `.forge/brain/skills.db` (see Skill Memory section for schema, WAL mode, FTS5 index). No external database server. JSON export available via `forge brain export`.

**Implementation Phase 2**: SQLite-backed index for larger skill libraries. Still local.

**Implementation Phase 3+**: optional remote sync, encrypted at rest.

## Privacy and Export

- The entire Brain lives under `.forge/brain/`.
- The user can export it as a single tarball at any time.
- The user can import a Brain tarball (with conflict resolution prompts).
- The user can wipe any store independently.
- No Brain content is sent to external services. Skills and memories are local. (Model calls to providers do not include the full Brain — only the relevant query result.)

## UI Surface

The Brain UI is a dedicated panel in Forge:

- **Projects tab**: list of known projects, click to inspect.
- **Skills tab**: list of active skills, pending proposals, archived skills.
- **Preferences tab**: user preferences and corrections.
- **Missions tab**: searchable history of past missions.

Every entry is editable, exportable, and deletable.

## CLI Surface

For terminal-first users and for scripting, Forge exposes a `forge brain` command group. The Brain is a database, but the CLI is the human-friendly view.

```
forge brain skills list [--state active|pending|rejected|archived] [--tag <tag>] [--json]
forge brain skills show <skill_id>                    # show current version
forge brain skills show <skill_id> --version <v>      # show historical version
forge brain skills approve <skill_id> [--edit-file <path>]
forge brain skills reject <skill_id> --reason "<text>"
forge brain skills archive <skill_id> --reason "<text>"
forge brain skills search "<query>"                   # FTS5 over name/tags/steps
forge brain skills stats                              # usage stats, success rates
forge brain skills invocations <skill_id> [--since 30d]
forge brain export --format json --output <path>     # full dump, readable in any editor
forge brain export --format json --skill <skill_id>   # single skill export
forge brain import <path>                             # import JSON dump (with conflict prompts)
forge brain backup                                    # snapshot skills.db to backups/
forge brain restore <backup_file>                     # restore from snapshot
```

The CLI is the same code path the UI uses — there is no "UI logic" vs "CLI logic" split. CLI output is JSON when `--json` is passed, making it scriptable.

## Open Questions

- Should skills be shareable across users in Phase 1? **Decision: no. Phase 2 with team features.**
- Should the Brain index external docs (e.g., framework documentation)? **Decision: optional in Phase 2, off by default.**
- Auto-apply inferred preferences? **Decision: yes, with a clear "inferred preferences" section the user can review and revert.**

## Change Log

- 1.0.0 — 2026-06-13 — Initial Brain spec. Four stores, skill lifecycle, versioning, query interface.
- 1.1.0 — 2026-06-13 — Skill Memory storage specified: SQLite at `.forge/brain/skills.db` with FTS5, WAL mode, JSON export, CLI surface.
