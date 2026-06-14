import { chat } from '../model-router.js';
import type { Mission, Task, AgentRole } from '@forge/types';

// ─────────────────────────────────────────────────────────────
// PLANNER AGENT
// Input:  mission.blueprint (requirements + architecture docs)
// Output: a TaskGraph — ordered list of Task objects
//         returned so the runner can register them in the orchestrator
// ─────────────────────────────────────────────────────────────

export interface PlannerOutput {
  tasks: Task[];
}

const VALID_AGENTS: AgentRole[] = [
  'Architect', 'Planner', 'Researcher', 'Coder', 'QA', 'Reviewer', 'Designer', 'Marketing', 'Automation', 'Operations',
];

const VALID_MODELS = ['ollama', 'gpt-4o-mini', 'gpt-4o', 'claude-3-haiku-20240307', 'claude-3-5-sonnet-20241022'];

const SYSTEM_PROMPT = `You are the Planner agent in Forge, an AI agent operating system.
Your role is to read the requirements and architecture documents for a mission and produce a detailed execution plan as a JSON task graph.

Rules:
- Return ONLY valid JSON. No markdown code fences. No explanation. Just the JSON object.
- Tasks must be ordered by dependency (no circular deps).
- Each task must have a clear, specific title and description.
- Choose the best agent for each task. Available agents: Architect, Planner, Researcher, Coder, QA, Reviewer, Designer, Marketing, Automation, Operations.
- Choose a model appropriate to task complexity: gpt-4o-mini for simple tasks, gpt-4o or claude-3-5-sonnet-20241022 for complex reasoning.
- dependencies is an array of task IDs that must complete before this task starts.
- Max 12 tasks per plan. Be focused.

Output schema (JSON):
{
  "tasks": [
    {
      "id": "task_1",
      "title": "Short task title",
      "description": "What exactly this task does and what it produces",
      "agent": "Coder",
      "model": "gpt-4o-mini",
      "dependencies": []
    }
  ]
}`;

function extractJSON(text: string): string {
  // 1. Try to find content within markdown code block
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }

  // 2. Otherwise find the first '{' and last '}'
  const startIdx = text.indexOf('{');
  const endIdx = text.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return text.slice(startIdx, endIdx + 1).trim();
  }

  return text;
}

export async function runPlanner(mission: Mission): Promise<PlannerOutput> {
  console.log(`[Planner] Building task graph for: "${mission.title}"`);

  const context = [
    `Mission: ${mission.title}`,
    `Statement: ${mission.statement}`,
    mission.blueprint.requirements
      ? `\n## Requirements\n${mission.blueprint.requirements}`
      : '',
    mission.blueprint.architecture
      ? `\n## Architecture\n${mission.blueprint.architecture}`
      : '',
  ].join('\n');

  const response = await chat([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: context },
  ], { agent: 'Planner' });

  console.log(
    `[Planner] Response — ${response.usage.input_tokens} in / ${response.usage.output_tokens} out — €${response.usage.cost_eur.toFixed(4)}`,
  );

  const jsonStr = extractJSON(response.content.trim());

  let parsed: { tasks: Array<{
    id: string;
    title: string;
    description: string;
    agent: string;
    model: string;
    dependencies: string[];
  }> };

  try {
    parsed = JSON.parse(jsonStr) as typeof parsed;
  } catch (err) {
    throw new Error(`[Planner] Failed to parse task graph JSON: ${err}\n\nRaw:\n${response.content}`);
  }

  if (!Array.isArray(parsed.tasks)) {
    throw new Error('[Planner] Response missing "tasks" array');
  }

  const now = new Date().toISOString();

  const tasks: Task[] = parsed.tasks.map((t, i) => ({
    id: t.id ?? `task_${i + 1}`,
    mission_id: mission.id,
    title: t.title,
    description: t.description,
    agent: (VALID_AGENTS.includes(t.agent as AgentRole) ? t.agent : 'Coder') as AgentRole,
    model: VALID_MODELS.includes(t.model) ? t.model : 'gpt-4o-mini',
    state: 'PENDING',
    dependencies: Array.isArray(t.dependencies) ? t.dependencies : [],
    inputs: {},
    outputs: {},
    attempts: 0,
    max_attempts: 3,
    cost_eur: 0,
    duration_ms: 0,
    created_at: now,
    updated_at: now,
    error: null,
    idempotency_key: `${mission.id}_${t.id ?? i}`,
  }));

  console.log(`[Planner] Produced ${tasks.length} tasks`);
  return { tasks };
}
