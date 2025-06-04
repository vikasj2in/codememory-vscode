// src/context/contextManager.ts

import { VectorStore } from '../vectorstore/memoryVectorStore';
import { 
  CodeChunk, 
  SemanticContext, 
  VectorSearchResult, 
  MemoryEntry,
  ProjectContext 
} from '../types';
import { nanoid } from 'nanoid';
import * as path from 'path';
import * as fs from 'fs';

export class ContextManager {
  private vectorStore: VectorStore;
  private memoryEntries: Map<string, MemoryEntry>;
  private projectContext: ProjectContext | null = null;
  private contextCache: Map<string, SemanticContext>;
  private readonly maxMemoryEntries = 1000;
  private workspacePath: string;

  constructor(workspacePath: string, vectorStore: VectorStore) {
    this.workspacePath = workspacePath;
    this.vectorStore = vectorStore;
    this.memoryEntries = new Map();
    this.contextCache = new Map();
    this.loadMemoryEntries();
    this.analyzeProjectContext();
  }

  private loadMemoryEntries() {
    const memoryPath = path.join(this.workspacePath, '.codememory', 'memory.json');
    if (fs.existsSync(memoryPath)) {
      try {
        const data = fs.readFileSync(memoryPath, 'utf-8');
        const entries = JSON.parse(data) as MemoryEntry[];
        entries.forEach(entry => {
          this.memoryEntries.set(entry.id, entry);
        });
      } catch (error) {
        console.error('Error loading memory entries:', error);
      }
    }
  }

  private saveMemoryEntries() {
    const memoryPath = path.join(this.workspacePath, '.codememory', 'memory.json');
    const dir = path.dirname(memoryPath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const entries = Array.from(this.memoryEntries.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, this.maxMemoryEntries);

    fs.writeFileSync(memoryPath, JSON.stringify(entries, null, 2));
  }

  private async analyzeProjectContext() {
    // Analyze project structure to understand frameworks, patterns, etc.
    const packageJsonPath = path.join(this.workspacePath, 'package.json');
    const requirementsPath = path.join(this.workspacePath, 'requirements.txt');
    const pomPath = path.join(this.workspacePath, 'pom.xml');

    const languages = new Set<string>();
    const frameworks: string[] = [];
    const dependencies: any[] = [];

    // Detect Node.js project
    if (fs.existsSync(packageJsonPath)) {
      languages.add('javascript');
      languages.add('typescript');
      
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      
      // Detect frameworks
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (deps.react) frameworks.push('React');
      if (deps.vue) frameworks.push('Vue');
      if (deps.angular) frameworks.push('Angular');
      if (deps.express) frameworks.push('Express');
      if (deps.next) frameworks.push('Next.js');
      
      // Store dependencies
      Object.entries(deps).forEach(([name, version]) => {
        dependencies.push({
          name,
          version: version as string,
          type: packageJson.dependencies?.[name] ? 'production' : 'development',
          usage: []
        });
      });
    }

    // Detect Python project
    if (fs.existsSync(requirementsPath)) {
      languages.add('python');
      
      const requirements = fs.readFileSync(requirementsPath, 'utf-8');
      const lines = requirements.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      
      lines.forEach(line => {
        const [name, version] = line.split('==');
        if (name) {
          dependencies.push({
            name: name.trim(),
            version: version?.trim() || 'latest',
            type: 'production',
            usage: []
          });

          // Detect frameworks
          if (name.includes('django')) frameworks.push('Django');
          if (name.includes('flask')) frameworks.push('Flask');
          if (name.includes('fastapi')) frameworks.push('FastAPI');
        }
      });
    }

    // Detect Java project
    if (fs.existsSync(pomPath)) {
      languages.add('java');
      frameworks.push('Maven');
      // TODO: Parse pom.xml for dependencies
    }

    this.projectContext = {
      projectPath: this.workspacePath,
      language: Array.from(languages),
      frameworks,
      patterns: [],
      conventions: [],
      dependencies
    };

    // Detect architectural patterns
    await this.detectArchitecturalPatterns();
  }

  private async detectArchitecturalPatterns() {
    if (!this.projectContext) return;

    // Search for common architectural patterns
    const patterns = [
      {
        name: 'MVC',
        indicators: ['controllers/', 'models/', 'views/', 'Controller.', 'Model.', 'View.']
      },
      {
        name: 'Repository Pattern',
        indicators: ['repository/', 'repositories/', 'Repository.', 'Repo.']
      },
      {
        name: 'Service Layer',
        indicators: ['services/', 'service/', 'Service.', 'Manager.']
      },
      {
        name: 'Factory Pattern',
        indicators: ['factory/', 'factories/', 'Factory.', 'Creator.']
      }
    ];

    for (const pattern of patterns) {
      const results = await this.searchPatternIndicators(pattern.indicators);
      if (results.length > 0) {
        this.projectContext.patterns.push({
          name: pattern.name,
          description: `${pattern.name} pattern detected in the codebase`,
          examples: results.slice(0, 3).map(r => r.chunk.filepath),
          locations: results.map(r => r.chunk.filepath)
        });
      }
    }
  }

  private async searchPatternIndicators(indicators: string[]): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = [];
    
    for (const indicator of indicators) {
      const searchResults = await this.vectorStore.search(indicator, 5);
      results.push(...searchResults);
    }

    // Deduplicate results
    const seen = new Set<string>();
    return results.filter(r => {
      if (seen.has(r.chunk.id)) return false;
      seen.add(r.chunk.id);
      return true;
    });
  }

