// src/extension.ts

import * as vscode from 'vscode';
import { CodeIndexer } from './indexer/indexer';
import { VectorStore } from './vectorstore/memoryVectorStore';
import { ContextManager } from './context/contextManager';
import { LLMInterface } from './llm/llmInterface';
import { CodeMemoryViewProvider } from './ui/viewProvider';
import { StatusBarManager } from './ui/statusBar';
import { ArchitectureAnalyzer } from './core/architectureAnalyzer';
import { RefactoringAnalyzer } from './core/refactoringAnalyzer';
import { 
  IndexingProgress, 
  LLMConfig, 
  VectorSearchResult,
  CodeChunk 
} from './types';

let codeIndexer: CodeIndexer | null = null;
let contextManager: ContextManager | null = null;
let llmInterface: LLMInterface | undefined = undefined;
let statusBarManager: StatusBarManager | null = null;
let vectorStore: VectorStore | null = null;
let architectureAnalyzer: ArchitectureAnalyzer | null = null;
let refactoringAnalyzer: RefactoringAnalyzer | null = null;
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
  const config = vscode.workspace.getConfiguration('codememory');
  const apiKey = config.get<string>('apiKey');

  // Initialize core components
  codeIndexer = new CodeIndexer(workspacePath, apiKey);
  const projectName = vscode.workspace.name || 'default';
  await codeIndexer.initialize(projectName);

  const vectorStore = new VectorStore(workspacePath, apiKey);
  await vectorStore.initialize(projectName);
  
  // Store vectorStore globally for analyzers (fix variable name conflict)
  const globalVectorStore = vectorStore;

  contextManager = new ContextManager(workspacePath, vectorStore);

  // Initialize LLM interface
  const llmConfig = getLLMConfig();
  if (llmConfig.apiKey) {
    llmInterface = new LLMInterface(llmConfig);
  } else {
    console.log('No API key configured, LLM features will be disabled');
  }

  // Initialize analyzers
  architectureAnalyzer = new ArchitectureAnalyzer(vectorStore);
  refactoringAnalyzer = new RefactoringAnalyzer(vectorStore, llmInterface);

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
  if (config.get<boolean>('autoIndex')) {
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

  // Architecture analysis command
  context.subscriptions.push(
    vscode.commands.registerCommand('codememory.analyzeArchitecture', analyzeArchitecture)
  );

  // Refactoring suggestions command
  context.subscriptions.push(
    vscode.commands.registerCommand('codememory.suggestRefactoring', suggestRefactoring)
  );

  // Code quality analysis command
  context.subscriptions.push(
    vscode.commands.registerCommand('codememory.analyzeCodeQuality', analyzeCodeQuality)
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
async function analyzeArchitecture() {
  if (!architectureAnalyzer) {
    vscode.window.showErrorMessage('CodeMemory not initialized');
    return;
  }

  try {
    statusBarManager?.setLoading(true, 'Analyzing architecture...');

    const analysis = await architectureAnalyzer.analyzeArchitecture();

    // Create webview panel for results
    const panel = vscode.window.createWebviewPanel(
      'architectureAnalysis',
      'Architecture Analysis',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    panel.webview.html = generateArchitectureHtml(analysis);

    statusBarManager?.setLoading(false);
  } catch (error) {
    statusBarManager?.setLoading(false);
    outputChannel.appendLine(`Architecture analysis error: ${error}`);
    vscode.window.showErrorMessage(`Failed to analyze architecture: ${error}`);
  }
}

async function suggestRefactoring() {
  if (!refactoringAnalyzer) {
    vscode.window.showErrorMessage('CodeMemory not initialized');
    return;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    // Analyze entire codebase
    try {
      statusBarManager?.setLoading(true, 'Finding refactoring opportunities...');

      const suggestions = await refactoringAnalyzer.findGlobalRefactoringOpportunities();

      const panel = vscode.window.createWebviewPanel(
        'refactoringSuggestions',
        'Refactoring Suggestions',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      panel.webview.html = generateRefactoringHtml(suggestions);

      statusBarManager?.setLoading(false);
    } catch (error) {
      statusBarManager?.setLoading(false);
      outputChannel.appendLine(`Refactoring analysis error: ${error}`);
      vscode.window.showErrorMessage(`Failed to analyze refactoring: ${error}`);
    }
  } else {
    // Analyze current file/selection
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection) || editor.document.getText();

    const chunk: CodeChunk = {
      id: 'current',
      filepath: editor.document.uri.fsPath,
      content: selectedText,
      type: 'function',
      name: 'Current Selection',
      startLine: selection.start.line,
      endLine: selection.end.line,
      language: editor.document.languageId,
      metadata: {}
    };

    try {
      statusBarManager?.setLoading(true, 'Analyzing code for refactoring...');

      const suggestions = await refactoringAnalyzer.analyzeForRefactoring(chunk);

      const panel = vscode.window.createWebviewPanel(
        'refactoringSuggestions',
        'Refactoring Suggestions',
        vscode.ViewColumn.Beside,
        { enableScripts: true }
      );

      panel.webview.html = generateRefactoringHtml(suggestions);

      statusBarManager?.setLoading(false);
    } catch (error) {
      statusBarManager?.setLoading(false);
      outputChannel.appendLine(`Refactoring analysis error: ${error}`);
      vscode.window.showErrorMessage(`Failed to analyze refactoring: ${error}`);
    }
  }
}

async function analyzeCodeQuality() {
  if (!architectureAnalyzer || !refactoringAnalyzer) {
    vscode.window.showErrorMessage('CodeMemory not initialized');
    return;
  }

  try {
    statusBarManager?.setLoading(true, 'Analyzing code quality...');

    // Get both architecture and refactoring insights
    const [architecture, refactoring] = await Promise.all([
      architectureAnalyzer.analyzeArchitecture(),
      refactoringAnalyzer.findGlobalRefactoringOpportunities()
    ]);

    const panel = vscode.window.createWebviewPanel(
      'codeQuality',
      'Code Quality Report',
      vscode.ViewColumn.One,
      { enableScripts: true }
    );

    panel.webview.html = generateQualityReportHtml(architecture, refactoring);

    statusBarManager?.setLoading(false);
  } catch (error) {
    statusBarManager?.setLoading(false);
    outputChannel.appendLine(`Code quality analysis error: ${error}`);
    vscode.window.showErrorMessage(`Failed to analyze code quality: ${error}`);
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

// HTML Generation Functions

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

function generateArchitectureHtml(analysis: any): string {
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
        h1, h2, h3 {
            color: var(--vscode-editor-foreground);
        }
        .pattern {
            margin: 20px 0;
            padding: 15px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 5px;
        }
        .confidence {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 0.9em;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .high { background-color: #4CAF50; }
        .medium { background-color: #FF9800; }
        .low { background-color: #F44336; }
        .metric {
            display: inline-block;
            margin: 10px 20px 10px 0;
        }
        .metric-value {
            font-size: 2em;
            font-weight: bold;
        }
        .violation {
            margin: 10px 0;
            padding: 10px;
            background-color: var(--vscode-inputValidation-errorBackground);
            border-left: 3px solid var(--vscode-inputValidation-errorBorder);
        }
        .suggestion {
            margin: 10px 0;
            padding: 10px;
            background-color: var(--vscode-inputValidation-infoBackground);
            border-left: 3px solid var(--vscode-inputValidation-infoBorder);
        }
    </style>
</head>
<body>
    <h1>Architecture Analysis</h1>
    
    <h2>Metrics</h2>
    <div>
        <div class="metric">
            <div class="metric-value">${analysis.metrics.totalFiles}</div>
            <div>Total Files</div>
        </div>
        <div class="metric">
            <div class="metric-value">${Math.round(analysis.metrics.avgFileSize)}</div>
            <div>Avg File Size</div>
        </div>
        <div class="metric">
            <div class="metric-value">${analysis.metrics.avgDependencies.toFixed(1)}</div>
            <div>Avg Dependencies</div>
        </div>
        <div class="metric">
            <div class="metric-value">${(analysis.metrics.cohesion * 100).toFixed(0)}%</div>
            <div>Cohesion</div>
        </div>
        <div class="metric">
            <div class="metric-value">${analysis.metrics.complexity.toFixed(1)}</div>
            <div>Avg Complexity</div>
        </div>
    </div>
    
    <h2>Architectural Patterns Detected</h2>
    ${analysis.patterns.map((pattern: any) => `
        <div class="pattern">
            <h3>${pattern.pattern}</h3>
            <span class="confidence ${pattern.confidence > 0.8 ? 'high' : pattern.confidence > 0.6 ? 'medium' : 'low'}">
                Confidence: ${(pattern.confidence * 100).toFixed(0)}%
            </span>
            <p>${pattern.description}</p>
            ${pattern.locations.length > 0 ? `
                <p><strong>Found in:</strong></p>
                <ul>
                    ${pattern.locations.slice(0, 5).map((loc: string) => `<li>${loc}</li>`).join('')}
                    ${pattern.locations.length > 5 ? `<li>... and ${pattern.locations.length - 5} more</li>` : ''}
                </ul>
            ` : ''}
            ${pattern.suggestions && pattern.suggestions.length > 0 ? `
                <div class="suggestion">
                    <strong>Suggestions:</strong>
                    <ul>
                        ${pattern.suggestions.map((s: string) => `<li>${s}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            ${pattern.violations && pattern.violations.length > 0 ? `
                <div class="violation">
                    <strong>Violations:</strong>
                    <ul>
                        ${pattern.violations.map((v: string) => `<li>${v}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
        </div>
    `).join('')}
    
    <h2>Layer Architecture</h2>
    ${analysis.layers.violations.length > 0 ? `
        <div class="violation">
            <strong>Layer Violations Found:</strong>
            <ul>
                ${analysis.layers.violations.map((v: any) => 
                    `<li>${v.from} → ${v.to} in ${v.file}: ${v.description}</li>`
                ).join('')}
            </ul>
        </div>
    ` : '<p>No layer violations detected ✓</p>'}
    
    ${analysis.layers.suggestions.length > 0 ? `
        <div class="suggestion">
            <strong>Architecture Suggestions:</strong>
            <ul>
                ${analysis.layers.suggestions.map((s: string) => `<li>${s}</li>`).join('')}
            </ul>
        </div>
    ` : ''}
</body>
</html>
`;
}

function generateRefactoringHtml(suggestions: any[]): string {
  const bySeverity = {
    high: suggestions.filter(s => s.severity === 'high'),
    medium: suggestions.filter(s => s.severity === 'medium'),
    low: suggestions.filter(s => s.severity === 'low')
  };

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
        h1, h2, h3 {
            color: var(--vscode-editor-foreground);
        }
        .suggestion {
            margin: 20px 0;
            padding: 15px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 5px;
            border-left: 4px solid;
        }
        .high { border-left-color: #F44336; }
        .medium { border-left-color: #FF9800; }
        .low { border-left-color: #4CAF50; }
        .severity {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 0.9em;
            color: white;
        }
        .severity.high { background-color: #F44336; }
        .severity.medium { background-color: #FF9800; }
        .severity.low { background-color: #4CAF50; }
        .effort {
            display: inline-block;
            padding: 2px 8px;
            margin-left: 10px;
            border-radius: 3px;
            font-size: 0.9em;
            background-color: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .benefits {
            margin: 10px 0;
        }
        .benefits li {
            margin: 5px 0;
        }
        .code-suggestion {
            margin: 10px 0;
            padding: 10px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            white-space: pre-wrap;
        }
        .summary {
            margin: 20px 0;
            padding: 15px;
            background-color: var(--vscode-editor-selectionBackground);
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <h1>Refactoring Suggestions</h1>
    
    <div class="summary">
        <h2>Summary</h2>
        <p>Found <strong>${suggestions.length}</strong> refactoring opportunities:</p>
        <ul>
            <li>High Priority: ${bySeverity.high.length}</li>
            <li>Medium Priority: ${bySeverity.medium.length}</li>
            <li>Low Priority: ${bySeverity.low.length}</li>
        </ul>
    </div>
    
    ${bySeverity.high.length > 0 ? `
        <h2>High Priority</h2>
        ${bySeverity.high.map(s => generateSuggestionHtml(s)).join('')}
    ` : ''}
    
    ${bySeverity.medium.length > 0 ? `
        <h2>Medium Priority</h2>
        ${bySeverity.medium.map(s => generateSuggestionHtml(s)).join('')}
    ` : ''}
    
    ${bySeverity.low.length > 0 ? `
        <h2>Low Priority</h2>
        ${bySeverity.low.map(s => generateSuggestionHtml(s)).join('')}
    ` : ''}
</body>
</html>
`;
}

function generateSuggestionHtml(suggestion: any): string {
  return `
    <div class="suggestion ${suggestion.severity}">
        <h3>${suggestion.title}</h3>
        <span class="severity ${suggestion.severity}">${suggestion.severity.toUpperCase()}</span>
        <span class="effort">Effort: ${suggestion.effort}</span>
        
        <p>${suggestion.description}</p>
        
        <div class="benefits">
            <strong>Benefits:</strong>
            <ul>
                ${suggestion.benefits.map((b: string) => `<li>${b}</li>`).join('')}
            </ul>
        </div>
        
        ${suggestion.suggestedCode ? `
            <div>
                <strong>Suggested approach:</strong>
                <div class="code-suggestion">${suggestion.suggestedCode}</div>
            </div>
        ` : ''}
        
        <p><em>Location: ${suggestion.chunk.filepath}:${suggestion.chunk.startLine}-${suggestion.chunk.endLine}</em></p>
    </div>
  `;
}

function generateQualityReportHtml(architecture: any, refactoring: any[]): string {
  const qualityScore = calculateQualityScore(architecture, refactoring);
  
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
        h1, h2, h3 {
            color: var(--vscode-editor-foreground);
        }
        .score-container {
            text-align: center;
            margin: 30px 0;
        }
        .score {
            display: inline-block;
            width: 150px;
            height: 150px;
            border-radius: 50%;
            line-height: 150px;
            font-size: 48px;
            font-weight: bold;
            color: white;
        }
        .score.excellent { background-color: #4CAF50; }
        .score.good { background-color: #8BC34A; }
        .score.fair { background-color: #FF9800; }
        .score.poor { background-color: #F44336; }
        .metric-card {
            display: inline-block;
            margin: 10px;
            padding: 20px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 5px;
            min-width: 200px;
            text-align: center;
        }
        .metric-value {
            font-size: 2em;
            font-weight: bold;
            margin: 10px 0;
        }
        .issues-section {
            margin: 30px 0;
        }
        .issue-item {
            margin: 10px 0;
            padding: 10px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 3px;
            border-left: 4px solid var(--vscode-inputValidation-warningBorder);
        }
        .recommendations {
            margin: 30px 0;
            padding: 20px;
            background-color: var(--vscode-editor-selectionBackground);
            border-radius: 5px;
        }
    </style>
</head>
<body>
    <h1>Code Quality Report</h1>
    
    <div class="score-container">
        <div class="score ${qualityScore.grade}">${qualityScore.score}</div>
        <h2>Overall Quality Score</h2>
        <p>${qualityScore.description}</p>
    </div>
    
    <h2>Key Metrics</h2>
    <div>
        <div class="metric-card">
            <div>Architecture Score</div>
            <div class="metric-value">${qualityScore.architectureScore}/100</div>
        </div>
        <div class="metric-card">
            <div>Code Health</div>
            <div class="metric-value">${qualityScore.codeHealthScore}/100</div>
        </div>
        <div class="metric-card">
            <div>Maintainability</div>
            <div class="metric-value">${qualityScore.maintainabilityScore}/100</div>
        </div>
    </div>
    
    <div class="issues-section">
        <h2>Top Issues to Address</h2>
        ${getTopIssues(architecture, refactoring).map(issue => `
            <div class="issue-item">
                <strong>${issue.title}</strong>
                <p>${issue.description}</p>
                <p><em>Impact: ${issue.impact}</em></p>
            </div>
        `).join('')}
    </div>
    
    <div class="recommendations">
        <h2>Recommendations</h2>
        <ol>
            ${getRecommendations(architecture, refactoring).map(rec => `
                <li>
                    <strong>${rec.title}</strong>
                    <p>${rec.description}</p>
                </li>
            `).join('')}
        </ol>
    </div>
    
    <h2>Detailed Findings</h2>
    <details>
        <summary>Architecture Analysis</summary>
        <ul>
            <li>Detected Patterns: ${architecture.patterns.map((p: any) => p.pattern).join(', ')}</li>
            <li>Layer Violations: ${architecture.layers.violations.length}</li>
            <li>Average Complexity: ${architecture.metrics.complexity.toFixed(1)}</li>
            <li>Cohesion Score: ${(architecture.metrics.cohesion * 100).toFixed(0)}%</li>
        </ul>
    </details>
    
    <details>
        <summary>Refactoring Opportunities</summary>
        <ul>
            <li>High Priority: ${refactoring.filter(r => r.severity === 'high').length}</li>
            <li>Medium Priority: ${refactoring.filter(r => r.severity === 'medium').length}</li>
            <li>Low Priority: ${refactoring.filter(r => r.severity === 'low').length}</li>
        </ul>
    </details>
</body>
</html>
`;
}

// Helper functions for quality report

function calculateQualityScore(architecture: any, refactoring: any[]): any {
  // Calculate architecture score (0-100)
  let architectureScore = 100;
  architectureScore -= architecture.layers.violations.length * 5;
  architectureScore -= (10 - architecture.metrics.cohesion * 10);
  architectureScore = Math.max(0, architectureScore);
  
  // Calculate code health score (0-100)
  let codeHealthScore = 100;
  codeHealthScore -= refactoring.filter(r => r.severity === 'high').length * 10;
  codeHealthScore -= refactoring.filter(r => r.severity === 'medium').length * 5;
  codeHealthScore -= refactoring.filter(r => r.severity === 'low').length * 2;
  codeHealthScore = Math.max(0, codeHealthScore);
  
  // Calculate maintainability score (0-100)
  let maintainabilityScore = 100;
  maintainabilityScore -= Math.min(architecture.metrics.complexity * 5, 30);
  maintainabilityScore -= Math.min(architecture.metrics.avgDependencies * 2, 20);
  maintainabilityScore = Math.max(0, maintainabilityScore);
  
  // Overall score
  const overallScore = Math.round((architectureScore + codeHealthScore + maintainabilityScore) / 3);
  
  let grade, description;
  if (overallScore >= 90) {
    grade = 'excellent';
    description = 'Excellent code quality! Keep up the great work.';
  } else if (overallScore >= 75) {
    grade = 'good';
    description = 'Good code quality with some room for improvement.';
  } else if (overallScore >= 60) {
    grade = 'fair';
    description = 'Fair code quality. Consider addressing the identified issues.';
  } else {
    grade = 'poor';
    description = 'Poor code quality. Significant improvements needed.';
  }
  
  return {
    score: overallScore,
    grade,
    description,
    architectureScore: Math.round(architectureScore),
    codeHealthScore: Math.round(codeHealthScore),
    maintainabilityScore: Math.round(maintainabilityScore)
  };
}

function getTopIssues(architecture: any, refactoring: any[]): any[] {
  const issues = [];
  
  // Add architecture violations
  if (architecture.layers.violations.length > 0) {
    issues.push({
      title: 'Architecture Layer Violations',
      description: `Found ${architecture.layers.violations.length} violations of layer architecture principles.`,
      impact: 'High'
    });
  }
  
  // Add high-priority refactorings
  const highPriorityRefactorings = refactoring.filter(r => r.severity === 'high');
  if (highPriorityRefactorings.length > 0) {
    issues.push({
      title: 'Critical Code Quality Issues',
      description: `${highPriorityRefactorings.length} high-priority refactoring opportunities identified.`,
      impact: 'High'
    });
  }
  
  // Add complexity issues
  if (architecture.metrics.complexity > 10) {
    issues.push({
      title: 'High Code Complexity',
      description: `Average cyclomatic complexity is ${architecture.metrics.complexity.toFixed(1)}, which is above recommended levels.`,
      impact: 'Medium'
    });
  }
  
  return issues.slice(0, 5);
}

function getRecommendations(architecture: any, refactoring: any[]): any[] {
  const recommendations = [];
  
  // Pattern-based recommendations
  const missingPatterns = ['Service Layer', 'Repository Pattern'].filter(
    pattern => !architecture.patterns.some((p: any) => p.pattern.includes(pattern))
  );
  
  if (missingPatterns.length > 0) {
    recommendations.push({
      title: 'Implement Missing Architectural Patterns',
      description: `Consider implementing: ${missingPatterns.join(', ')} to improve code organization.`
    });
  }
  
  // Refactoring recommendations
  const duplicateCodeIssues = refactoring.filter(r => r.type === 'CONSOLIDATE_DUPLICATE');
  if (duplicateCodeIssues.length > 0) {
    recommendations.push({
      title: 'Eliminate Code Duplication',
      description: `Found ${duplicateCodeIssues.length} instances of duplicate code. Extract common functionality into shared utilities.`
    });
  }
  
  // Complexity recommendations
  if (architecture.metrics.complexity > 10) {
    recommendations.push({
      title: 'Reduce Code Complexity',
      description: 'Break down complex methods into smaller, more focused functions. Aim for cyclomatic complexity below 10.'
    });
  }
  
  // Testing recommendations
  recommendations.push({
    title: 'Improve Test Coverage',
    description: 'Ensure all refactored code has comprehensive unit tests before making changes.'
  });
  
  return recommendations;
}

export function deactivate() {
  outputChannel.appendLine('CodeMemory extension deactivating...');
  outputChannel.dispose();
}