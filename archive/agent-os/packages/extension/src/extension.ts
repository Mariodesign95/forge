import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import { ForgePanel } from './panel.js';
import { OrchestratorClient } from './orchestrator-client.js';

// ─────────────────────────────────────────────────────────────
// FORGE EXTENSION — Entry Point
// 1. Hides VS Code chrome (activity bar, sidebar, status bar)
// 2. Launches Orchestrator sidecar process
// 3. Opens Forge Mission Control full-screen webview
// ─────────────────────────────────────────────────────────────

let orchestratorProcess: cp.ChildProcess | undefined;
let agentsProcess: cp.ChildProcess | undefined;
let orchestratorClient: OrchestratorClient | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('[Forge] Activating...');

  // ── 1. Apply Forge UI overrides ──────────────────────────
  applyForgeWorkbenchOverrides();

  // ── 2. Start Orchestrator sidecar ───────────────────────
  orchestratorClient = new OrchestratorClient();
  startOrchestratorSidecar(context, orchestratorClient);

  // ── Start Agent Runner sidecar ──────────────────────────
  startAgentsSidecar(context);

  // ── 3. Open Mission Control immediately ─────────────────
  const panel = ForgePanel.createOrShow(context.extensionUri, orchestratorClient);

  // ── 4. Register commands ─────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('forge.openMissionControl', () => {
      vscode.window.showInformationMessage('Opening Forge Mission Control...');
      ForgePanel.createOrShow(context.extensionUri, orchestratorClient!);
    }),
    vscode.commands.registerCommand('forge.newMission', () => {
      ForgePanel.createOrShow(context.extensionUri, orchestratorClient!);
      panel.postMessage({ type: 'OPEN_NEW_MISSION' });
    }),
  );

  console.log('[Forge] Activated.');
}

export function deactivate(): void {
  if (orchestratorProcess) {
    orchestratorProcess.kill();
  }
  if (agentsProcess) {
    agentsProcess.kill();
  }
}

// ── Workbench overrides ───────────────────────────────────────
// Hide VS Code chrome so users see only Forge UI.

function applyForgeWorkbenchOverrides(): void {
  const config = vscode.workspace.getConfiguration();

  // Hide activity bar, status bar, minimap
  config.update('workbench.activityBar.visible', false, vscode.ConfigurationTarget.Global);
  config.update('workbench.statusBar.visible', false, vscode.ConfigurationTarget.Global);
  config.update('editor.minimap.enabled', false, vscode.ConfigurationTarget.Global);

  // Apply Forge dark theme (we'll register a custom theme later)
  // For now set to the darkest available built-in
  config.update('workbench.colorTheme', 'Default Dark Modern', vscode.ConfigurationTarget.Global);

  // Hide sidebar on startup
  vscode.commands.executeCommand('workbench.action.closeSidebar');
  vscode.commands.executeCommand('workbench.action.closePanel');
}

// ── Orchestrator sidecar ──────────────────────────────────────

function startOrchestratorSidecar(
  context: vscode.ExtensionContext,
  client: OrchestratorClient,
): void {
  // Path to the orchestrator entry point
  const orchestratorEntry = context.asAbsolutePath(
    path.join('..', '..', 'packages', 'orchestrator', 'src', 'index.ts'),
  );

  orchestratorProcess = cp.spawn(
    'node',
    ['--import', 'tsx/esm', orchestratorEntry],
    {
      env: {
        ...process.env,
        FORGE_IPC_PORT: '7700',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  orchestratorProcess.stdout?.on('data', (data: Buffer) => {
    console.log('[Forge Orchestrator]', data.toString().trim());
  });

  orchestratorProcess.stderr?.on('data', (data: Buffer) => {
    console.error('[Forge Orchestrator ERROR]', data.toString().trim());
  });

  orchestratorProcess.on('exit', (code) => {
    console.log(`[Forge Orchestrator] Exited with code ${code}`);
  });

  // Connect with exponential backoff — sidecar startup time is non-deterministic
  connectWithRetry(client, 'ws://localhost:7700');
}

function connectWithRetry(
  client: OrchestratorClient,
  url: string,
  attempt = 0,
  maxAttempts = 10,
): void {
  const delayMs = Math.min(500 * Math.pow(1.5, attempt), 8000);

  setTimeout(async () => {
    try {
      await client.connect(url);
      console.log(`[Forge] Connected to orchestrator on attempt ${attempt + 1}`);
    } catch (err) {
      if (attempt + 1 < maxAttempts) {
        console.warn(`[Forge] Orchestrator not ready (attempt ${attempt + 1}), retrying in ${Math.round(delayMs)}ms…`);
        connectWithRetry(client, url, attempt + 1, maxAttempts);
      } else {
        console.error('[Forge] Could not connect to orchestrator after', maxAttempts, 'attempts:', err);
      }
    }
  }, attempt === 0 ? 500 : delayMs);
}

function startAgentsSidecar(context: vscode.ExtensionContext): void {
  const agentsEntry = context.asAbsolutePath(
    path.join('..', '..', 'packages', 'agents', 'src', 'index.ts'),
  );

  agentsProcess = cp.spawn(
    'node',
    ['--import', 'tsx/esm', agentsEntry],
    {
      env: {
        ...process.env,
        FORGE_IPC_PORT: '7700',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  agentsProcess.stdout?.on('data', (data: Buffer) => {
    console.log('[Forge Agents]', data.toString().trim());
  });

  agentsProcess.stderr?.on('data', (data: Buffer) => {
    console.error('[Forge Agents ERROR]', data.toString().trim());
  });

  agentsProcess.on('exit', (code) => {
    console.log(`[Forge Agents] Exited with code ${code}`);
  });
}
