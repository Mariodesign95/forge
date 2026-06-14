import fs from 'node:fs';
import path from 'node:path';
import { chat } from '../model-router.js';
import type { Mission, Task } from '@forge/types';
import { fsWrite, fsRead, fsList, terminalRun } from '@forge/orchestrator/tools';

// ─────────────────────────────────────────────────────────────
// CODER AGENT
// Executes a single Task of type CODE/BUILD/IMPLEMENT.
// Loop: plan → write → verify (up to 3 retries on failure)
// Uses tools: fs.write, fs.read, fs.list, terminal.run
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Coder agent in Forge, an AI agent operating system.
You execute coding tasks by writing files to the workspace.

You have access to these tools (call them by outputting JSON actions):
- fs.write: write content to a file
- fs.read:  read file content
- fs.list:  list directory contents
- terminal.run: run a shell command (e.g. npm install, tsc, etc.)

At each step, output a JSON action block:

{"action": "fs.write", "path": "src/index.ts", "content": "...file content..."}
{"action": "fs.read", "path": "src/index.ts"}
{"action": "fs.list", "path": "src"}
{"action": "terminal.run", "command": "npm install"}
{"action": "done", "summary": "What was accomplished"}

Rules:
- Work step by step. One action per response.
- Always end with {"action": "done", "summary": "..."} when the task is complete.
- If a command fails, try to fix the error before giving up.
- Write production-quality code, not stubs.
- Max 20 steps per task.`;

interface ActionBlock {
  action: 'fs.write' | 'fs.read' | 'fs.list' | 'terminal.run' | 'done';
  path?: string;
  content?: string;
  command?: string;
  summary?: string;
}

function parseAction(raw: string): ActionBlock | null {
  // Try to extract first JSON object from the response
  const match = raw.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as ActionBlock;
  } catch {
    return null;
  }
}

export async function runCoder(mission: Mission, task: Task): Promise<string> {
  console.log(`[Coder] Starting task: "${task.title}"`);

  const ctx = {
    mission_id: mission.id,
    task_id: task.id,
    workspace_root: mission.workspace,
    permission_level: mission.permissions.level as 1 | 2 | 3 | 4,
  };

  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `Task: ${task.title}`,
        `Description: ${task.description}`,
        `Workspace: ${mission.workspace}`,
        '',
        'Begin. Output the first action JSON block.',
      ].join('\n'),
    },
  ];

  let steps = 0;
  const MAX_STEPS = 20;

  while (steps < MAX_STEPS) {
    steps++;

    const response = await chat(messages, { preferLocal: false, agent: 'Coder' }); // prefer API models for coding
    const raw = response.content;

    console.log(`[Coder] Step ${steps}: ${raw.slice(0, 120).replace(/\n/g, ' ')}…`);

    messages.push({ role: 'assistant', content: raw });

    const action = parseAction(raw);

    if (!action) {
      // Model returned prose — ask it to output an action
      messages.push({ role: 'user', content: 'Output a JSON action block to continue.' });
      continue;
    }

    if (action.action === 'done') {
      console.log(`[Coder] Task complete: ${action.summary}`);
      return action.summary ?? 'Task completed';
    }

    // Execute action and feed result back
    let toolResult: string;

    try {
      if (action.action === 'fs.write' && action.path && action.content !== undefined) {
        const result = await fsWrite(action.path, action.content, ctx);
        toolResult = result.success ? `Written: ${result.output}` : `Error: ${result.error}`;

      } else if (action.action === 'fs.read' && action.path) {
        const result = await fsRead(action.path, ctx);
        toolResult = result.success
          ? `Content:\n${result.output as string}`
          : `Error: ${result.error}`;

      } else if (action.action === 'fs.list' && action.path) {
        const result = await fsList(action.path, ctx);
        toolResult = result.success
          ? `Files: ${JSON.stringify(result.output)}`
          : `Error: ${result.error}`;

      } else if (action.action === 'terminal.run' && action.command) {
        const result = await terminalRun(action.command, ctx, 120_000);
        toolResult = result.success
          ? `Exit 0\nstdout: ${result.stdout}\nstderr: ${result.stderr}`
          : `Exit ${result.exitCode}\nError: ${result.error}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`;

      } else {
        toolResult = `Unknown action or missing parameters: ${JSON.stringify(action)}`;
      }
    } catch (err) {
      toolResult = `Tool threw exception: ${String(err)}`;
    }

    messages.push({ role: 'user', content: `Tool result: ${toolResult}\n\nContinue. Output next action JSON block, or {"action": "done"} if finished.` });
  }

  throw new Error(`[Coder] Task exceeded ${MAX_STEPS} steps without completing`);
}
