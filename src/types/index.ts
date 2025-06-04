// src/types/index.ts

export interface CodeChunk {
  id: string;
  filepath: string;
  content: string;
  type: 'function' | 'class' | 'method' | 'module' | 'variable' | 'import';
  name: string;
  startLine: number;
  endLine: number;
  language: string;
  parentId?: string;
  metadata: {
    signature?: string;
    docstring?: string;
    dependencies?: string[];
    complexity?: number;
    lastModified?: Date;
  };
}

export interface SemanticContext {
  chunkId: string;
  embedding: number[];
  relatedChunks: string[];
  keywords: string[];
  summary: string;
  importance: number;
}

export interface MemoryEntry {
  id: string;
  timestamp: Date;
  query: string;
  response: string;
  relevantChunks: string[];
  feedback?: 'helpful' | 'not-helpful';
  context: Record<string, any>;
}

export interface ProjectContext {
  projectPath: string;
  language: string[];
  frameworks: string[];
  patterns: ArchitecturalPattern[];
  conventions: CodingConvention[];
  dependencies: Dependency[];
}

export interface ArchitecturalPattern {
  name: string;
  description: string;
  examples: string[];
  locations: string[];
}

export interface CodingConvention {
  rule: string;
  description: string;
  examples: string[];
}

export interface Dependency {
  name: string;
  version: string;
  type: 'production' | 'development';
  usage: string[];
}

export interface IndexingProgress {
  totalFiles: number;
  processedFiles: number;
  currentFile: string;
  errors: string[];
  status: 'idle' | 'indexing' | 'completed' | 'error';
}

export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'local';
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface VectorSearchResult {
  chunk: CodeChunk;
  score: number;
  context?: SemanticContext;
}

export interface CodeExplanation {
  summary: string;
  purpose: string;
  dependencies: string[];
  sideEffects: string[];
  suggestions?: string[];
}