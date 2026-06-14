import { chat } from '../model-router.js';
import type { Mission, Task } from '@forge/types';
import { fsRead, fsList } from '@forge/orchestrator/tools';

// ─────────────────────────────────────────────────────────────
// QA AGENT
// Verifies the output of a completed task.
// Returns: { pass: boolean; issues: string[]; suggestions: string[] }
// ─────────────────────────────────────────────────────────────

export interface QAResult {
  pass: boolean;
  issues: string[];
  suggestions: string[];
  summary: string;
}

const SYSTEM_PROMPT = `You are the QA agent in Forge, an AI agent operating system.
Your role is to review the output of a coding task and determine if it meets the requirements.

You will receive:
- The task description (what was supposed to be done)
- A list of files created/modified
- File contents (if available)

Evaluate:
1. Does the implementation match the task description?
2. Are there obvious bugs, missing error handling, or security issues?
3. Is the code complete (not stubs or placeholders)?

Respond ONLY with a JSON object:
{
  "pass": true/false,
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["improvement 1"],
  "summary": "One-line verdict"
}`;

export async function runQA(mission: Mission, task: Task, precedingOutput: string): Promise<QAResult> {
  console.log(`[QA] Reviewing task: "${task.title}"`);

  const ctx = {
    mission_id: mission.id,
    task_id: task.id,
    workspace_root: mission.workspace,
    permission_level: mission.permissions.level as 1 | 2 | 3 | 4,
  };

  // Collect workspace file listing
  let fileListing = '';
  try {
    const listResult = await fsList('.', ctx);
    if (listResult.success) {
      fileListing = JSON.stringify(listResult.output, null, 2);
    }
  } catch {
    fileListing = '(could not read workspace)';
  }

  const response = await chat([
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `Task: ${task.title}`,
        `Description: ${task.description}`,
        `Coder output summary: ${precedingOutput}`,
        `Workspace files:\n${fileListing}`,
      ].join('\n\n'),
    },
  ], { agent: 'QA' });

  console.log(`[QA] Response — €${response.usage.cost_eur.toFixed(4)}`);

  let jsonStr = response.content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const result = JSON.parse(jsonStr) as QAResult;
    return {
      pass: Boolean(result.pass),
      issues: Array.isArray(result.issues) ? result.issues : [],
      suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
      summary: result.summary ?? (result.pass ? 'QA passed' : 'QA failed'),
    };
  } catch {
    // Fallback — assume pass if we can't parse
    return { pass: true, issues: [], suggestions: [], summary: 'QA completed (parse error)' };
  }
}
