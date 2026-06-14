import fs from 'node:fs';
import path from 'node:path';
import type { Mission, MissionState, Task } from '@forge/types';
import { bus, createEvent } from './bus.js';
import { TransactionLog } from './transaction-log.js';

// ─────────────────────────────────────────────────────────────
// ORCHESTRATOR — Mission State Machine
// Single owner of all mission state.
// Enforces valid transitions per mission-protocol.md.
// Never executes tools or calls models directly.
// ─────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<MissionState, MissionState[]> = {
  DRAFT:              ['PLANNING', 'CANCELLED'],
  PLANNING:           ['AWAITING_APPROVAL', 'FAILED'],
  AWAITING_APPROVAL:  ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED:           ['EXECUTING', 'CANCELLED'],
  EXECUTING:          ['PAUSED', 'COMPLETED', 'FAILED'],
  PAUSED:             ['EXECUTING', 'CANCELLED', 'FAILED'],
  COMPLETED:          [],
  FAILED:             [],
  CANCELLED:          [],
};

export class Orchestrator {
  private missions = new Map<string, Mission>();
  private logs = new Map<string, TransactionLog>();
  private forgeRoot: string;

  constructor(forgeRoot: string) {
    this.forgeRoot = forgeRoot;
    fs.mkdirSync(forgeRoot, { recursive: true });
    this.loadMissionsFromDisk();
  }

  private loadMissionsFromDisk(): void {
    const missionsDir = path.join(this.forgeRoot, 'missions');
    if (!fs.existsSync(missionsDir)) return;

    try {
      const dirs = fs.readdirSync(missionsDir);
      for (const dirName of dirs) {
        const missionPath = path.join(missionsDir, dirName, 'mission.json');
        if (fs.existsSync(missionPath)) {
          const content = fs.readFileSync(missionPath, 'utf-8');
          const mission = JSON.parse(content) as Mission;
          this.missions.set(mission.id, mission);
          
          const log = new TransactionLog(mission.id, this.forgeRoot);
          this.logs.set(mission.id, log);
          console.log(`[Forge Orchestrator] Loaded mission ${mission.id} (${mission.state}) from disk`);
        }
      }
    } catch (err) {
      console.error('[Forge Orchestrator] Failed to load missions from disk:', err);
    }
  }

  // ── Create ────────────────────────────────────────────────

  createMission(params: {
    id: string;
    title: string;
    statement: string;
    cap_eur?: number;
  }): Mission {
    const workspaceDir = path.join(this.forgeRoot, 'workspaces', params.id);
    fs.mkdirSync(path.join(workspaceDir, 'src'), { recursive: true });

    const mission: Mission = {
      id: params.id,
      title: params.title,
      statement: params.statement,
      state: 'DRAFT',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      owner: 'user',
      workspace: workspaceDir,
      blueprint: {
        requirements: null,
        architecture: null,
        design: null,
        brand: null,
        landing: null,
        marketing: null,
        seo: null,
        user_personas: null,
      },
      task_graph: [],
      budget: {
        cap_eur: params.cap_eur ?? 5.0,
        spent_eur: 0,
        fallback_model: null,
      },
      permissions: {
        level: 2,
        autonomous_run: false,
      },
    };

    this.missions.set(mission.id, mission);

    const log = new TransactionLog(mission.id, this.forgeRoot);
    this.logs.set(mission.id, log);

    const event = createEvent('MISSION_CREATED', mission.id, { mission });
    log.append(event);
    bus.publish(event);

    this.persistMission(mission);
    return mission;
  }

  // ── Transition ────────────────────────────────────────────

  transition(missionId: string, nextState: MissionState): Mission {
    const mission = this.getMission(missionId);
    if (mission.state === nextState) {
      return mission;
    }
    const allowed = VALID_TRANSITIONS[mission.state] ?? [];

    if (!allowed.includes(nextState)) {
      throw new Error(
        `Invalid transition: ${mission.state} → ${nextState} for mission ${missionId}`,
      );
    }

    const previousState = mission.state; // capture BEFORE mutation
    mission.state = nextState;
    mission.updated_at = new Date().toISOString();

    const event = createEvent('MISSION_STATE_CHANGED', mission.id, {
      previous_state: previousState,
      next_state: nextState,
    });

    const log = this.logs.get(missionId);
    log?.append(event);
    bus.publish(event);

    this.persistMission(mission);
    return mission;
  }

