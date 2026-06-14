import fs from 'node:fs';
import path from 'node:path';
import { chat } from '../model-router.js';
import type { Mission } from '@forge/types';

// ─────────────────────────────────────────────────────────────
// ARCHITECT AGENT
// Input:  mission.statement
// Output: requirements.md + architecture.md written to workspace
//         mission.blueprint populated
// Prompt strategy: single structured call, ask for two sections
// separated by a clear delimiter so we can parse reliably.
// ─────────────────────────────────────────────────────────────

export interface ArchitectOutput {
  requirements: string;
  architecture: string;
}

const SYSTEM_PROMPT = `You are the Architect agent in Forge, an AI agent operating system.
Your role is to analyze a mission statement and produce two technical documents:

1. REQUIREMENTS — a structured list of functional and non-functional requirements
2. ARCHITECTURE — a system design document describing components, data flows, tech stack choices

Rules:
- Be specific and actionable. Vague statements are useless.
- Use Markdown formatting.
- Structure requirements as numbered lists under clear categories.
- Architecture should include: components, data model, API design (if relevant), tech stack rationale.
- Do NOT generate code. This is a planning document.
- Output ONLY the two documents separated by exactly: ===ARCHITECTURE===

Format:
<requirements content here>
===ARCHITECTURE===
<architecture content here>`;

export async function runArchitect(mission: Mission): Promise<ArchitectOutput> {
  console.log(`[Architect] Analyzing mission: "${mission.title}"`);

  const response = await chat([
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Mission title: ${mission.title}\n\nMission statement:\n${mission.statement}`,
    },
  ], { agent: 'Architect' });

  console.log(
    `[Architect] Response received — ${response.usage.input_tokens} in / ${response.usage.output_tokens} out — €${response.usage.cost_eur.toFixed(4)}`,
  );

  // Parse delimiter
  const delimiter = '===ARCHITECTURE===';
  const delimIdx = response.content.indexOf(delimiter);

  let requirements: string;
  let architecture: string;

  if (delimIdx === -1) {
    // Model didn't follow format — treat entire response as requirements
    console.warn('[Architect] Missing delimiter — treating full response as requirements');
    requirements = response.content.trim();
    architecture = '# Architecture\n\n_To be defined in a follow-up planning session._';
  } else {
    requirements = response.content.slice(0, delimIdx).trim();
    architecture = response.content.slice(delimIdx + delimiter.length).trim();
  }

  // Write documents to workspace
  const docsDir = path.join(mission.workspace, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });

  const reqPath  = path.join(docsDir, 'requirements.md');
  const archPath = path.join(docsDir, 'architecture.md');

  fs.writeFileSync(reqPath,  `# Requirements\n\n${requirements}`,  'utf-8');
  fs.writeFileSync(archPath, `# Architecture\n\n${architecture}`, 'utf-8');

  console.log(`[Architect] Written docs to ${docsDir}`);

  return { requirements, architecture };
}
