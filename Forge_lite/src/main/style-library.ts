/**
 * StyleLibrary — Loads and manages style token definitions from assets.
 *
 * Requirements: 4.1, 4.6
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { StyleDefinition } from '../renderer/types';

export class StyleLibrary {
  private styles: StyleDefinition[] = [];
  private isLoaded = false;

  /**
   * Resolves the absolute path to the assets/styles/ directory.
   */
  private getStylesPath(): string {
    // In dev: dist/main/ -> ../../assets/styles
    // In packaged app: resources/app.asar/dist/main/ -> ../../assets/styles
    // Both resolve to parent of 'dist' + 'assets/styles'
    return path.join(app.getAppPath(), 'assets', 'styles');
  }

  /**
   * Synchronously loads and caches all 10 style presets.
   * Requirement 4.6 — loaded locally without network requests.
   */
  loadStyles(): StyleDefinition[] {
    if (this.isLoaded) {
      return this.styles;
    }

    const stylesDir = this.getStylesPath();
    const styleFiles = [
      'stripe.json',
      'apple.json',
      'airbnb.json',
      'linear.json',
      'notion.json',
      'vercel.json',
      'figma.json',
      'supabase.json',
      'shadcn.json',
      'minimal.json',
    ];

    const loadedStyles: StyleDefinition[] = [];

    for (const fileName of styleFiles) {
      const filePath = path.join(stylesDir, fileName);
      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          const styleDef = JSON.parse(content) as StyleDefinition;
          
          // Validate structure minimally
          if (styleDef.id && styleDef.name && styleDef.colors && styleDef.promptBlock) {
            loadedStyles.push(styleDef);
          } else {
            console.warn(`[StyleLibrary] Style file ${fileName} has invalid schema.`);
          }
        } else {
          console.error(`[StyleLibrary] Style file not found: ${filePath}`);
        }
      } catch (err) {
        console.error(`[StyleLibrary] Failed to load style ${fileName}:`, err);
      }
    }

    this.styles = loadedStyles;
    this.isLoaded = true;
    return this.styles;
  }

  /**
   * Retrieves a specific style token by its ID.
   * Returns null if not found.
   */
  getStyleById(id: string): StyleDefinition | null {
    const allStyles = this.loadStyles();
    return allStyles.find((s) => s.id === id) || null;
  }
}

// Export singleton instance
export const styleLibrary = new StyleLibrary();
