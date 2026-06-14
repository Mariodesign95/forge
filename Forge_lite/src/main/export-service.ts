/**
 * ExportService — Handles packaging generated project code into ZIP archives.
 *
 * Requirements: 7.2, 7.3, 7.7
 */

import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { Brief, ProjectFile, ExportTemplate } from '../renderer/types';

export class ExportService {
  /**
   * Helper to clean up string names for files.
   */
  private cleanBrandName(brandName: string): string {
    return brandName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  /**
   * Generates the configuration files specific to each export template.
   */
  getTemplateFiles(template: ExportTemplate, brief: Brief): Record<string, string> {
    const brandSlug = this.cleanBrandName(brief.brandName || 'my-site');
    const files: Record<string, string> = {};

    // Standard .gitignore
    const gitignore = `node_modules/
.DS_Store
dist/
dist-app/
.next/
out/
*.log
*.zip
.env*
`;

    files['.gitignore'] = gitignore;

    if (template === 'react-vite') {
      // package.json for React + Vite
      files['package.json'] = JSON.stringify(
        {
          name: brandSlug,
          private: true,
          version: '0.1.0',
          type: 'module',
          scripts: {
            dev: 'vite',
            build: 'tsc && vite build',
            preview: 'vite preview',
          },
          dependencies: {
            react: '^18.3.1',
            'react-dom': '^18.3.1',
          },
          devDependencies: {
            '@types/react': '^18.3.12',
            '@types/react-dom': '^18.3.1',
            '@vitejs/plugin-react': '^4.3.4',
            typescript: '^5.7.2',
            vite: '^6.0.3',
          },
        },
        null,
        2
      );

      // vite.config.ts
      files['vite.config.ts'] = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`;

      // tsconfig.json
      files['tsconfig.json'] = JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2020',
            useDefineForClassFields: true,
            lib: ['DOM', 'DOM.Iterable', 'ES2020'],
            module: 'ESNext',
            skipLibCheck: true,
            moduleResolution: 'node',
            resolveJsonModule: true,
            isolatedModules: true,
            noEmit: true,
            jsx: 'react-jsx',
            strict: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            noFallthroughCasesInSwitch: true,
          },
        },
        null,
        2
      );
    } else if (template === 'nextjs') {
      // package.json for Next.js
      files['package.json'] = JSON.stringify(
        {
          name: brandSlug,
          private: true,
          version: '0.1.0',
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
            lint: 'next lint',
          },
          dependencies: {
            react: '^18.3.1',
            'react-dom': '^18.3.1',
            next: '14.2.15',
          },
          devDependencies: {
            typescript: '^5.0.0',
            '@types/node': '^20.0.0',
            '@types/react': '^18.0.0',
            '@types/react-dom': '^18.0.0',
          },
        },
        null,
        2
      );

      // next.config.js
      files['next.config.js'] = `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = nextConfig;
`;

      // tsconfig.json
      files['tsconfig.json'] = JSON.stringify(
        {
          compilerOptions: {
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'node',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            paths: {
              '@/*': ['./*'],
            },
          },
          exclude: ['node_modules'],
        },
        null,
        2
      );
    }

    return files;
  }

  /**
   * Generates a ZIP archive containing all project files and template files.
   * Resolves with the absolute path of the generated ZIP.
   * Rejects with an IpcError on failure (EXPORT_WRITE_ERROR).
   */
  async createZip(
    projectId: string,
    template: ExportTemplate,
    destDir: string,
    projectFiles: ProjectFile[],
    brief: Brief
  ): Promise<string> {
    const brandSlug = this.cleanBrandName(brief.brandName || 'my-site');
    const zipName = `${brandSlug}-${template}.zip`;
    const zipPath = path.join(destDir, zipName);

    return new Promise((resolve, reject) => {
      try {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', {
          zlib: { level: 9 }, // Maximum compression level (Requirement 7.2 / Task 8.1)
        });

        output.on('close', () => {
          console.log(`[ExportService] ZIP successfully generated: ${zipPath} (${archive.pointer()} total bytes)`);
          resolve(zipPath);
        });

        archive.on('error', (err) => {
          console.error('[ExportService] Archiver error:', err);
          reject({
            code: 'EXPORT_WRITE_ERROR',
            message: `Failed to compile the zip archive: ${err.message}`,
          });
        });

        output.on('error', (err) => {
          console.error('[ExportService] Write stream error:', err);
          reject({
            code: 'EXPORT_WRITE_ERROR',
            message: `Failed to write zip file to destination: ${err.message}`,
          });
        });

        archive.pipe(output);

        // 1. Add all project files
        for (const file of projectFiles) {
          archive.append(file.content, { name: file.path });
        }

        // 2. Add template configurations
        const templateFiles = this.getTemplateFiles(template, brief);
        for (const [filePath, content] of Object.entries(templateFiles)) {
          archive.append(content, { name: filePath });
        }

        archive.finalize();
      } catch (err: any) {
        console.error('[ExportService] Exception in createZip:', err);
        reject({
          code: 'EXPORT_WRITE_ERROR',
          message: err.message || String(err),
        });
      }
    });
  }
}

export const exportService = new ExportService();