  // ── Tasks ─────────────────────────────────────────────────

  addTask(missionId: string, task: Task): void {
    const mission = this.getMission(missionId);
    mission.task_graph.push(task);
    mission.updated_at = new Date().toISOString();

    const event = createEvent('TASK_CREATED', missionId, { task }, task.id);
    this.logs.get(missionId)?.append(event);
    bus.publish(event);

    this.persistMission(mission);
  }

  updateTaskState(
    missionId: string,
    taskId: string,
    update: Partial<Pick<Task, 'state' | 'outputs' | 'cost_eur' | 'duration_ms' | 'error'>>,
  ): void {
    const mission = this.getMission(missionId);
    const task = mission.task_graph.find((t) => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found in mission ${missionId}`);

    Object.assign(task, update);
    mission.updated_at = new Date().toISOString();

    const eventType = update.state === 'COMPLETED'
      ? 'TASK_COMPLETED'
      : update.state === 'FAILED'
      ? 'TASK_FAILED'
      : update.state === 'RUNNING'
      ? 'TASK_STARTED'
      : 'TASK_DISPATCHED';

    const event = createEvent(eventType, missionId, { task }, taskId);
    this.logs.get(missionId)?.append(event);
    bus.publish(event);

    this.persistMission(mission);
  }

  // ── Budget ────────────────────────────────────────────────

  recordCost(missionId: string, amount_eur: number): void {
    const mission = this.getMission(missionId);
    mission.budget.spent_eur += amount_eur;

    const pct = mission.budget.spent_eur / mission.budget.cap_eur;
    const event = createEvent('BUDGET_UPDATE', missionId, {
      spent_eur: mission.budget.spent_eur,
      cap_eur: mission.budget.cap_eur,
      pct: Math.round(pct * 100),
    });
    this.logs.get(missionId)?.append(event);
    bus.publish(event);

    // Thresholds
    if (pct >= 1.2) {
      bus.publish(createEvent('BUDGET_HARD_STOP', missionId, {}));
      this.transition(missionId, 'PAUSED');
    } else if (pct >= 1.0) {
      bus.publish(createEvent('BUDGET_SOFT_STOP', missionId, {}));
      this.transition(missionId, 'PAUSED');
    } else if (pct >= 0.7) {
      bus.publish(createEvent('BUDGET_WARNING', missionId, { pct: Math.round(pct * 100) }));
    }

    this.persistMission(mission);
  }

  // ── Read ──────────────────────────────────────────────────

  getMission(missionId: string): Mission {
    const mission = this.missions.get(missionId);
    if (!mission) throw new Error(`Mission ${missionId} not found`);
    return mission;
  }

  listMissions(): Mission[] {
    return Array.from(this.missions.values());
  }

  getLog(missionId: string): TransactionLog | undefined {
    return this.logs.get(missionId);
  }

  // ── Persist ───────────────────────────────────────────────

  private persistMission(mission: Mission): void {
    const dir = path.join(this.forgeRoot, 'missions', mission.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'mission.json'),
      JSON.stringify(mission, null, 2),
      'utf-8',
    );
  }

  getSettings(): Record<string, any> {
    const file = path.join(this.forgeRoot, 'settings.json');
    if (!fs.existsSync(file)) {
      return {
        api_keys: {},
        models: {}
      };
    }
    try {
      return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch {
      return {
        api_keys: {},
        models: {}
      };
    }
  }

  saveSettings(settings: Record<string, any>): void {
    const file = path.join(this.forgeRoot, 'settings.json');
    fs.writeFileSync(file, JSON.stringify(settings, null, 2), 'utf-8');
    bus.publish(createEvent('MEMORY_UPDATED', 'system', { settings }));
  }
}
