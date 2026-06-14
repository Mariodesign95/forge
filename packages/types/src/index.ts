// ─────────────────────────────────────────────────────────────
// FORGE AGENT OS — Shared Types
// Single source of truth for all packages.
// Derived from: docs/mission-protocol.md, docs/architecture.md
// ─────────────────────────────────────────────────────────────

// ── Mission ──────────────────────────────────────────────────

export type MissionState =
  | 'DRAFT'
  | 'PLANNING'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'EXECUTING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface MissionBudget {
  cap_eur: number;
  spent_eur: number;
  fallback_model: string | null;
}

export interface MissionPermissions {
  level: 1 | 2 | 3 | 4;
  autonomous_run: boolean;
}

export interface MissionBlueprint {
  requirements: string | null;
  architecture: string | null;
  design: string | null;
  brand: string | null;
  landing: string | null;
  marketing: string | null;
  seo: string | null;
  user_personas: string | null;
}

export interface Mission {
  id: string;
  title: string;
  statement: string;
  state: MissionState;
  created_at: string;
  updated_at: string;
  owner: string;
  workspace: string;
  blueprint: MissionBlueprint;
  task_graph: Task[];
  budget: MissionBudget;
  permissions: MissionPermissions;
}

// ── Task ──────────────────────────────────────────────────────

export type TaskState =
  | 'PENDING'
  | 'DISPATCHED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'SKIPPED'
  | 'ESCALATED';

export type AgentRole =
  | 'Architect'
  | 'Planner'
  | 'Researcher'
  | 'Coder'
  | 'QA'
  | 'Reviewer'
  | 'Designer'
  | 'Marketing'
  | 'Automation'
  | 'Operations';

export interface Task {
  id: string;
  mission_id: string;
  title: string;
  agent: AgentRole;
  model: string;
  dependencies: string[];
  state: TaskState;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  cost_eur: number;
  duration_ms: number;
  error: string | null;
  idempotency_key: string;
  description: string;
  created_at: string;
  updated_at: string;
}

// ── Events (Message Bus) ──────────────────────────────────────

export type ForgeEventType =
  // Mission
  | 'MISSION_CREATED'
  | 'MISSION_STATE_CHANGED'
  // Task
  | 'TASK_CREATED'
  | 'TASK_DISPATCHED'
  | 'TASK_STARTED'
  | 'TASK_COMPLETED'
  | 'TASK_FAILED'
  // Agent
  | 'AGENT_LOG'
  | 'AGENT_THINKING'
  | 'AGENT_TOOL_CALL'
  // Budget
  | 'BUDGET_UPDATE'
  | 'BUDGET_WARNING'
  | 'BUDGET_SOFT_STOP'
  | 'BUDGET_HARD_STOP'
  // Permission
  | 'PERMISSION_REQUESTED'
  | 'PERMISSION_GRANTED'
  | 'PERMISSION_DENIED'
  // Tool
  | 'TOOL_INVOKED'
  | 'TOOL_RESULT'
  | 'TOOL_ERROR'
  // Brain
  | 'SKILL_PROPOSED'
  | 'MEMORY_UPDATED';

export interface ForgeEvent {
  event_id: string;
  timestamp: string;
  type: ForgeEventType;
  mission_id: string;
  task_id?: string;
  payload: Record<string, unknown>;
}

// ── Agent Live Feed ───────────────────────────────────────────

export interface LiveFeedEntry {
  id: string;
  timestamp: string;
  mission_id: string;
  task_id?: string;
  agent?: AgentRole;
  message: string;
  provider?: string;
  model?: string;
  cost_eur?: number;
  tokens?: { input: number; output: number };
  type: 'info' | 'tool' | 'model_call' | 'error' | 'success';
}

// ── Tools ─────────────────────────────────────────────────────

export type PermissionLevel = 1 | 2 | 3 | 4;

export type ToolName =
  | 'fs.read'
  | 'fs.write'
  | 'fs.delete'
  | 'terminal.run'
  | 'git.status'
  | 'git.commit'
  | 'git.diff'
  | 'web.search'
  | 'web.fetch'
  | 'mcp.call';

export interface ToolContext {
  workspace_root: string;
  mission_id: string;
  permission_level: PermissionLevel;
}

export interface ToolResult {
  success: boolean;
  output: unknown;
  error?: string;
  cost_eur?: number;
}

// ── Model Router ──────────────────────────────────────────────

export type ModelProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'openrouter'
  | 'ollama';

export interface ModelConfig {
  provider: ModelProvider;
  model: string;
  fallback?: ModelConfig;
}

export interface CostEstimate {
  low_eur: number;
  high_eur: number;
  estimated: boolean;
}

// ── IPC (Extension ↔ Orchestrator) ───────────────────────────

export type IpcMessageType =
  | 'CREATE_MISSION'
  | 'TRANSITION_MISSION'
  | 'GET_MISSION'
  | 'LIST_MISSIONS'
  | 'APPROVE_MISSION'
  | 'PAUSE_MISSION'
  | 'CANCEL_MISSION'
  | 'APPROVE_PERMISSION'
  | 'DENY_PERMISSION'
  | 'GET_LIVE_FEED'
  | 'SUBSCRIBE_EVENTS'
  | 'ADD_TASK'
  | 'UPDATE_TASK'
  | 'RECORD_COST'
  | 'GET_SETTINGS'
  | 'SAVE_SETTINGS'
  | 'GET_LOCAL_MODELS';

export interface IpcMessage {
  id: string;
  type: IpcMessageType;
  payload: Record<string, unknown>;
}

export interface IpcResponse {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
