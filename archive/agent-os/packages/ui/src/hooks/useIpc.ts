import { useCallback, useRef } from 'react';
import type { IpcMessageType, IpcResponse } from '@forge/types';

// ─────────────────────────────────────────────────────────────
// useIpc
// Sends IPC commands to the Orchestrator.
// Inside VS Code: via postMessage to extension → WebSocket.
// In browser dev mode: direct WebSocket fetch-style call.
// ─────────────────────────────────────────────────────────────

const isInsideVSCode = (): boolean =>
  typeof window.acquireVsCodeApi !== 'undefined';

export function useIpc(): { send: (type: IpcMessageType, payload: Record<string, unknown>) => Promise<IpcResponse> } {
  const vscodeRef = useRef<ReturnType<NonNullable<typeof window.acquireVsCodeApi>> | null>(null);
  const pendingRef = useRef<Map<string, (r: IpcResponse) => void>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const counterRef = useRef(0);

  // Get/cache vscode API
  if (isInsideVSCode() && !vscodeRef.current) {
    vscodeRef.current = window.acquireVsCodeApi!();

    // Listen for IPC responses from extension
    window.addEventListener('message', (e: MessageEvent) => {
      const msg = e.data as { type: string; data: IpcResponse };
      if (msg.type === 'IPC_RESPONSE') {
        const resolve = pendingRef.current.get(msg.data.id);
        if (resolve) {
          resolve(msg.data);
          pendingRef.current.delete(msg.data.id);
        }
      }
    });
  }

  // Direct WebSocket for dev mode
  const getDevWs = useCallback((): Promise<WebSocket> => {
    return new Promise((resolve, reject) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        resolve(wsRef.current);
        return;
      }
      const ws = new WebSocket('ws://localhost:7700');
      ws.onopen = () => {
        wsRef.current = ws;
        resolve(ws);
      };
      ws.onerror = reject;
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as IpcResponse;
          if (msg.id) {
            const resolve = pendingRef.current.get(msg.id);
            if (resolve) {
              resolve(msg);
              pendingRef.current.delete(msg.id);
            }
          }
        } catch {
          // ignore
        }
      };
    });
  }, []);

  const send = useCallback(
    async (type: IpcMessageType, payload: Record<string, unknown>): Promise<IpcResponse> => {
      const id = `ui_${++counterRef.current}_${Date.now()}`;

      return new Promise((resolve) => {
        pendingRef.current.set(id, resolve);

        const msg = { id, type, payload };

        if (isInsideVSCode()) {
          vscodeRef.current!.postMessage(msg);
        } else {
          getDevWs().then((ws) => {
            ws.send(JSON.stringify(msg));
          }).catch((err) => {
            resolve({ id, success: false, error: String(err) });
          });
        }

        // Timeout
        setTimeout(() => {
          if (pendingRef.current.has(id)) {
            pendingRef.current.delete(id);
            resolve({ id, success: false, error: 'IPC timeout' });
          }
        }, 30_000);
      });
    },
    [getDevWs],
  );

  return { send };
}
