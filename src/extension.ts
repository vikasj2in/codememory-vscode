// src/extension.ts

import * as vscode from 'vscode';
import { CodeIndexer } from './indexer/indexer';
import { VectorStore } from './vectorstore/memoryVectorStore';
import { ContextManager } from './context/contextManager';
import { LLMInterface } from './llm/llmInterface';
import { CodeMemoryViewProvider } from './ui/viewProvider';
import { StatusBarManager } from './ui/statusBar';
import { 
  IndexingProgress, 
  LLMConfig, 
  VectorSearchResult,
  CodeChunk 
} from './types';

let codeIndexer: CodeIndexer | null = null;
let contextManager: ContextManager | null = null;
let llmInterface: LLMInterface | null = null;
let statusBarManager: StatusBarManager | null = null;
let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {
  console.log('CodeMemory extension is activating...');
  
  // Create output channel for logging
  outputChannel = vscode.window.createOutputChannel('CodeMemory');
  outputChannel.appendLine('CodeMemory extension starting...');

  // Initialize components
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('CodeMemory requires an open workspace');
    return;
  }

  try {
    await initializeExtension(context, workspaceFolder.uri.fsPath);
    outputChannel.appendLine('CodeMemory extension initialized successfully');
  } catch (error) {
    outputChannel.appendLine(`Failed to initialize: ${error}`);
    vscode.window.showErrorMessage(`CodeMemory initialization failed: ${error}`);
  }
}

async function initializeExtension(context: vscode.ExtensionContext, workspacePath: string) {
  // Initialize status bar
  statusBarManager = new StatusBarManager();
  context.subscriptions.push(statusBarManager);

  // Get API key for embeddings
  const codememorySettings = vscode.workspace.getConfiguration('codememory');
  const apiKey = codememorySettings.get<string>('apiKey');

  // Initialize core components
  codeIndexer = new CodeIndexer(workspacePath, apiKey);
  const projectName = vscode.workspace.name || 'default';
  await codeIndexer.initialize(projectName);

  const vectorStore = new VectorStore(workspacePath, apiKey);
  await vectorStore.initialize(projectName);

  contextManager = new ContextManager(workspacePath, vectorStore);

  // Initialize LLM interface
  const llmConfig = getLLMConfig();
  if (llmConfig.apiKey) {
    llmInterface = new LLMInterface(llmConfig);
  } else {
    console.log('No API key configured, LLM features will be disabled');
  }

  // Set up indexing progress callback
  codeIndexer.setProgressCallback((progress: IndexingProgress) => {
    statusBarManager?.updateIndexingStatus(progress);
    if (progress.status === 'completed') {
      vscode.window.showInformationMessage(
        `CodeMemory: Indexed ${progress.processedFiles} files successfully`
      );
    } else if (progress.status === 'error') {
      vscode.window.showErrorMessage(
        `CodeMemory: Indexing failed with ${progress.errors.length} errors`
      );
    }
  });

  // Register commands
  registerCommands(context);

  // Register view providers
  const memoryViewProvider = new CodeMemoryViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'codememory.memoryView',
      memoryViewProvider
    )
  );

  // Set up file watchers
  setupFileWatchers(context);

  // Auto-index if enabled
  const codememoryConfig = vscode.workspace.getConfiguration('codememory');
  if (codememoryConfig.get<boolean>('autoIndex')) {
    vscode.window.showInformationMessage('CodeMemory: Starting automatic indexing...');
    indexWorkspace();
  }
}

function registerCommands(context: vscode.ExtensionContext) {
  // Index workspace command
  context.subscriptions.push(
    vscode.commands.registerCommand('codememory.indexWorkspace', indexWorkspace)
  );

  // Explain code command
  context.subscriptions.push(
    vscode.commands.registerCommand('codememory.explainCode', explainSelectedCode)
  );

  // Find related code command
  context.subscriptions.push(
    vscode.commands.registerCommand('codememory.findRelated', findRelatedCode)
  );

  // Ask question command
  context.subscriptions.push(
    vscode.commands.registerCommand('codememory.askQuestion', askQuestion)
  );

  // Show memory status command
  context.subscriptions.push(
    vscode.commands.registerCommand('codememory.showMemoryStatus', showMemoryStatus)
  );
}

async function indexWorkspace() {
  if (!codeIndexer) {
    vscode.window.showErrorMessage('CodeMemory not initialized');
    return;
  }

  const config = vscode.workspace.getConfiguration('codememory');
  const fileTypes = config.get<string[]>('indexFileTypes');

  try {
    await codeIndexer.indexWorkspace(fileTypes);
  } catch (error) {
    outputChannel.appendLine(`Indexing error: ${error}`);
    vscode.window.showErrorMessage(`Indexing failed: ${error}`);
  }
}

