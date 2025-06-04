// src/vectorstore/memoryVectorStore.ts

import { CodeChunk, VectorSearchResult } from '../types';
import * as path from 'path';
import * as fs from 'fs';
import { EmbeddingGenerator } from './embeddings';

interface StoredChunk {
  chunk: CodeChunk;
  embedding: number[];
}

export class MemoryVectorStore {
  private chunks: Map<string, StoredChunk> = new Map();
  private embeddingGenerator: EmbeddingGenerator;
  private dbPath: string;
  private persistencePath: string;

  constructor(projectPath: string, apiKey?: string) {
    this.dbPath = path.join(projectPath, '.codememory');
    this.persistencePath = path.join(this.dbPath, 'chunks.json');
    this.ensureDbDirectory();
    this.embeddingGenerator = new EmbeddingGenerator();
    this.loadFromDisk();
  }

  private ensureDbDirectory() {
    if (!fs.existsSync(this.dbPath)) {
      fs.mkdirSync(this.dbPath, { recursive: true });
    }
  }

  async initialize(projectName: string): Promise<void> {
    await this.embeddingGenerator.initialize();
    console.log(`Memory vector store initialized for project: ${projectName}`);
  }

  async addChunks(chunks: CodeChunk[]): Promise<void> {
    const embeddings = await this.embeddingGenerator.generateBatch(
      chunks.map(chunk => this.createChunkText(chunk))
    );

    for (let i = 0; i < chunks.length; i++) {
      this.chunks.set(chunks[i].id, {
        chunk: chunks[i],
        embedding: embeddings[i]
      });
    }

    this.saveToDisk();
  }

  async search(query: string, k: number = 10): Promise<VectorSearchResult[]> {
    const queryEmbedding = await this.embeddingGenerator.generate(query);
    
    const results: VectorSearchResult[] = [];
    
    for (const [id, storedChunk] of this.chunks) {
      const score = this.cosineSimilarity(queryEmbedding, storedChunk.embedding);
      results.push({
        chunk: storedChunk.chunk,
        score: 1 - score // Convert similarity to distance
      });
    }
    
    // Sort by score (ascending, since lower distance is better)
    results.sort((a, b) => a.score - b.score);
    
    return results.slice(0, k);
  }

  async searchByCode(codeSnippet: string, k: number = 10): Promise<VectorSearchResult[]> {
    return this.search(`Code similar to: ${codeSnippet}`, k);
  }

  async getRelatedChunks(chunkId: string, k: number = 5): Promise<VectorSearchResult[]> {
    const chunk = await this.getChunkById(chunkId);
    if (!chunk) return [];
    
    const chunkText = this.createChunkText(chunk);
    const results = await this.search(chunkText, k + 1);
    
    return results.filter(r => r.chunk.id !== chunkId).slice(0, k);
  }

  async getChunkById(chunkId: string): Promise<CodeChunk | null> {
    const stored = this.chunks.get(chunkId);
    return stored ? stored.chunk : null;
  }

  async updateChunk(chunk: CodeChunk): Promise<void> {
    const embedding = await this.embeddingGenerator.generate(
      this.createChunkText(chunk)
    );

    this.chunks.set(chunk.id, { chunk, embedding });
    this.saveToDisk();
  }

  async deleteChunks(chunkIds: string[]): Promise<void> {
    for (const id of chunkIds) {
      this.chunks.delete(id);
    }
    this.saveToDisk();
  }

  async getStats(): Promise<{
    totalChunks: number;
    chunksByType: Record<string, number>;
    chunksByLanguage: Record<string, number>;
  }> {
    const stats = {
      totalChunks: this.chunks.size,
      chunksByType: {} as Record<string, number>,
      chunksByLanguage: {} as Record<string, number>
    };

    for (const [_, storedChunk] of this.chunks) {
      const chunk = storedChunk.chunk;
      stats.chunksByType[chunk.type] = (stats.chunksByType[chunk.type] || 0) + 1;
      stats.chunksByLanguage[chunk.language] = (stats.chunksByLanguage[chunk.language] || 0) + 1;
    }

    return stats;
  }

  async clearAll(): Promise<void> {
    this.chunks.clear();
    if (fs.existsSync(this.persistencePath)) {
      fs.unlinkSync(this.persistencePath);
    }
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

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (normA * normB);
  }

  private saveToDisk(): void {
    try {
      const data = Array.from(this.chunks.entries()).map(([id, stored]) => ({
        id,
        chunk: stored.chunk,
        embedding: stored.embedding
      }));
      
      fs.writeFileSync(this.persistencePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save vector store to disk:', error);
    }
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.persistencePath)) {
        const data = JSON.parse(fs.readFileSync(this.persistencePath, 'utf-8'));
        
        for (const item of data) {
          this.chunks.set(item.id, {
            chunk: item.chunk,
            embedding: item.embedding
          });
        }
        
        console.log(`Loaded ${this.chunks.size} chunks from disk`);
      }
    } catch (error) {
      console.error('Failed to load vector store from disk:', error);
    }
  }
}

// Export as VectorStore for compatibility
export { MemoryVectorStore as VectorStore };