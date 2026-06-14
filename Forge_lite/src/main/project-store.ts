/**
 * ProjectStore — Manages project metadata persistence in electron-store
 * and project files on the local filesystem.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { app } from 'electron';
import Store from 'electron-store';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Project, ProjectMeta } from '../renderer/types';

interface ProjectStoreSchema {
  projects: Record<string, Project>;
}

let _store: Store<ProjectStoreSchema> | null = null;

function getStore(): Store<ProjectStoreSchema> {
  if (!_store) {
    _store = new Store<ProjectStoreSchema>({
      name: 'project-store',
      defaults: {
        projects: {},
      },
    });
  }
  return _store;
}

/**
 * Returns the default base directory where all projects are stored:
 * ~/Documents/ForgeLite/projects/
 */
export function getBaseProjectsDir(): string {
  const documentsDir = app.getPath('documents');
  return path.join(documentsDir, 'ForgeLite', 'projects');
}

/**
 * Helper to delete a folder recursively.
 */
async function deleteFolderRecursive(folderPath: string): Promise<void> {
  try {
    await fs.rm(folderPath, { recursive: true, force: true });
  } catch (err) {
    console.error(`Failed to delete folder ${folderPath}:`, err);
  }
}

/**
 * Lists all project metadata, ordered by updatedAt descending.
 * Caps the return at 20 projects (LRU list) (Requirement 10.2).
 */
export function listProjects(): ProjectMeta[] {
  const store = getStore();
  const projectsMap = store.get('projects', {}) as Record<string, Project>;
  
  const projectsList = Object.values(projectsMap).map((proj) => ({
    id: proj.id,
    name: proj.name,
    siteType: proj.brief?.siteType || 'other',
    template: proj.template,
    provider: proj.provider,
    createdAt: proj.createdAt,
    updatedAt: proj.updatedAt,
    thumbnailDataUrl: (proj as any).thumbnailDataUrl || null,
  }));

  // Sort by updatedAt descending
  return projectsList
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 20);
}

/**
 * Loads a project's metadata by ID (Requirement 10.3).
 */
export function loadProject(projectId: string): Project | null {
  const store = getStore();
  const project = store.get(`projects.${projectId}`) as Project | undefined;
  return project || null;
}

/**
 * Saves or updates a project's metadata (Requirement 10.1).
 * Evicts the oldest project if total exceeds 20 (Requirement 10.2).
 */
export async function saveProject(project: Project): Promise<void> {
  const store = getStore();
  const baseDir = getBaseProjectsDir();
  
  // Set the correct files directory path (Requirement 10.4)
  project.filesDir = path.join(baseDir, project.id);
  
  // Ensure the project's folder exists
  await fs.mkdir(project.filesDir, { recursive: true });

  // Update projects list
  const projectsMap = store.get('projects', {}) as Record<string, Project>;
  projectsMap[project.id] = project;
  store.set('projects', projectsMap);

  // Eviction Logic (Requirement 10.2):
  // Check if we exceed 20 projects. If so, evict the oldest one based on updatedAt.
  const projects = Object.values(projectsMap);
  if (projects.length > 20) {
    // Sort ascending to get the oldest first
    const sorted = projects.sort(
      (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    );
    
    // Evict as many as needed to reach 20
    const toEvictCount = sorted.length - 20;
    for (let i = 0; i < toEvictCount; i++) {
      const evicted = sorted[i];
      console.log(`[ProjectStore] Evicting oldest project: ${evicted.name} (${evicted.id})`);
      
      // Delete metadata
      delete projectsMap[evicted.id];
      
      // Delete project files recursively on disk
      const evictedPath = path.join(baseDir, evicted.id);
      await deleteFolderRecursive(evictedPath);
    }
    
    // Update store with pruned list
    store.set('projects', projectsMap);
  }
}

/**
 * Deletes a project completely (Requirement 10.5).
 */
export async function deleteProject(projectId: string): Promise<void> {
  const store = getStore();
  
  // Remove from electron-store
  const projectsMap = store.get('projects', {}) as Record<string, Project>;
  delete projectsMap[projectId];
  store.set('projects', projectsMap);

  // Delete from disk
  const projectPath = path.join(getBaseProjectsDir(), projectId);
  await deleteFolderRecursive(projectPath);
}

/**
 * Writes a file inside the project directory (Requirement 10.4).
 */
export async function writeFile(projectId: string, relativeFilePath: string, content: string): Promise<void> {
  const projectPath = path.join(getBaseProjectsDir(), projectId);
  const fullFilePath = path.join(projectPath, relativeFilePath);
  
  // Ensure the directory for this file exists
  await fs.mkdir(path.dirname(fullFilePath), { recursive: true });
  await fs.writeFile(fullFilePath, content, 'utf8');
}

/**
 * Reads a file from the project directory (Requirement 10.4).
 */
export async function readFile(projectId: string, relativeFilePath: string): Promise<string> {
  const projectPath = path.join(getBaseProjectsDir(), projectId);
  const fullFilePath = path.join(projectPath, relativeFilePath);
  return await fs.readFile(fullFilePath, 'utf8');
}

/**
 * Recursively scans the project directory and returns a list of all files.
 * Useful for loading project files renderer-side.
 */
export async function readProjectFiles(projectId: string): Promise<{ path: string; content: string }[]> {
  const projectPath = path.join(getBaseProjectsDir(), projectId);
  const files: { path: string; content: string }[] = [];

  try {
    async function scan(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await scan(fullPath);
        } else if (entry.isFile()) {
          const relativePath = path.relative(projectPath, fullPath).replace(/\\/g, '/');
          const content = await fs.readFile(fullPath, 'utf8');
          files.push({ path: relativePath, content });
        }
      }
    }
    
    // Check if folder exists
    const exists = await fs.stat(projectPath).then(() => true).catch(() => false);
    if (exists) {
      await scan(projectPath);
    }
  } catch (err) {
    console.error(`Failed to scan files for project ${projectId}:`, err);
  }

  return files;
}
