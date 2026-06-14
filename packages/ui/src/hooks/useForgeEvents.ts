import { useEffect, useRef } from 'react';
import type { ForgeEvent } from '@forge/types';

// ─────────────────────────────────────────────────────────────
// useForgeEvents
// Listens for FORGE_EVENT messages from the VS Code extension
// (which forwards orchestrator events into the webview).
// In standalone browser mode (dev), connects directly to
// the orchestrator WebSocket on ws://localhost:7700.
//
// DESIGN: handler is stored in a ref so the WebSocket/listener
// is only created once per mount regardless of whether the
// caller uses useCallback. Callers do NOT need to stabilize
// their handler reference — this hook handles it internally.
// ─────────────────────────────────────────────────────────────

declare global {
  interface Window {
    acquireVsCodeApi?: () => {
      postMessage: (msg: unknown) => void;
      getState: () => unknown;
      setState: (state: unknown) => void;
    };
  }
}

export function useForgeEvents(handler: (event: ForgeEvent) => void): void {
  // Store latest handler in ref — never stale, never triggers re-effects
  const handlerRef = useRef(handler);
  useEffect(() => { handlerRef.current = handler; }, [handler]);

  useEffect(() => {
    const isInsideVSCode = typeof window.acquireVsCodeApi !== 'undefined';

    if (isInsideVSCode) {
      const listener = (e: MessageEvent): void => {
        const msg = e.data as { type: string; data: ForgeEvent };
        if (msg.type === 'FORGE_EVENT') handlerRef.current(msg.data);
      };
      window.addEventListener('message', listener);
      return () => window.removeEventListener('message', listener);
    } else {
      // Dev mode: single persistent WebSocket with auto-reconnect
      let ws: WebSocket | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout>;
      let destroyed = false;

      const connect = (): void => {
        if (destroyed) return;
        ws = new WebSocket('ws://localhost:7700');

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string) as { type: string; data: ForgeEvent };
            if (msg.type === 'EVENT') handlerRef.current(msg.data);
          } catch {
            // malformed message — ignore
          }
        };

        ws.onclose = () => {
          if (!destroyed) reconnectTimer = setTimeout(connect, 2000);
        };

        ws.onerror = () => {
          // Will trigger onclose — reconnect handled there
        };
      };

      connect();

      return () => {
        destroyed = true;
        clearTimeout(reconnectTimer);
        ws?.close();
      };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // empty deps — intentional: connection is created once on mount
}
