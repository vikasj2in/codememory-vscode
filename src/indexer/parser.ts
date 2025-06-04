// src/indexer/parser.ts

import * as vscode from 'vscode';
import { CodeChunk } from '../types';
import { nanoid } from 'nanoid';
import * as path from 'path';

export class CodeParser {
  private languageParsers: Map<string, LanguageParser>;

  constructor() {
    this.languageParsers = new Map();
    this.initializeParsers();
  }

  private initializeParsers() {
    // Initialize language-specific parsers
    this.languageParsers.set('typescript', new TypeScriptParser());
    this.languageParsers.set('javascript', new JavaScriptParser());
    this.languageParsers.set('python', new PythonParser());
    this.languageParsers.set('java', new JavaParser());
  }

  async parseFile(uri: vscode.Uri): Promise<CodeChunk[]> {
    const document = await vscode.workspace.openTextDocument(uri);
    const language = document.languageId;
    const parser = this.languageParsers.get(language) || new GenericParser();
    
    return parser.parse(document);
  }

  getLanguageFromExtension(filepath: string): string {
    const ext = path.extname(filepath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.cpp': 'cpp',
      '.c': 'c',
      '.go': 'go',
      '.rs': 'rust'
    };
    return languageMap[ext] || 'unknown';
  }
}

abstract class LanguageParser {
  abstract parse(document: vscode.TextDocument): Promise<CodeChunk[]>;

  protected createChunk(
    document: vscode.TextDocument,
    type: CodeChunk['type'],
    name: string,
    startLine: number,
    endLine: number,
    parentId?: string
  ): CodeChunk {
    const content = document.getText(
      new vscode.Range(startLine, 0, endLine + 1, 0)
    );

    return {
      id: nanoid(),
      filepath: document.uri.fsPath,
      content,
      type,
      name,
      startLine,
      endLine,
      language: document.languageId,
      parentId,
      metadata: {
        lastModified: new Date()
      }
    };
  }
}

class TypeScriptParser extends LanguageParser {
  async parse(document: vscode.TextDocument): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    // Parse imports
    const importRegex = /^import\s+(?:{[^}]+}|[\w*]+)?\s*(?:,\s*{[^}]+})?\s*from\s+['"]([^'"]+)['"]/;
    const classRegex = /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/;
    const functionRegex = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/;
    const interfaceRegex = /^(?:export\s+)?interface\s+(\w+)/;
    const methodRegex = /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?(\w+)\s*\(/;

    let currentClass: CodeChunk | null = null;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Track braces for class boundaries
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      if (currentClass && braceCount === 0) {
        currentClass.endLine = i - 1;
        chunks.push(currentClass);
        currentClass = null;
      }

      // Parse imports
      const importMatch = line.match(importRegex);
      if (importMatch) {
        chunks.push(this.createChunk(document, 'import', importMatch[1], i, i));
        continue;
      }

      // Parse classes
      const classMatch = line.match(classRegex);
      if (classMatch) {
        currentClass = this.createChunk(document, 'class', classMatch[1], i, i);
        braceCount = 1;
        continue;
      }

      // Parse functions
      const functionMatch = line.match(functionRegex);
      if (functionMatch && !currentClass) {
        const endLine = this.findFunctionEnd(lines, i);
        chunks.push(this.createChunk(document, 'function', functionMatch[1], i, endLine));
        continue;
      }

      // Parse methods within classes
      if (currentClass) {
        const methodMatch = line.match(methodRegex);
        if (methodMatch && methodMatch[1] !== 'constructor') {
          const endLine = this.findFunctionEnd(lines, i);
          chunks.push(this.createChunk(
            document, 
            'method', 
            methodMatch[1], 
            i, 
            endLine, 
            currentClass.id
          ));
        }
      }

      // Parse interfaces
      const interfaceMatch = line.match(interfaceRegex);
      if (interfaceMatch) {
        const endLine = this.findBlockEnd(lines, i);
        chunks.push(this.createChunk(document, 'class', interfaceMatch[1], i, endLine));
      }
    }

    // Add the full module as a chunk
    chunks.push(this.createChunk(document, 'module', path.basename(document.uri.fsPath), 0, lines.length - 1));

    return chunks;
  }

  private findFunctionEnd(lines: string[], startLine: number): number {
    let braceCount = 0;
    let started = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.includes('{')) {
        started = true;
        braceCount += (line.match(/{/g) || []).length;
      }
      
      braceCount -= (line.match(/}/g) || []).length;

      if (started && braceCount === 0) {
        return i;
      }
    }

    return lines.length - 1;
  }

  private findBlockEnd(lines: string[], startLine: number): number {
    return this.findFunctionEnd(lines, startLine);
  }
}

