import WebSocket from 'ws';
import type { Mission, Task, ForgeEvent } from '@forge/types';
import { runArchitect } from './agents/architect.js';
import { runPlanner } from './agents/planner.js';
import { runCoder } from './agents/coder.js';
import { runQA } from './agents/qa.js';

// ─────────────────────────────────────────────────────────────
// MISSION RUNNER
// Connects to the Orchestrator via WebSocket IPC.
// Listens for MISSION_CREATED events → runs the full pipeline:
//   DRAFT → PLANNING → AWAITING_APPROVAL → APPROVED → EXECUTING → COMPLETED
//
// Phase 1: sequential execution (one task at a time).
// Phase 2: parallel task execution with dependency graph.
// ─────────────────────────────────────────────────────────────

const ORCHESTRATOR_URL = process.env['FORGE_IPC_URL'] ?? 'ws://localhost:7700';

class Runner {
  private ws: WebSocket | null = null;
  private pending = new Map<string, (r: Record<string, unknown>) => void>();
  private counter = 0;
  private processingMissions = new Set<string>();

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(ORCHESTRATOR_URL);

      ws.on('open', () => {
        this.ws = ws;
        console.log('[Runner] Connected to orchestrator');
        void this.loadInitialSettings();
        void this.resumeActiveMissions();
        resolve();
      });

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString()) as
            | { type: 'EVENT'; data: ForgeEvent }
            | { id: string; success: boolean; data?: unknown; error?: string };

          if ('type' in msg && msg.type === 'EVENT') {
            void this.onEvent(msg.data);
          } else if ('id' in msg) {
            this.pending.get(msg.id)?.(msg as Record<string, unknown>);
            this.pending.delete(msg.id);
          }
        } catch (err) {
          console.error('[Runner] Parse error:', err);
        }
      });

      ws.on('error', reject);
      ws.on('close', () => {
        console.log('[Runner] Disconnected — reconnecting in 3s…');
        this.ws = null;
        setTimeout(() => void this.connect(), 3000);
      });
    });
  }

  private async loadInitialSettings(): Promise<void> {
    try {
      const res = await this.send('GET_SETTINGS', {});
      if (res['success'] && res['data']) {
        this.applySettings(res['data'] as Record<string, any>);
      }
    } catch (err) {
      console.error('[Runner] Failed to load initial settings:', err);
    }
  }

  private async resumeActiveMissions(): Promise<void> {
    try {
      console.log('[Runner] Querying active missions to resume...');
      const res = await this.send('LIST_MISSIONS', {});
      console.log('[Runner] LIST_MISSIONS response:', JSON.stringify(res));
      if (res['success'] && Array.isArray(res['data'])) {
        const missions = res['data'] as Mission[];
        console.log(`[Runner] Found ${missions.length} missions in orchestrator`);
        for (const mission of missions) {
          console.log(`[Runner] Mission ${mission.id} state is ${mission.state}`);
          if (mission.state === 'APPROVED' || mission.state === 'EXECUTING') {
            if (!this.processingMissions.has(mission.id)) {
              console.log(`[Runner] Resuming active/approved mission: ${mission.id} (${mission.state})`);
              this.processingMissions.add(mission.id);
              void this.executeApprovedMission(mission.id).catch((err) => {
                console.error(`[Runner] Execution failed for resuming ${mission.id}:`, err);
                this.processingMissions.delete(mission.id);
              });
            }
          } else if (mission.state === 'PLANNING') {
            if (!this.processingMissions.has(mission.id)) {
              console.log(`[Runner] Resuming planning mission: ${mission.id}`);
              this.processingMissions.add(mission.id);
              void this.runMissionPipeline(mission.id).catch((err) => {
                console.error(`[Runner] Pipeline failed for resuming ${mission.id}:`, err);
                this.processingMissions.delete(mission.id);
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('[Runner] Failed to resume active missions:', err);
    }
  }

  private applySettings(settings: Record<string, any>): void {
    const apiKeys = settings.api_keys ?? {};
    const models = settings.models ?? {};

    if (apiKeys.openai) process.env['OPENAI_API_KEY'] = apiKeys.openai;
    if (apiKeys.anthropic) process.env['ANTHROPIC_API_KEY'] = apiKeys.anthropic;
    if (apiKeys.openrouter) process.env['OPENROUTER_API_KEY'] = apiKeys.openrouter;

    if (models.ollama) process.env['OLLAMA_MODEL'] = models.ollama;
    if (models.openai) process.env['OPENAI_MODEL'] = models.openai;
    if (models.anthropic) process.env['ANTHROPIC_MODEL'] = models.anthropic;
    if (models.openrouter) process.env['OPENROUTER_MODEL'] = models.openrouter;

    updateRouterSettings(settings);
    console.log('[Runner] Dynamic settings updated in environment variables');
  }

  private async send(type: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.ws) throw new Error('Not connected to orchestrator');
    const id = `runner_${++this.counter}_${Date.now()}`;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws!.send(JSON.stringify({ id, type, payload }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve({ id, success: false, error: 'timeout' });
        }
      }, 60_000);
    });
  }

  private async getMission(missionId: string): Promise<Mission> {
    const res = await this.send('GET_MISSION', { mission_id: missionId });
    return res['data'] as Mission;
  }

  private async transition(missionId: string, action: string): Promise<void> {
    await this.send(action, { mission_id: missionId });
  }

  private async log(missionId: string, agentName: string, message: string): Promise<void> {
    // Publish agent log event via IPC
    // We can't publish directly to bus from here, so we use a LOG_AGENT message
    // which the orchestrator forwards to the bus
    console.log(`[${agentName}][${missionId}] ${message}`);
    // Future: await this.send('AGENT_LOG', { mission_id: missionId, agent: agentName, message });
  }

  private async onEvent(event: ForgeEvent): Promise<void> {
    if (event.type === 'MEMORY_UPDATED' && event.payload['settings']) {
      this.applySettings(event.payload['settings'] as Record<string, any>);
    }

    if (event.type === 'MISSION_CREATED') {
      const mission = event.payload['mission'] as Mission;

      if (this.processingMissions.has(mission.id)) return;
      this.processingMissions.add(mission.id);

      // Run pipeline in background — don't await here
      void this.runMissionPipeline(mission.id).catch((err) => {
        console.error(`[Runner] Pipeline failed for ${mission.id}:`, err);
        this.processingMissions.delete(mission.id);
      });
    }

    // If user approves a mission in AWAITING_APPROVAL, move it to EXECUTING
    if (event.type === 'MISSION_STATE_CHANGED') {
      const nextState = event.payload['next_state'] as string;
      if (nextState === 'APPROVED') {
        const missionId = event.mission_id;
        if (!this.processingMissions.has(missionId)) {
          this.processingMissions.add(missionId);
          void this.executeApprovedMission(missionId).catch((err) => {
            console.error(`[Runner] Execution failed for ${missionId}:`, err);
            this.processingMissions.delete(missionId);
          });
        }
      }
    }
  }

  // ── Full pipeline ─────────────────────────────────────────────

  private async runMissionPipeline(missionId: string): Promise<void> {
    try {
      // ── Phase 1: Architect ────────────────────────────────────
      console.log(`[Runner] Starting Architect for ${missionId}`);
      await this.transition(missionId, 'TRANSITION_MISSION');

      // Use direct IPC to transition DRAFT → PLANNING
      await this.send('TRANSITION_MISSION', { mission_id: missionId, state: 'PLANNING' });

      const mission = await this.getMission(missionId);
      await this.log(missionId, 'Architect', `Analyzing "${mission.title}"…`);

      const architectOutput = await runArchitect(mission);

      // Update blueprint in orchestrator via IPC
      // For now, we update the local mission object representation
      // The orchestrator will persist via mission.json on disk

      // ── Phase 2: Planner ──────────────────────────────────────
      await this.log(missionId, 'Planner', 'Building task graph…');

      // Re-fetch mission with updated blueprint
      const updatedMission: Mission = {
        ...mission,
        blueprint: {
          ...mission.blueprint,
          requirements: architectOutput.requirements,
          architecture: architectOutput.architecture,
        },
      };

      const plannerOutput = await runPlanner(updatedMission);

      // Register tasks with orchestrator
      for (const task of plannerOutput.tasks) {
        await this.send('ADD_TASK', { mission_id: missionId, task });
      }

      // Move to AWAITING_APPROVAL — user must review blueprint
      await this.send('TRANSITION_MISSION', { mission_id: missionId, state: 'AWAITING_APPROVAL' });

      await this.log(missionId, 'Planner', `Blueprint ready — ${plannerOutput.tasks.length} tasks planned. Awaiting approval.`);
      this.processingMissions.delete(missionId);

    } catch (err) {
      console.error(`[Runner] Pipeline error for ${missionId}:`, err);
      await this.send('TRANSITION_MISSION', { mission_id: missionId, state: 'FAILED' }).catch(() => {});
      this.processingMissions.delete(missionId);
    }
  }

  // ── Execute approved mission ──────────────────────────────────

  private async executeApprovedMission(missionId: string): Promise<void> {
    try {
      await this.send('TRANSITION_MISSION', { mission_id: missionId, state: 'EXECUTING' });

      const mission = await this.getMission(missionId);
      const tasks = [...mission.task_graph];

      // Sequential execution (Phase 1)
      const completed = new Set<string>();

      for (const task of tasks) {
        if (task.state === 'COMPLETED') {
          console.log(`[Runner] Task ${task.id} is already COMPLETED — resuming/skipping`);
          completed.add(task.id);
          continue;
        }

        // Wait for dependencies
        const deps = task.dependencies ?? [];
        for (const dep of deps) {
          if (!completed.has(dep)) {
            console.warn(`[Runner] Task ${task.id} has unresolved dependency ${dep} — skipping`);
            continue;
          }
        }

        await this.executeTask(mission, task, completed);
        completed.add(task.id);
      }

      await this.send('TRANSITION_MISSION', { mission_id: missionId, state: 'COMPLETED' });
      console.log(`[Runner] Mission ${missionId} completed`);

    } catch (err) {
      console.error(`[Runner] Execution error for ${missionId}:`, err);
      await this.send('TRANSITION_MISSION', { mission_id: missionId, state: 'FAILED' }).catch(() => {});
    } finally {
      this.processingMissions.delete(missionId);
    }
  }

  // ── Execute single task ───────────────────────────────────────

  private async executeTask(mission: Mission, task: Task, _completed: Set<string>): Promise<void> {
    const startMs = Date.now();
    console.log(`[Runner] Executing task: ${task.id} — ${task.title}`);

    await this.send('UPDATE_TASK', {
      mission_id: mission.id,
      task_id: task.id,
      update: { state: 'RUNNING' },
    });

    try {
      let summary = '';

      if (task.agent === 'Coder' || task.agent === 'Automation') {
        summary = await runCoder(mission, task);

        // QA review after Coder
        const qaResult = await runQA(mission, task, summary);
        console.log(`[QA] ${task.id}: ${qaResult.pass ? 'PASS' : 'FAIL'} — ${qaResult.summary}`);

        if (!qaResult.pass && qaResult.issues.length > 0) {
          console.warn(`[QA] Issues: ${qaResult.issues.join('; ')}`);
          // For Phase 1: log issues but don't block — escalate in Phase 2
        }

      } else {
        // For non-Coder agents, generate a text output
        const response = await runGenericAgent(mission, task);
        summary = response;
      }

      const durationMs = Date.now() - startMs;

      await this.send('UPDATE_TASK', {
        mission_id: mission.id,
        task_id: task.id,
        update: {
          state: 'COMPLETED',
          outputs: { summary },
          duration_ms: durationMs,
        },
      });

    } catch (err) {
      const durationMs = Date.now() - startMs;
      const errorMsg = err instanceof Error ? err.message : String(err);

      await this.send('UPDATE_TASK', {
        mission_id: mission.id,
        task_id: task.id,
        update: {
          state: 'FAILED',
          error: errorMsg,
          duration_ms: durationMs,
        },
      });

      throw err; // propagate to stop mission
    }
  }
}

// ── Generic agent (non-Coder tasks) ──────────────────────────

import { chat, updateRouterSettings } from './model-router.js';

async function runGenericAgent(mission: Mission, task: Task): Promise<string> {
  const response = await chat([
    {
      role: 'system',
      content: `You are the ${task.agent} agent in Forge. Complete the assigned task and provide a detailed output.`,
    },
    {
      role: 'user',
      content: `Mission: ${mission.title}\nTask: ${task.title}\nDescription: ${task.description}\n\nComplete this task and provide your output.`,
    },
  ], { agent: task.agent });
  return response.content;
}

// ── Entry point ───────────────────────────────────────────────

export async function startRunner(): Promise<void> {
  const runner = new Runner();

  let retries = 0;
  while (retries < 20) {
    try {
      await runner.connect();
      console.log('[Runner] Agent runner active. Waiting for missions…');
      return;
    } catch (err) {
      retries++;
      const delay = Math.min(500 * Math.pow(1.5, retries), 8000);
      console.warn(`[Runner] Connection attempt ${retries} failed — retrying in ${Math.round(delay)}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error('[Runner] Could not connect to orchestrator after 20 attempts');
}
