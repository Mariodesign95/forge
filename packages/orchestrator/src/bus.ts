import EventEmitter from 'node:events';
import type { ForgeEvent, ForgeEventType } from '@forge/types';

// ─────────────────────────────────────────────────────────────
// FORGE MESSAGE BUS
// Single in-process event channel. All components communicate
// exclusively through this bus — no direct calls allowed.
// Interface is designed to be swapped with cross-process bus
// (NATS, Redis Streams) in Phase 2 without component changes.
// ─────────────────────────────────────────────────────────────

type EventHandler = (event: ForgeEvent) => void;

class ForgeBus extends EventEmitter {
  private static instance: ForgeBus;

  private constructor() {
    super();
    this.setMaxListeners(100);
  }

  static getInstance(): ForgeBus {
    if (!ForgeBus.instance) {
      ForgeBus.instance = new ForgeBus();
    }
    return ForgeBus.instance;
  }

  publish(event: ForgeEvent): void {
    // Emit on specific type channel
    this.emit(event.type, event);
    // Emit on wildcard channel for loggers / UI subscribers
    this.emit('*', event);
  }

  subscribe(type: ForgeEventType | '*', handler: EventHandler): () => void {
    this.on(type, handler);
    // Return unsubscribe function
    return () => this.off(type, handler);
  }
}

export const bus = ForgeBus.getInstance();

export function createEvent(
  type: ForgeEventType,
  mission_id: string,
  payload: Record<string, unknown>,
  task_id?: string,
): ForgeEvent {
  return {
    event_id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    type,
    mission_id,
    task_id,
    payload,
  };
}
