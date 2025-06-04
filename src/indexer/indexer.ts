// src/indexer/indexer.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { glob } from 'glob';
import ignore from 'ignore';
import { CodeParser } from './parser';
import { VectorStore } from '../vectorstore/memoryVectorStore';
import { CodeChunk, IndexingProgress } from '../types';

export class CodeIndexer {
  private parser: CodeParser;
  private vectorStore: VectorStore;
  private progress: IndexingProgress;
  private progressCallback?: (progress: IndexingProgress) => void;
  private gitignore: any;

  constructor(private workspacePath: string, apiKey?: string) {
    this.parser = new CodeParser();
    this.vectorStore = new VectorStore(workspacePath, apiKey);
    this.progress = {
      totalFiles: 0,
      processedFiles: 0,
      currentFile: '',
      errors: [],
      status: 'idle'
    };
    this.loadGitignore();
  }

  private loadGitignore() {
    const gitignorePath = path.join(this.workspacePath, '.gitignore');
    this.gitignore = ignore();
    
    // Add default ignores
    this.gitignore.add([
      'node_modules/',
      '.git/',
      'dist/',
      'build/',
      '.vscode/',
      '*.log',
      '.env',
      '.DS_Store',
      '__pycache__/',
      '*.pyc',
      '.pytest_cache/',
      'target/',
      '.idea/',
      '*.iml'
    ]);

    // Load project-specific gitignore
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      this.gitignore.add(gitignoreContent);
    }
  }

  async initialize(projectName: string): Promise<void> {
    await this.vectorStore.initialize(projectName);
  }

  setProgressCallback(callback: (progress: IndexingProgress) => void) {
    this.progressCallback = callback;
  }

  async indexWorkspace(fileTypes?: string[]): Promise<void> {
    this.progress.status = 'indexing';
    this.updateProgress();

    try {
      // Get all files to index
      const files = await this.getFilesToIndex(fileTypes);
      this.progress.totalFiles = files.length;
      this.updateProgress();

      // Clear existing index
      await this.vectorStore.clearAll();
      await this.initialize(path.basename(this.workspacePath));

      // Process files in batches
      const batchSize = 10;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        await this.processBatch(batch);
      }

      this.progress.status = 'completed';
      this.updateProgress();
    } catch (error) {
      this.progress.status = 'error';
      this.progress.errors.push(error instanceof Error ? error.message : String(error));
      this.updateProgress();
      throw error;
    }
  }

  async indexFile(uri: vscode.Uri): Promise<void> {
    try {
      const relativePath = path.relative(this.workspacePath, uri.fsPath);
      
      // Check if file should be ignored
      if (this.gitignore.ignores(relativePath)) {
        return;
      }

      // Parse file
      const chunks = await this.parser.parseFile(uri);
      
      // Delete existing chunks for this file
      const stats = await this.vectorStore.getStats();
      // Note: In a real implementation, we'd need to track file->chunk mappings
      
      // Add new chunks
      await this.vectorStore.addChunks(chunks);
      
      // Update dependencies and relationships
      await this.updateDependencies(chunks);
    } catch (error) {
      console.error(`Error indexing file ${uri.fsPath}:`, error);
      throw error;
    }
  }

  async updateFile(uri: vscode.Uri): Promise<void> {
    // For now, just re-index the file
    // In a production system, we'd do incremental updates
    await this.indexFile(uri);
  }

  async deleteFile(uri: vscode.Uri): Promise<void> {
    // In a real implementation, we'd track which chunks belong to which file
    // For now, this is a placeholder
    console.log(`File deleted: ${uri.fsPath}`);
  }

  private async getFilesToIndex(fileTypes?: string[]): Promise<string[]> {
    const extensions = fileTypes || [
      '.ts', '.tsx', '.js', '.jsx',
      '.py', '.java', '.cpp', '.c',
      '.go', '.rs', '.rb', '.php'
    ];

    const pattern = `**/*{${extensions.join(',')}}`;
    const files = await glob(pattern, {
      cwd: this.workspacePath,
      absolute: true,
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    });

    // Filter using gitignore
    return files.filter(file => {
      const relativePath = path.relative(this.workspacePath, file);
      return !this.gitignore.ignores(relativePath);
    });
  }

  private async processBatch(files: string[]): Promise<void> {
    for (const file of files) {
      this.progress.currentFile = file;
      this.updateProgress();

      try {
        const uri = vscode.Uri.file(file);
        await this.indexFile(uri);
        this.progress.processedFiles++;
      } catch (error) {
        this.progress.errors.push(`Error processing ${file}: ${error}`);
      }

      this.updateProgress();
    }
  }

  private async updateDependencies(chunks: CodeChunk[]): Promise<void> {
    // Analyze import statements to build dependency graph
    const importChunks = chunks.filter(chunk => chunk.type === 'import');
    
    for (const chunk of chunks) {
      if (chunk.type === 'function' || chunk.type === 'class') {
        // Find which imports this chunk might depend on
        const dependencies: string[] = [];
        
        // Simple heuristic: check if imported names appear in the chunk's content
        for (const importChunk of importChunks) {
          const importedName = this.extractImportedName(importChunk.name);
          if (chunk.content.includes(importedName)) {
            dependencies.push(importChunk.name);
          }
        }

        if (dependencies.length > 0) {
          chunk.metadata.dependencies = dependencies;
          await this.vectorStore.updateChunk(chunk);
        }
      }
    }
  }

  private extractImportedName(importPath: string): string {
    // Extract the main imported name from an import path
    const parts = importPath.split('/');
    const lastPart = parts[parts.length - 1];
    return lastPart.replace(/['"]/g, '');
  }

  private updateProgress() {
    if (this.progressCallback) {
      this.progressCallback({ ...this.progress });
    }
  }

  async getIndexStats() {
    return this.vectorStore.getStats();
  }
}