class JavaScriptParser extends TypeScriptParser {
  // JavaScript parser can mostly reuse TypeScript parser logic
}

class PythonParser extends LanguageParser {
  async parse(document: vscode.TextDocument): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    const importRegex = /^(?:from\s+[\w.]+\s+)?import\s+(.+)/;
    const classRegex = /^class\s+(\w+)/;
    const functionRegex = /^def\s+(\w+)/;
    const methodRegex = /^\s+def\s+(\w+)/;

    let currentClass: CodeChunk | null = null;
    let currentIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      const indent = line.length - line.trimStart().length;

      // Check if we've exited a class
      if (currentClass && indent <= currentIndent && trimmedLine !== '') {
        currentClass.endLine = i - 1;
        chunks.push(currentClass);
        currentClass = null;
      }

      // Parse imports
      const importMatch = trimmedLine.match(importRegex);
      if (importMatch) {
        chunks.push(this.createChunk(document, 'import', importMatch[1], i, i));
        continue;
      }

      // Parse classes
      const classMatch = trimmedLine.match(classRegex);
      if (classMatch) {
        currentClass = this.createChunk(document, 'class', classMatch[1], i, i);
        currentIndent = indent;
        continue;
      }

      // Parse functions
      const functionMatch = trimmedLine.match(functionRegex);
      if (functionMatch && indent === 0) {
        const endLine = this.findPythonBlockEnd(lines, i, indent);
        chunks.push(this.createChunk(document, 'function', functionMatch[1], i, endLine));
        continue;
      }

      // Parse methods
      if (currentClass && indent > currentIndent) {
        const methodMatch = trimmedLine.match(methodRegex);
        if (methodMatch) {
          const endLine = this.findPythonBlockEnd(lines, i, indent);
          chunks.push(this.createChunk(
            document,
            'method',
            methodMatch[1],
            i,
            endLine,
            currentClass.id
          ));
        }
      }
    }

    // Add any remaining class
    if (currentClass) {
      currentClass.endLine = lines.length - 1;
      chunks.push(currentClass);
    }

    // Add the full module
    chunks.push(this.createChunk(document, 'module', path.basename(document.uri.fsPath), 0, lines.length - 1));

    return chunks;
  }

  private findPythonBlockEnd(lines: string[], startLine: number, baseIndent: number): number {
    for (let i = startLine + 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      const indent = line.length - line.trimStart().length;

      if (trimmedLine !== '' && indent <= baseIndent) {
        return i - 1;
      }
    }

    return lines.length - 1;
  }
}

class JavaParser extends LanguageParser {
  async parse(document: vscode.TextDocument): Promise<CodeChunk[]> {
    const chunks: CodeChunk[] = [];
    const text = document.getText();
    const lines = text.split('\n');

    const importRegex = /^import\s+([\w.]+);/;
    const classRegex = /^(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/;
    const methodRegex = /^\s*(?:public|private|protected)?\s*(?:static\s+)?[\w<>]+\s+(\w+)\s*\(/;

    let currentClass: CodeChunk | null = null;
    let braceCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      if (currentClass && braceCount === 0) {
        currentClass.endLine = i;
        chunks.push(currentClass);
        currentClass = null;
      }

      const importMatch = line.match(importRegex);
      if (importMatch) {
        chunks.push(this.createChunk(document, 'import', importMatch[1], i, i));
        continue;
      }

      const classMatch = line.match(classRegex);
      if (classMatch) {
        currentClass = this.createChunk(document, 'class', classMatch[1], i, i);
        braceCount = 1;
        continue;
      }

      if (currentClass) {
        const methodMatch = line.match(methodRegex);
        if (methodMatch) {
          const endLine = this.findMethodEnd(lines, i);
          chunks.push(this.createChunk(
            document,
            'method',
            methodMatch[1],
            i,
            endLine,
            currentClass.id
          ));
        }
      }
    }

    chunks.push(this.createChunk(document, 'module', path.basename(document.uri.fsPath), 0, lines.length - 1));

    return chunks;
  }

  private findMethodEnd(lines: string[], startLine: number): number {
    let braceCount = 0;
    let started = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.includes('{')) {
        started = true;
        braceCount += (line.match(/{/g) || []).length;
      }
      
      braceCount -= (line.match(/}/g) || []).length;

      if (started && braceCount === 0) {
        return i;
      }
    }

    return lines.length - 1;
  }
}

class GenericParser extends LanguageParser {
  async parse(document: vscode.TextDocument): Promise<CodeChunk[]> {
    // For unsupported languages, just create a single module chunk
    return [
      this.createChunk(
        document,
        'module',
        path.basename(document.uri.fsPath),
        0,
        document.lineCount - 1
      )
    ];
  }
}