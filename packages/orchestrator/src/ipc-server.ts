import { WebSocketServer, WebSocket } from 'ws';
import type { IpcMessage, IpcResponse } from '@forge/types';
import { Orchestrator } from './orchestrator.js';
import { bus } from './bus.js';

// ─────────────────────────────────────────────────────────────
// IPC SERVER
// WebSocket server that bridges the VS Code extension webview
// and the Orchestrator. Default port: 7700.
// Extension connects → subscribes to events → sends commands.
// ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env['FORGE_IPC_PORT'] ?? '7700', 10);

export function startIpcServer(orchestrator: Orchestrator): void {
  const wss = new WebSocketServer({ port: PORT });

  console.log(`[Forge Orchestrator] IPC server listening on ws://localhost:${PORT}`);

  wss.on('connection', (ws: WebSocket) => {
    console.log('[Forge Orchestrator] Client connected');

    // Forward all bus events to this client
    const unsubscribe = bus.subscribe('*', (event) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'EVENT', data: event }));
      }
    });

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as IpcMessage;
        const response = await handleMessage(msg, orchestrator);
        ws.send(JSON.stringify(response));
      } catch (err) {
        const errorResponse: IpcResponse = {
          id: 'unknown',
          success: false,
          error: String(err),
        };
        ws.send(JSON.stringify(errorResponse));
      }
    });

    ws.on('close', () => {
      unsubscribe();
      console.log('[Forge Orchestrator] Client disconnected');
    });
  });
}

async function getLocalOllamaModels(): Promise<string[]> {
  const OLLAMA_HOST = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';
  try {
    const res = await fetch(`${OLLAMA_HOST}/api/tags`);
    if (res.ok) {
      const data = await res.json() as { models?: Array<{ name: string }> };
      return data.models?.map((m) => m.name) ?? [];
    }
  } catch (err) {
    console.error('[Forge Orchestrator] Failed to fetch Ollama models:', err);
  }
  return [];
}

async function handleMessage(msg: IpcMessage, orchestrator: Orchestrator): Promise<IpcResponse> {
  try {
    switch (msg.type) {
      case 'CREATE_MISSION': {
        const { id, title, statement, cap_eur } = msg.payload as {
          id: string;
          title: string;
          statement: string;
          cap_eur?: number;
        };
        const mission = orchestrator.createMission({ id, title, statement, cap_eur });
        return { id: msg.id, success: true, data: mission };
      }

      case 'TRANSITION_MISSION': {
        const { mission_id, state } = msg.payload as { mission_id: string; state: string };
        const mission = orchestrator.transition(mission_id, state as any);
        return { id: msg.id, success: true, data: mission };
      }

      case 'GET_MISSION': {
        const { mission_id } = msg.payload as { mission_id: string };
        const mission = orchestrator.getMission(mission_id);
        return { id: msg.id, success: true, data: mission };
      }

      case 'LIST_MISSIONS': {
        const missions = orchestrator.listMissions();
        return { id: msg.id, success: true, data: missions };
      }

      case 'APPROVE_MISSION': {
        const { mission_id } = msg.payload as { mission_id: string };
        const mission = orchestrator.transition(mission_id, 'APPROVED');
        return { id: msg.id, success: true, data: mission };
      }

      case 'PAUSE_MISSION': {
        const { mission_id } = msg.payload as { mission_id: string };
        const mission = orchestrator.transition(mission_id, 'PAUSED');
        return { id: msg.id, success: true, data: mission };
      }

      case 'CANCEL_MISSION': {
        const { mission_id } = msg.payload as { mission_id: string };
        const mission = orchestrator.transition(mission_id, 'CANCELLED');
        return { id: msg.id, success: true, data: mission };
      }

      case 'ADD_TASK': {
        const { mission_id, task } = msg.payload as { mission_id: string; task: import('@forge/types').Task };
        orchestrator.addTask(mission_id, task);
        return { id: msg.id, success: true, data: null };
      }

      case 'UPDATE_TASK': {
        const { mission_id, task_id, update } = msg.payload as {
          mission_id: string;
          task_id: string;
          update: Partial<Pick<import('@forge/types').Task, 'state' | 'outputs' | 'cost_eur' | 'duration_ms' | 'error'>>;
        };
        orchestrator.updateTaskState(mission_id, task_id, update);
        return { id: msg.id, success: true, data: null };
      }

      case 'RECORD_COST': {
        const { mission_id, amount_eur } = msg.payload as { mission_id: string; amount_eur: number };
        orchestrator.recordCost(mission_id, amount_eur);
        return { id: msg.id, success: true, data: null };
      }

      case 'GET_SETTINGS': {
        const settings = orchestrator.getSettings();
        return { id: msg.id, success: true, data: settings };
      }

      case 'SAVE_SETTINGS': {
        const { settings } = msg.payload as { settings: Record<string, any> };
        orchestrator.saveSettings(settings);
        return { id: msg.id, success: true, data: null };
      }

      case 'GET_LOCAL_MODELS': {
        const models = await getLocalOllamaModels();
        return { id: msg.id, success: true, data: models };
      }

      default:
        return { id: msg.id, success: false, error: `Unknown message type: ${msg.type}` };
    }
  } catch (err) {
    return { id: msg.id, success: false, error: String(err) };
  }
}
