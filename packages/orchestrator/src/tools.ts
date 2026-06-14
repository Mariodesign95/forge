import path from 'node:path';
import fs from 'node:fs';
import type { ToolContext, ToolResult } from '@forge/types';

// ─────────────────────────────────────────────────────────────
// TOOL REGISTRY — Phase 1
// Workspace-scoped tools. Every path is validated against
// the workspace root. Symlinks outside workspace rejected.
// Per security.md: lightweight isolation Phase 1.
// ─────────────────────────────────────────────────────────────

function assertInWorkspace(filePath: string, workspaceRoot: string): void {
  const resolved = path.resolve(filePath);
  const workspace = path.resolve(workspaceRoot);

  // Reject symlinks pointing outside workspace
  try {
    const real = fs.realpathSync(resolved);
    if (!real.startsWith(workspace + path.sep) && real !== workspace) {
      throw new Error(`Path escapes workspace: ${filePath}`);
    }
  } catch (err: unknown) {
    const error = err as NodeJS.ErrnoException;
    if (error.code !== 'ENOENT') throw err;
    // File doesn't exist yet — check the parent directory
    const parent = fs.realpathSync(path.dirname(resolved));
    if (!parent.startsWith(workspace + path.sep) && parent !== workspace) {
      throw new Error(`Path escapes workspace: ${filePath}`);
    }
  }

  if (!resolved.startsWith(workspace + path.sep) && resolved !== workspace) {
    throw new Error(`Path escapes workspace: ${filePath}`);
  }
}

// ── fs.read (Level 1) ────────────────────────────────────────

export async function fsRead(
  filePath: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  const fullPath = path.join(ctx.workspace_root, filePath);
  assertInWorkspace(fullPath, ctx.workspace_root);

  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    return { success: true, output: content };
  } catch (err) {
    return { success: false, output: null, error: String(err) };
  }
}

// ── fs.write (Level 2) ───────────────────────────────────────

export async function fsWrite(
  filePath: string,
  content: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  const fullPath = path.join(ctx.workspace_root, filePath);
  assertInWorkspace(fullPath, ctx.workspace_root);

  try {
    // Snapshot before overwriting
    if (fs.existsSync(fullPath)) {
      const snapshotDir = path.join(ctx.workspace_root, '.forge', 'snapshots');
      fs.mkdirSync(snapshotDir, { recursive: true });
      const snapshotName = `${Date.now()}_${path.basename(filePath)}`;
      fs.copyFileSync(fullPath, path.join(snapshotDir, snapshotName));
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    return { success: true, output: fullPath };
  } catch (err) {
    return { success: false, output: null, error: String(err) };
  }
}

// ── fs.list (Level 1) ────────────────────────────────────────

export async function fsList(
  dirPath: string,
  ctx: ToolContext,
): Promise<ToolResult> {
  const fullPath = path.join(ctx.workspace_root, dirPath);
  assertInWorkspace(fullPath, ctx.workspace_root);

  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const result = entries.map((e) => ({
      name: e.name,
      isDir: e.isDirectory(),
      size: e.isFile()
        ? fs.statSync(path.join(fullPath, e.name)).size
        : undefined,
    }));
    return { success: true, output: result };
  } catch (err) {
    return { success: false, output: null, error: String(err) };
  }
}

// ── Terminal whitelist (Level 3) ─────────────────────────────

const TERMINAL_BLACKLIST = [
  'rm -rf /',
  'mkfs',
  'dd if=',
  ':(){ :|:& };:', // fork bomb
  'chmod 777 /',
  'sudo rm',
  'format c:',
];

export function isCommandBlacklisted(cmd: string): boolean {
  return TERMINAL_BLACKLIST.some((blocked) =>
    cmd.toLowerCase().includes(blocked.toLowerCase()),
  );
}

// ── terminal.run (Level 3) ───────────────────────────────────
// Executes a shell command inside the workspace.
// - Blacklist checked before execution
// - cwd is locked to workspace root
// - 60 second timeout (configurable)
// - stdout + stderr captured and returned

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface TerminalResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

export async function terminalRun(
  command: string,
  ctx: ToolContext,
  timeoutMs = 60_000,
): Promise<TerminalResult> {
  if (isCommandBlacklisted(command)) {
    return {
      success: false,
      stdout: '',
      stderr: '',
      exitCode: null,
      error: `Command blocked by security policy: "${command}"`,
    };
  }

  // Parse command into executable + args
  // Simple shell split — for complex pipelines use shell:true carefully
  const [executable, ...args] = command.split(/\s+/);

  if (!executable) {
    return { success: false, stdout: '', stderr: '', exitCode: null, error: 'Empty command' };
  }

  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      cwd: ctx.workspace_root,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      env: {
        ...process.env,
        // Strip sensitive env vars from child process
        FORGE_SECRET: undefined,
        OPENAI_API_KEY: undefined,
        ANTHROPIC_API_KEY: undefined,
        GOOGLE_API_KEY: undefined,
      },
    });

    return { success: true, stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
    return {
      success: false,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: typeof e.code === 'number' ? e.code : null,
      error: e.message,
    };
  }
}
