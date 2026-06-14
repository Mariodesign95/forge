import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startRunner } from './runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load dotenv from workspace root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
// Fallback to local
dotenv.config();

console.log('[Agents] Starting agent runner...');

startRunner().catch((err) => {
  console.error('[Agents] Fatal runner error:', err);
  process.exit(1);
});