  async getRelevantContext(query: string, maxResults: number = 10): Promise<{
    chunks: VectorSearchResult[];
    projectInfo: ProjectContext | null;
    relatedMemories: MemoryEntry[];
  }> {
    // Search for relevant code chunks
    const chunks = await this.vectorStore.search(query, maxResults);

    // Enhance chunks with semantic context
    for (const result of chunks) {
      const context = await this.getOrCreateSemanticContext(result.chunk);
      result.context = context;
    }

    // Find related memory entries
    const relatedMemories = this.findRelatedMemories(query, 5);

    return {
      chunks,
      projectInfo: this.projectContext,
      relatedMemories
    };
  }

  async getCodeExplanationContext(chunk: CodeChunk): Promise<{
    chunk: CodeChunk;
    dependencies: VectorSearchResult[];
    usages: VectorSearchResult[];
    relatedChunks: VectorSearchResult[];
  }> {
    // Find dependencies
    const dependencies: VectorSearchResult[] = [];
    if (chunk.metadata.dependencies) {
      for (const dep of chunk.metadata.dependencies) {
        const results = await this.vectorStore.search(dep, 3);
        dependencies.push(...results);
      }
    }

    // Find usages of this chunk
    const usageQuery = `uses ${chunk.name} from ${path.basename(chunk.filepath)}`;
    const usages = await this.vectorStore.search(usageQuery, 10);

    // Find related chunks
    const relatedChunks = await this.vectorStore.getRelatedChunks(chunk.id, 5);

    return {
      chunk,
      dependencies,
      usages,
      relatedChunks
    };
  }

  async recordMemoryEntry(
    query: string, 
    response: string, 
    relevantChunks: string[],
    feedback?: 'helpful' | 'not-helpful'
  ): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: nanoid(),
      timestamp: new Date(),
      query,
      response,
      relevantChunks,
      feedback,
      context: {
        projectContext: this.projectContext
      }
    };

    this.memoryEntries.set(entry.id, entry);
    this.saveMemoryEntries();

    return entry;
  }

  updateMemoryFeedback(entryId: string, feedback: 'helpful' | 'not-helpful') {
    const entry = this.memoryEntries.get(entryId);
    if (entry) {
      entry.feedback = feedback;
      this.saveMemoryEntries();
    }
  }

  private findRelatedMemories(query: string, maxResults: number): MemoryEntry[] {
    // Simple keyword-based similarity for now
    // In production, we'd use embeddings for semantic similarity
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    
    const scored = Array.from(this.memoryEntries.values()).map(entry => {
      const entryWords = new Set(entry.query.toLowerCase().split(/\s+/));
      const intersection = new Set([...queryWords].filter(x => entryWords.has(x)));
      const score = intersection.size / Math.max(queryWords.size, entryWords.size);
      
      return { entry, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .filter(item => item.score > 0.2)
      .map(item => item.entry);
  }

  private async getOrCreateSemanticContext(chunk: CodeChunk): Promise<SemanticContext> {
    const cached = this.contextCache.get(chunk.id);
    if (cached) return cached;

    // Extract keywords from chunk
    const keywords = this.extractKeywords(chunk);

    // Generate summary
    const summary = this.generateChunkSummary(chunk);

    // Find related chunks
    const related = await this.vectorStore.getRelatedChunks(chunk.id, 3);
    const relatedChunks = related.map(r => r.chunk.id);

    // Calculate importance based on various factors
    const importance = this.calculateChunkImportance(chunk);

    const context: SemanticContext = {
      chunkId: chunk.id,
      embedding: [], // Already stored in vector DB
      relatedChunks,
      keywords,
      summary,
      importance
    };

    this.contextCache.set(chunk.id, context);
    return context;
  }

  private extractKeywords(chunk: CodeChunk): string[] {
    const keywords: string[] = [chunk.name, chunk.type, chunk.language];
    
    // Extract identifiers from code
    const identifierRegex = /\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b/g;
    const matches = chunk.content.match(identifierRegex) || [];
    
    const commonWords = new Set(['var', 'let', 'const', 'function', 'class', 'import', 'export', 'return', 'if', 'else', 'for', 'while']);
    
    const uniqueIdentifiers = [...new Set(matches)]
      .filter(word => !commonWords.has(word.toLowerCase()))
      .slice(0, 10);

    keywords.push(...uniqueIdentifiers);
    return keywords;
  }

  private generateChunkSummary(chunk: CodeChunk): string {
    const typeDescriptions: Record<string, string> = {
      'function': 'Function',
      'class': 'Class definition',
      'method': 'Method',
      'module': 'Module',
      'variable': 'Variable declaration',
      'import': 'Import statement'
    };

    const typeDesc = typeDescriptions[chunk.type] || chunk.type;
    const location = path.basename(chunk.filepath);
    
    return `${typeDesc} "${chunk.name}" in ${location} (lines ${chunk.startLine}-${chunk.endLine})`;
  }

  private calculateChunkImportance(chunk: CodeChunk): number {
    let importance = 0.5; // Base importance

    // Adjust based on type
    const typeWeights: Record<string, number> = {
      'class': 0.8,
      'function': 0.7,
      'method': 0.6,
      'module': 0.9,
      'variable': 0.4,
      'import': 0.3
    };

    importance = typeWeights[chunk.type] || importance;

    // Boost if it has documentation
    if (chunk.metadata.docstring) {
      importance += 0.1;
    }

    // Boost based on size (larger chunks might be more important)
    const lines = chunk.endLine - chunk.startLine + 1;
    if (lines > 50) importance += 0.1;
    if (lines > 100) importance += 0.1;

    return Math.min(importance, 1.0);
  }

  getProjectContext(): ProjectContext | null {
    return this.projectContext;
  }

  clearCache() {
    this.contextCache.clear();
  }
}