async function explainSelectedCode() {
  if (!llmInterface) {
    const config = getLLMConfig();
    if (!config.apiKey) {
      const action = await vscode.window.showErrorMessage(
        'CodeMemory: No API key configured. Would you like to configure one now?',
        'Open Settings'
      );
      if (action === 'Open Settings') {
        vscode.commands.executeCommand('workbench.action.openSettings', 'codememory.apiKey');
      }
      return;
    }
    
    // Try to initialize LLM if we have a key
    llmInterface = new LLMInterface(config);
  }

  if (!contextManager) {
    vscode.window.showErrorMessage('CodeMemory not initialized');
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection);

  if (!selectedText) {
    vscode.window.showInformationMessage('Please select code to explain');
    return;
  }

  try {
    statusBarManager?.setLoading(true, 'Analyzing code...');

    // Create a temporary chunk for the selection
    const chunk: CodeChunk = {
      id: 'temp',
      filepath: editor.document.uri.fsPath,
      content: selectedText,
      type: 'function', // We'd need to detect this properly
      name: 'Selected Code',
      startLine: selection.start.line,
      endLine: selection.end.line,
      language: editor.document.languageId,
      metadata: {}
    };

    // Get context
    const context = await contextManager.getCodeExplanationContext(chunk);
    
    // Get explanation
    const explanation = await llmInterface.explainCode(
      chunk,
      [...context.dependencies, ...context.relatedChunks]
    );

    // Show explanation in a new panel
    const panel = vscode.window.createWebviewPanel(
      'codeExplanation',
      'Code Explanation',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    panel.webview.html = generateExplanationHtml(chunk, explanation);

    statusBarManager?.setLoading(false);
  } catch (error) {
    statusBarManager?.setLoading(false);
    outputChannel.appendLine(`Explain error: ${error}`);
    vscode.window.showErrorMessage(`Failed to explain code: ${error}`);
  }
}

async function findRelatedCode() {
  if (!contextManager) {
    vscode.window.showErrorMessage('CodeMemory not initialized');
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const selection = editor.selection;
  const selectedText = editor.document.getText(selection) || editor.document.getText();

  try {
    statusBarManager?.setLoading(true, 'Finding related code...');

    const results = await contextManager.getRelevantContext(selectedText, 10);

    // Create quick pick items
    const items = results.chunks.map(result => ({
      label: `$(file) ${result.chunk.name}`,
      description: result.chunk.filepath,
      detail: `${result.chunk.type} - Lines ${result.chunk.startLine}-${result.chunk.endLine} (similarity: ${(1 - result.score).toFixed(2)})`,
      chunk: result.chunk
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select code to navigate to',
      matchOnDescription: true,
      matchOnDetail: true
    });

    if (selected) {
      // Open the file and navigate to the chunk
      const uri = vscode.Uri.file(selected.chunk.filepath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);
      
      const start = new vscode.Position(selected.chunk.startLine, 0);
      const end = new vscode.Position(selected.chunk.endLine, 0);
      editor.selection = new vscode.Selection(start, end);
      editor.revealRange(new vscode.Range(start, end));
    }

    statusBarManager?.setLoading(false);
  } catch (error) {
    statusBarManager?.setLoading(false);
    outputChannel.appendLine(`Find related error: ${error}`);
    vscode.window.showErrorMessage(`Failed to find related code: ${error}`);
  }
}

async function askQuestion() {
  if (!llmInterface || !contextManager) {
    vscode.window.showErrorMessage('CodeMemory: LLM not configured');
    return;
  }

  const question = await vscode.window.showInputBox({
    prompt: 'Ask a question about your codebase',
    placeHolder: 'e.g., How does the authentication system work?'
  });

  if (!question) return;

  try {
    statusBarManager?.setLoading(true, 'Thinking...');

    // Get relevant context
    const context = await contextManager.getRelevantContext(question, 15);

    // Get answer from LLM
    const answer = await llmInterface.askQuestion(
      question,
      context.chunks,
      context.projectInfo || undefined
    );

    // Record in memory
    await contextManager.recordMemoryEntry(
      question,
      answer,
      context.chunks.map(c => c.chunk.id)
    );

    // Show answer
    const panel = vscode.window.createWebviewPanel(
      'codeAnswer',
      'CodeMemory Answer',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    panel.webview.html = generateAnswerHtml(question, answer, context.chunks);

    statusBarManager?.setLoading(false);
  } catch (error) {
    statusBarManager?.setLoading(false);
    outputChannel.appendLine(`Question error: ${error}`);
    vscode.window.showErrorMessage(`Failed to answer question: ${error}`);
  }
}

async function showMemoryStatus() {
  if (!codeIndexer) {
    vscode.window.showErrorMessage('CodeMemory not initialized');
    return;
  }

  try {
    const stats = await codeIndexer.getIndexStats();
    
    const message = `
CodeMemory Status:
- Total chunks indexed: ${stats.totalChunks}
- Languages: ${Object.entries(stats.chunksByLanguage).map(([lang, count]) => `${lang}(${count})`).join(', ')}
- Types: ${Object.entries(stats.chunksByType).map(([type, count]) => `${type}(${count})`).join(', ')}
    `;

    vscode.window.showInformationMessage(message, { modal: true });
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to get status: ${error}`);
  }
}

function setupFileWatchers(context: vscode.ExtensionContext) {
  if (!codeIndexer) return;

  const watcher = vscode.workspace.createFileSystemWatcher('**/*');

  watcher.onDidCreate(async (uri) => {
    if (shouldIndexFile(uri)) {
      outputChannel.appendLine(`Indexing new file: ${uri.fsPath}`);
      await codeIndexer!.indexFile(uri);
    }
  });

  watcher.onDidChange(async (uri) => {
    if (shouldIndexFile(uri)) {
      outputChannel.appendLine(`Updating index for: ${uri.fsPath}`);
      await codeIndexer!.updateFile(uri);
    }
  });

  watcher.onDidDelete(async (uri) => {
    outputChannel.appendLine(`Removing from index: ${uri.fsPath}`);
    await codeIndexer!.deleteFile(uri);
  });

  context.subscriptions.push(watcher);
}

function shouldIndexFile(uri: vscode.Uri): boolean {
  const config = vscode.workspace.getConfiguration('codememory');
  const fileTypes = config.get<string[]>('indexFileTypes') || [];
  
  return fileTypes.some(ext => uri.fsPath.endsWith(ext));
}

function getLLMConfig(): LLMConfig {
  const config = vscode.workspace.getConfiguration('codememory');
  
  const llmConfig = {
    provider: config.get<'openai' | 'anthropic'>('llmProvider') || 'openai',
    apiKey: config.get<string>('apiKey'),
    model: config.get<string>('llmModel'),
    temperature: config.get<number>('llmTemperature') || 0.3,
    maxTokens: config.get<number>('llmMaxTokens') || 2000
  };

  console.log('LLM Config:', {
    provider: llmConfig.provider,
    hasApiKey: !!llmConfig.apiKey,
    apiKeyLength: llmConfig.apiKey?.length
  });

  return llmConfig;
}

function generateExplanationHtml(chunk: CodeChunk, explanation: any): string {
  return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        h1, h2 {
            color: var(--vscode-editor-foreground);
        }
        .section {
            margin: 20px 0;
            padding: 15px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 5px;
        }
        .code-block {
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            padding: 10px;
            border-radius: 3px;
            overflow-x: auto;
        }
        .tag {
            display: inline-block;
            padding: 2px 8px;
            margin: 2px;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 3px;
            font-size: 0.9em;
        }
    </style>
</head>
<body>
    <h1>${chunk.name}</h1>
    <p><strong>Type:</strong> ${chunk.type} | <strong>Language:</strong> ${chunk.language}</p>
    <p><strong>File:</strong> ${chunk.filepath}</p>
    
    <div class="section">
        <h2>Summary</h2>
        <p>${explanation.summary}</p>
    </div>
    
    <div class="section">
        <h2>Purpose</h2>
        <p>${explanation.purpose}</p>
    </div>
    
    <div class="section">
        <h2>Dependencies</h2>
        ${explanation.dependencies.map((dep: string) => `<span class="tag">${dep}</span>`).join('')}
    </div>
    
    ${explanation.sideEffects && explanation.sideEffects.length > 0 ? `
    <div class="section">
        <h2>Side Effects</h2>
        <ul>
            ${explanation.sideEffects.map((effect: string) => `<li>${effect}</li>`).join('')}
        </ul>
    </div>
    ` : ''}
    
    ${explanation.suggestions && explanation.suggestions.length > 0 ? `
    <div class="section">
        <h2>Suggestions</h2>
        <ul>
            ${explanation.suggestions.map((suggestion: string) => `<li>${suggestion}</li>`).join('')}
        </ul>
    </div>
    ` : ''}
</body>
</html>
`;
}

function generateAnswerHtml(question: string, answer: string, sources: VectorSearchResult[]): string {
  const sourcesHtml = sources.slice(0, 5).map(source => `
    <div class="source">
        <strong>${source.chunk.name}</strong> (${source.chunk.type})
        <br>
        <small>${source.chunk.filepath}:${source.chunk.startLine}-${source.chunk.endLine}</small>
    </div>
  `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
            max-width: 800px;
        }
        h1, h2 {
            color: var(--vscode-editor-foreground);
        }
        .question {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .answer {
            margin: 20px 0;
            white-space: pre-wrap;
        }
        .sources {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .source {
            margin: 10px 0;
            padding: 10px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <h1>CodeMemory Answer</h1>
    
    <div class="question">
        <strong>Question:</strong> ${question}
    </div>
    
    <div class="answer">${answer}</div>
    
    <div class="sources">
        <h2>Sources</h2>
        ${sourcesHtml}
    </div>
</body>
</html>
`;
}

export function deactivate() {
  outputChannel.appendLine('CodeMemory extension deactivating...');
  outputChannel.dispose();
}