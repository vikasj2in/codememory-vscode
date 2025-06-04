"use strict";
// test/suite/extension.test.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const parser_1 = require("../../src/indexer/parser");
const vectorStore_1 = require("../../src/vectorstore/vectorStore");
const contextManager_1 = require("../../src/context/contextManager");
suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');
    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('undefined_publisher.codememory'));
    });
    test('Should register all commands', async () => {
        const commands = await vscode.commands.getCommands();
        assert.ok(commands.includes('codememory.indexWorkspace'));
        assert.ok(commands.includes('codememory.explainCode'));
        assert.ok(commands.includes('codememory.findRelated'));
        assert.ok(commands.includes('codememory.askQuestion'));
        assert.ok(commands.includes('codememory.showMemoryStatus'));
    });
});
suite('Code Parser Tests', () => {
    let parser;
    setup(() => {
        parser = new parser_1.CodeParser();
    });
    test('Should parse TypeScript file correctly', async () => {
        const content = `
import { Module } from '@nestjs/common';
import { UserService } from './user.service';

export class UserController {
  constructor(private userService: UserService) {}

  async getUser(id: string): Promise<User> {
    return this.userService.findById(id);
  }

  async createUser(data: CreateUserDto): Promise<User> {
    return this.userService.create(data);
  }
}
`;
        // Create a mock document
        const uri = vscode.Uri.parse('untitled:test.ts');
        const doc = await vscode.workspace.openTextDocument({ content, language: 'typescript' });
        const chunks = await parser.parseFile(doc.uri);
        assert.ok(chunks.length > 0);
        assert.ok(chunks.some(c => c.type === 'import'));
        assert.ok(chunks.some(c => c.type === 'class' && c.name === 'UserController'));
        assert.ok(chunks.some(c => c.type === 'method' && c.name === 'getUser'));
        assert.ok(chunks.some(c => c.type === 'method' && c.name === 'createUser'));
    });
    test('Should parse Python file correctly', async () => {
        const content = `
import os
from typing import List, Optional

class DataProcessor:
    def __init__(self, config: dict):
        self.config = config
        self.data = []
    
    def process_file(self, filepath: str) -> List[dict]:
        """Process a single file and return results."""
        with open(filepath, 'r') as f:
            content = f.read()
        
        return self._parse_content(content)
    
    def _parse_content(self, content: str) -> List[dict]:
        # Implementation details
        pass

def main():
    processor = DataProcessor({})
    results = processor.process_file('data.txt')
    print(results)
`;
        const uri = vscode.Uri.parse('untitled:test.py');
        const doc = await vscode.workspace.openTextDocument({ content, language: 'python' });
        const chunks = await parser.parseFile(doc.uri);
        assert.ok(chunks.some(c => c.type === 'import'));
        assert.ok(chunks.some(c => c.type === 'class' && c.name === 'DataProcessor'));
        assert.ok(chunks.some(c => c.type === 'method' && c.name === '__init__'));
        assert.ok(chunks.some(c => c.type === 'method' && c.name === 'process_file'));
        assert.ok(chunks.some(c => c.type === 'function' && c.name === 'main'));
    });
});
suite('Vector Store Tests', () => {
    let vectorStore;
    const testWorkspace = path.join(__dirname, 'test-workspace');
    setup(async () => {
        vectorStore = new vectorStore_1.VectorStore(testWorkspace);
        await vectorStore.initialize('test-project');
    });
    teardown(async () => {
        await vectorStore.clearAll();
    });
    test('Should add and retrieve chunks', async () => {
        const chunk = {
            id: 'test-1',
            filepath: '/test/file.ts',
            content: 'function testFunction() { return 42; }',
            type: 'function',
            name: 'testFunction',
            startLine: 1,
            endLine: 1,
            language: 'typescript',
            metadata: {}
        };
        await vectorStore.addChunks([chunk]);
        const results = await vectorStore.search('testFunction', 5);
        assert.ok(results.length > 0);
        assert.strictEqual(results[0].chunk.id, 'test-1');
    });
    test('Should find similar code', async () => {
        const chunks = [
            {
                id: 'func-1',
                filepath: '/test/auth.ts',
                content: 'async function authenticateUser(username: string, password: string): Promise<User> { /* auth logic */ }',
                type: 'function',
                name: 'authenticateUser',
                startLine: 1,
                endLine: 3,
                language: 'typescript',
                metadata: {}
            },
            {
                id: 'func-2',
                filepath: '/test/user.ts',
                content: 'async function validateUser(username: string, token: string): Promise<boolean> { /* validation */ }',
                type: 'function',
                name: 'validateUser',
                startLine: 5,
                endLine: 7,
                language: 'typescript',
                metadata: {}
            },
            {
                id: 'func-3',
                filepath: '/test/data.ts',
                content: 'function processData(data: any[]): ProcessedData { /* processing */ }',
                type: 'function',
                name: 'processData',
                startLine: 10,
                endLine: 15,
                language: 'typescript',
                metadata: {}
            }
        ];
        await vectorStore.addChunks(chunks);
        const results = await vectorStore.searchByCode('function authenticate user with username and password');
        assert.ok(results.length >= 2);
        assert.ok(results.some(r => r.chunk.name === 'authenticateUser'));
        assert.ok(results.some(r => r.chunk.name === 'validateUser'));
    });
});
suite('Context Manager Tests', () => {
    let contextManager;
    let vectorStore;
    const testWorkspace = path.join(__dirname, 'test-workspace');
    setup(async () => {
        vectorStore = new vectorStore_1.VectorStore(testWorkspace);
        await vectorStore.initialize('test-project');
        contextManager = new contextManager_1.ContextManager(testWorkspace, vectorStore);
    });
    test('Should get relevant context for query', async () => {
        // Add some test chunks
        const chunks = [
            {
                id: 'auth-1',
                filepath: '/test/auth.service.ts',
                content: 'class AuthService { login(username: string, password: string) { /* ... */ } }',
                type: 'class',
                name: 'AuthService',
                startLine: 1,
                endLine: 10,
                language: 'typescript',
                metadata: {}
            },
            {
                id: 'auth-2',
                filepath: '/test/auth.controller.ts',
                content: 'class AuthController { constructor(private authService: AuthService) {} }',
                type: 'class',
                name: 'AuthController',
                startLine: 1,
                endLine: 20,
                language: 'typescript',
                metadata: { dependencies: ['AuthService'] }
            }
        ];
        await vectorStore.addChunks(chunks);
        const context = await contextManager.getRelevantContext('How does authentication work?', 10);
        assert.ok(context.chunks.length > 0);
        assert.ok(context.chunks.some(r => r.chunk.name === 'AuthService'));
    });
    test('Should record and retrieve memory entries', async () => {
        const query = 'What is the main authentication method?';
        const response = 'The main authentication method is JWT-based...';
        const chunks = ['chunk-1', 'chunk-2'];
        const entry = await contextManager.recordMemoryEntry(query, response, chunks);
        assert.ok(entry.id);
        assert.strictEqual(entry.query, query);
        assert.strictEqual(entry.response, response);
        assert.deepStrictEqual(entry.relevantChunks, chunks);
    });
});
//# sourceMappingURL=extension.test.js.map