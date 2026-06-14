import fs from 'node:fs';
import path from 'node:path';
import type { ForgeEvent } from '@forge/types';

// ─────────────────────────────────────────────────────────────
// TRANSACTION LOG
// Append-only NDJSON log. One event per line.
// Never rewritten — only compacted after mission close.
// Lives at: .forge/missions/<mission_id>/log.ndjson
// ─────────────────────────────────────────────────────────────

export class TransactionLog {
  private logPath: string;
  private fd: number | null = null;

  constructor(missionId: string, forgeRoot: string) {
    const dir = path.join(forgeRoot, 'missions', missionId);
    fs.mkdirSync(dir, { recursive: true });
    this.logPath = path.join(dir, 'log.ndjson');
  }

  append(event: ForgeEvent): void {
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(this.logPath, line, { encoding: 'utf-8' });
  }

  readAll(): ForgeEvent[] {
    if (!fs.existsSync(this.logPath)) return [];
    const content = fs.readFileSync(this.logPath, 'utf-8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as ForgeEvent);
  }

  getPath(): string {
    return this.logPath;
  }
}
