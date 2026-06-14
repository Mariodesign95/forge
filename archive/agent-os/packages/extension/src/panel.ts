import * as vscode from 'vscode';
import * as fs from 'fs';
import type { OrchestratorClient } from './orchestrator-client.js';

// ─────────────────────────────────────────────────────────────
// FORGE PANEL — Full-screen Webview
// Hosts the React UI (Mission Bar, Kanban, Live Feed).
// Receives events from the Orchestrator and forwards to React.
// React sends commands back via postMessage → IPC.
// ─────────────────────────────────────────────────────────────

export class ForgePanel {
  public static currentPanel: ForgePanel | undefined;
  private static readonly viewType = 'forgeMissionControl';

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private unsubscribeEvents: (() => void) | undefined;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    private client: OrchestratorClient,
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;

    this.panel.webview.html = this.getHtmlContent(this.panel.webview);

    // Forward orchestrator events → React
    this.unsubscribeEvents = client.onEvent((event) => {
      if (this.panel.visible) {
        this.panel.webview.postMessage({ type: 'FORGE_EVENT', data: event });
      }
    });

    // Handle messages from React → Orchestrator
    this.panel.webview.onDidReceiveMessage(
      async (msg: { type: string; id: string; payload: Record<string, unknown> }) => {
        try {
          const response = await client.send(msg.type as any, msg.payload);
          this.panel.webview.postMessage({ type: 'IPC_RESPONSE', data: response });
        } catch (err) {
          this.panel.webview.postMessage({
            type: 'IPC_RESPONSE',
            data: { id: msg.id, success: false, error: String(err) },
          });
        }
      },
      null,
      this.disposables,
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    client: OrchestratorClient,
  ): ForgePanel {
    const column = vscode.ViewColumn.One;

    if (ForgePanel.currentPanel) {
      ForgePanel.currentPanel.panel.reveal(column);
      return ForgePanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      ForgePanel.viewType,
      'Forge',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist', 'ui'),
        ],
      },
    );

    ForgePanel.currentPanel = new ForgePanel(panel, extensionUri, client);
    return ForgePanel.currentPanel;
  }

  public postMessage(msg: Record<string, unknown>): void {
    this.panel.webview.postMessage(msg);
  }

  private getHtmlContent(webview: vscode.Webview): string {
    // In dev mode, load from local Vite dev server
    const isDev = process.env['FORGE_DEV'] === 'true';

    if (isDev) {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Forge Agent OS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0f; }
    iframe { width: 100%; height: 100%; border: none; }
  </style>
</head>
<body>
  <iframe src="http://localhost:5173" id="forge-ui"></iframe>
  <script>
    const vscode = acquireVsCodeApi();
    const iframe = document.getElementById('forge-ui');

    // Extension → iframe
    window.addEventListener('message', (e) => {
      if (e.source === iframe.contentWindow) {
        // From React → extension
        vscode.postMessage(e.data);
      } else {
        // From extension → React
        iframe.contentWindow?.postMessage(e.data, '*');
      }
    });
  </script>
</body>
</html>`;
    }

    // Production: read and parse dist/ui/index.html
    const htmlUri = vscode.Uri.joinPath(this.extensionUri, 'dist', 'ui', 'index.html');
    try {
      let htmlContent = fs.readFileSync(htmlUri.fsPath, 'utf8');

      // Inject Content Security Policy
      const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${webview.cspSource} 'unsafe-inline'; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource}; connect-src ws://localhost:7700;" />`;
      htmlContent = htmlContent.replace('<head>', `<head>\n  ${csp}`);

      // Map paths to Webview URIs
      const updatedHtml = htmlContent.replace(
        /(href|src)="\/(assets\/[^"]+)"/g,
        (_, attr: string, relPath: string) => {
          const webviewUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'dist', 'ui', relPath)
          );
          return `${attr}="${webviewUri}"`;
        }
      );

      return updatedHtml;
    } catch (err) {
      return `<!DOCTYPE html><html><body>Error loading UI index.html: ${String(err)}</body></html>`;
    }
  }

  public dispose(): void {
    ForgePanel.currentPanel = undefined;
    this.unsubscribeEvents?.();
    this.panel.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
