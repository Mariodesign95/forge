import path from 'node:path';
import os from 'node:os';
import { Orchestrator } from './orchestrator.js';
import { startIpcServer } from './ipc-server.js';

// ─────────────────────────────────────────────────────────────
// FORGE ORCHESTRATOR — Entry Point
// Sidecar process launched by the VS Code extension.
// Forge root: ~/.forge (configurable via FORGE_ROOT env var)
// IPC port:   7700    (configurable via FORGE_IPC_PORT env var)
// ─────────────────────────────────────────────────────────────

const forgeRoot = process.env['FORGE_ROOT'] ?? path.join(os.homedir(), '.forge');

console.log(`[Forge Orchestrator] Starting...`);
console.log(`[Forge Orchestrator] Root: ${forgeRoot}`);

const orchestrator = new Orchestrator(forgeRoot);
startIpcServer(orchestrator);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Forge Orchestrator] Shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Forge Orchestrator] Shutting down...');
  process.exit(0);
});
