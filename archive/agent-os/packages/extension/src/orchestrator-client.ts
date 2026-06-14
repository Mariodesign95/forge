import WebSocket from 'ws';
import type { ForgeEvent, IpcMessage, IpcResponse, IpcMessageType } from '@forge/types';

// ─────────────────────────────────────────────────────────────
// ORCHESTRATOR CLIENT
// Runs inside the VS Code extension process.
// Connects to the Orchestrator WebSocket server.
// Provides typed send/receive API for commands and events.
// ─────────────────────────────────────────────────────────────

type EventHandler = (event: ForgeEvent) => void;

export class OrchestratorClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, {
    resolve: (r: IpcResponse) => void;
    reject: (e: Error) => void;
  }>();
  private eventHandlers: EventHandler[] = [];
  private msgCounter = 0;

  async connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);

      ws.on('open', () => {
        this.ws = ws;
        console.log('[Forge Client] Connected to orchestrator');
        resolve();
      });

      ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString()) as
            | { type: 'EVENT'; data: ForgeEvent }
            | IpcResponse;

          if ('type' in msg && msg.type === 'EVENT') {
            // Broadcast to all event handlers
            this.eventHandlers.forEach((h) => h(msg.data));
          } else {
            // Resolve pending IPC call
            const pending = this.pending.get((msg as IpcResponse).id);
            if (pending) {
              pending.resolve(msg as IpcResponse);
              this.pending.delete((msg as IpcResponse).id);
            }
          }
        } catch (err) {
          console.error('[Forge Client] Parse error:', err);
        }
      });

      ws.on('error', (err) => {
        console.error('[Forge Client] WebSocket error:', err);
        reject(err);
      });

      ws.on('close', () => {
        console.log('[Forge Client] Disconnected');
        this.ws = null;
      });
    });
  }

  async send(type: IpcMessageType, payload: Record<string, unknown>): Promise<IpcResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Orchestrator not connected');
    }

    const id = `msg_${++this.msgCounter}_${Date.now()}`;
    const message: IpcMessage = { id, type, payload };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(message));

      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`IPC timeout for message ${id}`));
        }
      }, 30_000);
    });
  }

  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      this.eventHandlers = this.eventHandlers.filter((h) => h !== handler);
    };
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
