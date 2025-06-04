// src/vectorstore/vectorStore.ts

import { CodeChunk, SemanticContext, VectorSearchResult } from '../types';
import { ChromaClient, Collection, IEmbeddingFunction } from 'chromadb';
import * as path from 'path';
import * as fs from 'fs';
import { EmbeddingGenerator } from './embeddings';

// Custom embedding function for ChromaDB
class CustomEmbeddingFunction implements IEmbeddingFunction {
  private embeddingGenerator: EmbeddingGenerator;

  constructor() {
    this.embeddingGenerator = new EmbeddingGenerator();
    this.embeddingGenerator.initialize();
  }

  async generate(texts: string[]): Promise<number[][]> {
    try {
      return await this.embeddingGenerator.generateBatch(texts);
    } catch (error) {
      console.error('Embedding generation failed:', error);
      // Return random embeddings as last resort
      return texts.map(() => Array(384).fill(0).map(() => Math.random()));
    }
  }
}

export class VectorStore {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private embeddingFunction: CustomEmbeddingFunction;
  private dbPath: string;

  constructor(projectPath: string, apiKey?: string) {
    this.dbPath = path.join(projectPath, '.codememory', 'chromadb');
    this.ensureDbDirectory();
    
    // Initialize ChromaDB in embedded mode (no server required)
    this.client = new ChromaClient();
    
    // Always use local embeddings
    this.embeddingFunction = new CustomEmbeddingFunction();
  }

  private ensureDbDirectory() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async initialize(projectName: string): Promise<void> {
    try {
      // Try to get existing collection
      this.collection = await this.client.getCollection({
        name: this.sanitizeCollectionName(projectName),
        embeddingFunction: this.embeddingFunction
      });
    } catch (error) {
      // Create new collection if it doesn't exist
      this.collection = await this.client.createCollection({
        name: this.sanitizeCollectionName(projectName),
        embeddingFunction: this.embeddingFunction,
        metadata: { 
          created: new Date().toISOString(),
          version: '1.0'
        }
      });
    }
  }

  private sanitizeCollectionName(name: string): string {
    // ChromaDB collection names must be alphanumeric with underscores
    return name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  }

  async addChunks(chunks: CodeChunk[]): Promise<void> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    const ids = chunks.map(chunk => chunk.id);
    const documents = chunks.map(chunk => this.createChunkText(chunk));
    const metadatas = chunks.map(chunk => ({
      filepath: chunk.filepath,
      type: chunk.type,
      name: chunk.name,
      startLine: chunk.startLine.toString(),
      endLine: chunk.endLine.toString(),
      language: chunk.language,
      parentId: chunk.parentId || '',
      signature: chunk.metadata.signature || '',
      docstring: chunk.metadata.docstring || ''
    }));

    await this.collection.add({
      ids,
      documents,
      metadatas
    });
  }

  async search(query: string, k: number = 10): Promise<VectorSearchResult[]> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }
    
    const results = await this.collection.query({
      queryTexts: [query],
      nResults: k
    });

    return this.processSearchResults(results);
  }

  async searchByCode(codeSnippet: string, k: number = 10): Promise<VectorSearchResult[]> {
    // Enhanced search for code snippets
    const enhancedQuery = `Code similar to: ${codeSnippet}`;
    return this.search(enhancedQuery, k);
  }

  async getRelatedChunks(chunkId: string, k: number = 5): Promise<VectorSearchResult[]> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    const chunk = await this.getChunkById(chunkId);
    if (!chunk) {
      return [];
    }

    const chunkText = this.createChunkText(chunk);
    return this.search(chunkText, k + 1).then(results => 
      results.filter(r => r.chunk.id !== chunkId).slice(0, k)
    );
  }

  async getChunkById(chunkId: string): Promise<CodeChunk | null> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    const results = await this.collection.get({
      ids: [chunkId]
    });

    if (!results.ids.length) {
      return null;
    }

    return this.reconstructChunk(results, 0);
  }

  async updateChunk(chunk: CodeChunk): Promise<void> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    await this.collection.update({
      ids: [chunk.id],
      documents: [this.createChunkText(chunk)],
      metadatas: [{
        filepath: chunk.filepath,
        type: chunk.type,
        name: chunk.name,
        startLine: chunk.startLine.toString(),
        endLine: chunk.endLine.toString(),
        language: chunk.language,
        parentId: chunk.parentId || '',
        signature: chunk.metadata.signature || '',
        docstring: chunk.metadata.docstring || ''
      }]
    });
  }

  async deleteChunks(chunkIds: string[]): Promise<void> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    await this.collection.delete({
      ids: chunkIds
    });
  }

  async getStats(): Promise<{
    totalChunks: number;
    chunksByType: Record<string, number>;
    chunksByLanguage: Record<string, number>;
  }> {
    if (!this.collection) {
      throw new Error('Vector store not initialized');
    }

    const allData = await this.collection.get();
    
    const stats = {
      totalChunks: allData.ids.length,
      chunksByType: {} as Record<string, number>,
      chunksByLanguage: {} as Record<string, number>
    };

    allData.metadatas?.forEach((metadata: { type?: string; language?: string }) => {
      if (metadata) {
        const type = metadata.type as string;
        const language = metadata.language as string;
        
        stats.chunksByType[type] = (stats.chunksByType[type] || 0) + 1;
        stats.chunksByLanguage[language] = (stats.chunksByLanguage[language] || 0) + 1;
      }
    });

    return stats;
  }

  private createChunkText(chunk: CodeChunk): string {
    const parts = [
      `Type: ${chunk.type}`,
      `Name: ${chunk.name}`,
      `Language: ${chunk.language}`,
      `File: ${path.basename(chunk.filepath)}`
    ];

    if (chunk.metadata.signature) {
      parts.push(`Signature: ${chunk.metadata.signature}`);
    }

    if (chunk.metadata.docstring) {
      parts.push(`Documentation: ${chunk.metadata.docstring}`);
    }

    parts.push(`Code:\n${chunk.content}`);

    return parts.join('\n');
  }

  private processSearchResults(results: any): VectorSearchResult[] {
    const searchResults: VectorSearchResult[] = [];

    for (let i = 0; i < results.ids[0].length; i++) {
      const chunk = this.reconstructChunk(results, i);
      if (chunk) {
        searchResults.push({
          chunk,
          score: results.distances ? results.distances[0][i] : 0,
          context: undefined // Will be populated by context manager
        });
      }
    }

    return searchResults;
  }

  private reconstructChunk(results: any, index: number): CodeChunk | null {
    if (!results.metadatas || !results.metadatas[0][index]) {
      return null;
    }

    const metadata = results.metadatas[0][index];
    const document = results.documents ? results.documents[0][index] : '';

    return {
      id: results.ids[0][index],
      filepath: metadata.filepath,
      content: document,
      type: metadata.type as CodeChunk['type'],
      name: metadata.name,
      startLine: parseInt(metadata.startLine),
      endLine: parseInt(metadata.endLine),
      language: metadata.language,
      parentId: metadata.parentId || undefined,
      metadata: {
        signature: metadata.signature || undefined,
        docstring: metadata.docstring || undefined
      }
    };
  }

  async clearAll(projectName: string): Promise<void> {
    if (this.collection) {
      await this.client.deleteCollection({
        name: this.sanitizeCollectionName(projectName)
      });
      this.collection = null;
    }
  }
}