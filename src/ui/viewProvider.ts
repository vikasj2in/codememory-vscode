// src/ui/viewProvider.ts

import * as vscode from 'vscode';

export class CodeMemoryViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'codememory.memoryView';
  private _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(data => {
      switch (data.type) {
        case 'refresh':
          vscode.commands.executeCommand('codememory.showMemoryStatus');
          break;
        case 'index':
          vscode.commands.executeCommand('codememory.indexWorkspace');
          break;
        case 'search':
          vscode.commands.executeCommand('codememory.askQuestion');
          break;
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CodeMemory</title>
    <style>
        body {
            padding: 10px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
        }
        
        .section {
            margin-bottom: 20px;
        }
        
        .section h3 {
            margin-bottom: 10px;
            font-size: 14px;
            font-weight: 600;
        }
        
        .stat-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
        }
        
        .stat-item {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 10px;
            border-radius: 4px;
        }
        
        .stat-value {
            font-size: 20px;
            font-weight: bold;
            color: var(--vscode-editor-foreground);
        }
        
        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }
        
        button {
            width: 100%;
            padding: 8px;
            margin: 4px 0;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
        }
        
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        .recent-queries {
            max-height: 200px;
            overflow-y: auto;
        }
        
        .query-item {
            padding: 8px;
            margin: 4px 0;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
            cursor: pointer;
        }
        
        .query-item:hover {
            background-color: var(--vscode-editor-selectionBackground);
        }
        
        .query-time {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="section">
        <h3>Memory Status</h3>
        <div class="stat-grid">
            <div class="stat-item">
                <div class="stat-value" id="totalChunks">0</div>
                <div class="stat-label">Total Chunks</div>
            </div>
            <div class="stat-item">
                <div class="stat-value" id="totalFiles">0</div>
                <div class="stat-label">Indexed Files</div>
            </div>
            <div class="stat-item">
                <div class="stat-value" id="memorySize">0 MB</div>
                <div class="stat-label">Memory Size</div>
            </div>
            <div class="stat-item">
                <div class="stat-value" id="lastIndexed">Never</div>
                <div class="stat-label">Last Indexed</div>
            </div>
        </div>
    </div>
    
    <div class="section">
        <h3>Actions</h3>
        <button onclick="indexWorkspace()">
            <span>$(sync) Reindex Workspace</span>
        </button>
        <button onclick="askQuestion()">
            <span>$(search) Ask Question</span>
        </button>
        <button onclick="refreshStats()">
            <span>$(refresh) Refresh Stats</span>
        </button>
    </div>
    
    <div class="section">
        <h3>Recent Queries</h3>
        <div class="recent-queries" id="recentQueries">
            <div class="query-item">
                <div>No recent queries</div>
            </div>
        </div>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        
        function indexWorkspace() {
            vscode.postMessage({ type: 'index' });
        }
        
        function askQuestion() {
            vscode.postMessage({ type: 'search' });
        }
        
        function refreshStats() {
            vscode.postMessage({ type: 'refresh' });
        }
        
        // Update stats periodically
        setInterval(refreshStats, 30000);
    </script>
</body>
</html>`;
  }
}