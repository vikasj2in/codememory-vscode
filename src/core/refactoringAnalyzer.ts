// src/core/refactoringAnalyzer.ts

import { CodeChunk, VectorSearchResult } from '../types';
import { VectorStore } from '../vectorstore/memoryVectorStore';
import { LLMInterface } from '../llm/llmInterface';

export interface RefactoringSuggestion {
  type: RefactoringType;
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  chunk: CodeChunk;
  suggestedCode?: string;
  benefits: string[];
  effort: 'low' | 'medium' | 'high';
}

export enum RefactoringType {
  EXTRACT_METHOD = 'Extract Method',
  EXTRACT_VARIABLE = 'Extract Variable',
  RENAME = 'Rename',
  REMOVE_DUPLICATION = 'Remove Duplication',
  SIMPLIFY_CONDITIONAL = 'Simplify Conditional',
  EXTRACT_INTERFACE = 'Extract Interface',
  MOVE_METHOD = 'Move Method',
  INLINE_METHOD = 'Inline Method',
  DECOMPOSE_CONDITIONAL = 'Decompose Conditional',
  INTRODUCE_PARAMETER_OBJECT = 'Introduce Parameter Object',
  REMOVE_DEAD_CODE = 'Remove Dead Code',
  CONSOLIDATE_DUPLICATE = 'Consolidate Duplicate Code'
}

export class RefactoringAnalyzer {
  private vectorStore: VectorStore;
  private llmInterface?: LLMInterface;

  constructor(vectorStore: VectorStore, llmInterface?: LLMInterface) {
    this.vectorStore = vectorStore;
    this.llmInterface = llmInterface;
  }

  async analyzeForRefactoring(chunk: CodeChunk): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];

    // Analyze code smells
    suggestions.push(...this.detectLongMethod(chunk));
    suggestions.push(...this.detectDuplicateCode(chunk));
    suggestions.push(...this.detectComplexConditionals(chunk));
    suggestions.push(...this.detectLongParameterList(chunk));
    suggestions.push(...this.detectDeadCode(chunk));
    suggestions.push(...this.detectPoorNaming(chunk));

    // Use LLM for advanced suggestions if available
    if (this.llmInterface) {
      const llmSuggestions = await this.getLLMRefactoringSuggestions(chunk);
      suggestions.push(...llmSuggestions);
    }

    // Sort by severity
    return suggestions.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  async findGlobalRefactoringOpportunities(): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];
    
    // Get all chunks
    const allResults = await this.vectorStore.search('*', 10000);
    const chunks = allResults.map(r => r.chunk);

    // Find duplicate code patterns
    const duplicates = await this.findDuplicatePatterns(chunks);
    suggestions.push(...duplicates);

    // Find methods that should be moved
    const moveMethodSuggestions = await this.findMethodsToMove(chunks);
    suggestions.push(...moveMethodSuggestions);

    // Find opportunities to extract interfaces
    const interfaceSuggestions = await this.findInterfaceExtractionOpportunities(chunks);
    suggestions.push(...interfaceSuggestions);

    return suggestions;
  }

  private detectLongMethod(chunk: CodeChunk): RefactoringSuggestion[] {
    const suggestions: RefactoringSuggestion[] = [];
    
    if (chunk.type !== 'function' && chunk.type !== 'method') return suggestions;

    const lines = chunk.content.split('\n').filter(l => l.trim().length > 0);
    const methodLength = lines.length;

    if (methodLength > 30) {
      // Analyze for logical sections
      const sections = this.identifyLogicalSections(chunk.content);
      
      suggestions.push({
        type: RefactoringType.EXTRACT_METHOD,
        severity: methodLength > 50 ? 'high' : 'medium',
        title: `Long method: ${chunk.name} (${methodLength} lines)`,
        description: `This method is too long and should be broken down into smaller, more focused methods.`,
        chunk,
        benefits: [
          'Improved readability',
          'Easier testing',
          'Better reusability',
          'Single responsibility principle'
        ],
        effort: sections.length > 3 ? 'high' : 'medium'
      });

      // Suggest specific extractions
      sections.forEach((section, index) => {
        if (section.lines > 10) {
          suggestions.push({
            type: RefactoringType.EXTRACT_METHOD,
            severity: 'medium',
            title: `Extract section ${index + 1} from ${chunk.name}`,
            description: section.description,
            chunk,
            suggestedCode: this.generateExtractMethodCode(chunk, section),
            benefits: ['Improved modularity', 'Clearer intent'],
            effort: 'low'
          });
        }
      });
    }

    return suggestions;
  }

  private detectDuplicateCode(chunk: CodeChunk): RefactoringSuggestion[] {
    const suggestions: RefactoringSuggestion[] = [];
    
    // Find repeated patterns within the chunk
    const duplicates = this.findInternalDuplication(chunk.content);
    
    duplicates.forEach(dup => {
      suggestions.push({
        type: RefactoringType.EXTRACT_VARIABLE,
        severity: 'medium',
        title: `Duplicate code pattern in ${chunk.name}`,
        description: `The pattern "${dup.pattern.substring(0, 50)}..." appears ${dup.count} times`,
        chunk,
        benefits: ['DRY principle', 'Easier maintenance', 'Reduced bugs'],
        effort: 'low'
      });
    });

    return suggestions;
  }

  private detectComplexConditionals(chunk: CodeChunk): RefactoringSuggestion[] {
    const suggestions: RefactoringSuggestion[] = [];
    
    // Find complex if statements
    const complexConditions = this.findComplexConditions(chunk.content);
    
    complexConditions.forEach(condition => {
      if (condition.complexity > 3) {
        suggestions.push({
          type: RefactoringType.DECOMPOSE_CONDITIONAL,
          severity: condition.complexity > 5 ? 'high' : 'medium',
          title: `Complex conditional in ${chunk.name}`,
          description: `This conditional has ${condition.complexity} conditions and should be simplified`,
          chunk,
          suggestedCode: this.generateSimplifiedConditional(condition),
          benefits: ['Improved readability', 'Easier debugging', 'Better testability'],
          effort: 'medium'
        });
      }
    });

    return suggestions;
  }

  private detectLongParameterList(chunk: CodeChunk): RefactoringSuggestion[] {
    const suggestions: RefactoringSuggestion[] = [];
    
    if (chunk.type !== 'function' && chunk.type !== 'method') return suggestions;

    // Extract function signature
    const signature = this.extractFunctionSignature(chunk.content);
    if (signature && signature.parameters.length > 3) {
      suggestions.push({
        type: RefactoringType.INTRODUCE_PARAMETER_OBJECT,
        severity: signature.parameters.length > 5 ? 'high' : 'medium',
        title: `Long parameter list in ${chunk.name}`,
        description: `This function has ${signature.parameters.length} parameters. Consider using a parameter object.`,
        chunk,
        suggestedCode: this.generateParameterObject(chunk.name, signature.parameters),
        benefits: ['Cleaner API', 'Easier to extend', 'Better documentation'],
        effort: 'medium'
      });
    }

    return suggestions;
  }

  private detectDeadCode(chunk: CodeChunk): RefactoringSuggestion[] {
    const suggestions: RefactoringSuggestion[] = [];
    
    // Look for unused variables
    const unusedVars = this.findUnusedVariables(chunk.content);
    
    if (unusedVars.length > 0) {
      suggestions.push({
        type: RefactoringType.REMOVE_DEAD_CODE,
        severity: 'low',
        title: `Unused variables in ${chunk.name}`,
        description: `Found ${unusedVars.length} unused variables: ${unusedVars.join(', ')}`,
        chunk,
        benefits: ['Cleaner code', 'Reduced confusion', 'Smaller bundle size'],
        effort: 'low'
      });
    }

    // Look for unreachable code
    const unreachableCode = this.findUnreachableCode(chunk.content);
    if (unreachableCode.length > 0) {
      suggestions.push({
        type: RefactoringType.REMOVE_DEAD_CODE,
        severity: 'medium',
        title: `Unreachable code in ${chunk.name}`,
        description: `Found unreachable code after return/throw statements`,
        chunk,
        benefits: ['Cleaner code', 'No confusion about execution flow'],
        effort: 'low'
      });
    }

    return suggestions;
  }

  private detectPoorNaming(chunk: CodeChunk): RefactoringSuggestion[] {
    const suggestions: RefactoringSuggestion[] = [];
    
    // Find single letter variables (except common ones like i, j in loops)
    const poorNames = this.findPoorVariableNames(chunk.content);
    
    poorNames.forEach(name => {
      suggestions.push({
        type: RefactoringType.RENAME,
        severity: 'low',
        title: `Poor variable name: "${name.name}"`,
        description: `The variable "${name.name}" should have a more descriptive name`,
        chunk,
        suggestedCode: name.suggestion,
        benefits: ['Better readability', 'Self-documenting code'],
        effort: 'low'
      });
    });

    return suggestions;
  }

  private async findDuplicatePatterns(chunks: CodeChunk[]): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];
    const codePatterns = new Map<string, CodeChunk[]>();

    // Group similar code patterns
    for (const chunk of chunks) {
      if (chunk.type === 'function' || chunk.type === 'method') {
        const pattern = this.normalizeCode(chunk.content);
        const hash = this.hashCodePattern(pattern);
        
        if (!codePatterns.has(hash)) {
          codePatterns.set(hash, []);
        }
        codePatterns.get(hash)!.push(chunk);
      }
    }

    // Find duplicates
    for (const [hash, duplicates] of codePatterns) {
      if (duplicates.length > 1) {
        suggestions.push({
          type: RefactoringType.CONSOLIDATE_DUPLICATE,
          severity: 'high',
          title: `Duplicate code pattern found in ${duplicates.length} locations`,
          description: `Similar code exists in: ${duplicates.map(d => d.name).join(', ')}`,
          chunk: duplicates[0],
          benefits: [
            'Single source of truth',
            'Easier maintenance',
            'Consistent behavior',
            'Reduced code size'
          ],
          effort: 'high'
        });
      }
    }

    return suggestions;
  }

  private async findMethodsToMove(chunks: CodeChunk[]): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];
    
    // Analyze method usage patterns
    for (const chunk of chunks) {
      if (chunk.type === 'method') {
        const usage = await this.analyzeMethodUsage(chunk, chunks);
        
        if (usage.externalCalls > usage.internalCalls && usage.externalCalls > 2) {
          suggestions.push({
            type: RefactoringType.MOVE_METHOD,
            severity: 'medium',
            title: `Method "${chunk.name}" might belong in another class`,
            description: `This method is called more from outside (${usage.externalCalls} times) than inside (${usage.internalCalls} times) its current class`,
            chunk,
            benefits: ['Better cohesion', 'Reduced coupling', 'Clearer responsibilities'],
            effort: 'medium'
          });
        }
      }
    }

    return suggestions;
  }

  private async findInterfaceExtractionOpportunities(chunks: CodeChunk[]): Promise<RefactoringSuggestion[]> {
    const suggestions: RefactoringSuggestion[] = [];
    
    // Find classes with similar method signatures
    const classes = chunks.filter(c => c.type === 'class');
    const methodSignatures = new Map<string, CodeChunk[]>();

    for (const classChunk of classes) {
      const methods = chunks.filter(c => 
        c.type === 'method' && 
        c.parentId === classChunk.id
      );

      methods.forEach(method => {
        const signature = this.extractMethodSignature(method.content);
        if (signature) {
          const key = `${method.name}:${signature.parameters.length}`;
          if (!methodSignatures.has(key)) {
            methodSignatures.set(key, []);
          }
          methodSignatures.get(key)!.push(classChunk);
        }
      });
    }

    // Find common interfaces
    for (const [signature, classes] of methodSignatures) {
      if (classes.length > 2) {
        suggestions.push({
          type: RefactoringType.EXTRACT_INTERFACE,
          severity: 'medium',
          title: `Common interface opportunity for ${signature}`,
          description: `${classes.length} classes share similar method signatures`,
          chunk: classes[0],
          benefits: ['Polymorphism', 'Loose coupling', 'Better testing'],
          effort: 'medium'
        });
      }
    }

    return suggestions;
  }

  private async getLLMRefactoringSuggestions(chunk: CodeChunk): Promise<RefactoringSuggestion[]> {
    if (!this.llmInterface) return [];

    try {
      const prompt = `Analyze this code for refactoring opportunities:

${chunk.content}

Identify specific refactoring suggestions with:
1. Type of refactoring
2. Why it's needed
3. Expected benefits
4. Example of refactored code

Focus on: code smells, SOLID principles, design patterns, and clean code practices.`;

      const response = await this.llmInterface.askQuestion(prompt, [], undefined);
      
      // Parse LLM response into suggestions
      return this.parseLLMSuggestions(response, chunk);
    } catch (error) {
      console.error('Error getting LLM suggestions:', error);
      return [];
    }
  }

  private parseLLMSuggestions(response: string, chunk: CodeChunk): RefactoringSuggestion[] {
    // This is a simplified parser - in production, you'd want more robust parsing
    const suggestions: RefactoringSuggestion[] = [];
    
    // Extract suggestions from LLM response
    const lines = response.split('\n');
    let currentSuggestion: Partial<RefactoringSuggestion> | null = null;

    lines.forEach(line => {
      if (line.includes('Type:') || line.includes('Refactoring:')) {
        if (currentSuggestion) {
          suggestions.push(this.finalizeSuggestion(currentSuggestion, chunk));
        }
        currentSuggestion = {
          type: RefactoringType.EXTRACT_METHOD, // Default
          severity: 'medium',
          benefits: []
        };
      } else if (currentSuggestion) {
        if (line.includes('Benefits:') || line.includes('Benefit:')) {
          currentSuggestion.benefits = [line.replace(/Benefits?:/, '').trim()];
        }
      }
    });

    if (currentSuggestion) {
      suggestions.push(this.finalizeSuggestion(currentSuggestion, chunk));
    }

    return suggestions;
  }

  private finalizeSuggestion(partial: Partial<RefactoringSuggestion>, chunk: CodeChunk): RefactoringSuggestion {
    return {
      type: partial.type || RefactoringType.EXTRACT_METHOD,
      severity: partial.severity || 'medium',
      title: partial.title || 'Refactoring suggestion',
      description: partial.description || 'Consider refactoring this code',
      chunk,
      benefits: partial.benefits || ['Improved code quality'],
      effort: partial.effort || 'medium'
    };
  }

  // Helper methods

  private identifyLogicalSections(code: string): Array<{lines: number; description: string}> {
    const sections: Array<{lines: number; description: string}> = [];
    const lines = code.split('\n');
    
    let currentSection = { lines: 0, description: '' };
    let inSection = false;

    lines.forEach((line, index) => {
      // Look for comments that might indicate sections
      if (line.trim().startsWith('//') || line.trim().startsWith('#')) {
        if (inSection && currentSection.lines > 5) {
          sections.push(currentSection);
        }
        currentSection = { lines: 0, description: line.trim() };
        inSection = true;
      } else if (line.trim().length > 0) {
        currentSection.lines++;
      }
    });

    if (inSection && currentSection.lines > 5) {
      sections.push(currentSection);
    }

    return sections;
  }

  private generateExtractMethodCode(chunk: CodeChunk, section: any): string {
    return `// Extract this section into a new method:
// ${section.description}
private extracted${chunk.name}Section() {
  // Move the relevant code here
}`;
  }

  private findInternalDuplication(code: string): Array<{pattern: string; count: number}> {
    const duplicates: Array<{pattern: string; count: number}> = [];
    const lines = code.split('\n');
    const patterns = new Map<string, number>();

    // Look for repeated patterns (3+ lines)
    for (let i = 0; i < lines.length - 2; i++) {
      const pattern = lines.slice(i, i + 3).join('\n').trim();
      if (pattern.length > 50) {
        patterns.set(pattern, (patterns.get(pattern) || 0) + 1);
      }
    }

    patterns.forEach((count, pattern) => {
      if (count > 1) {
        duplicates.push({ pattern, count });
      }
    });

    return duplicates;
  }

  private findComplexConditions(code: string): Array<{complexity: number; condition: string}> {
    const conditions: Array<{complexity: number; condition: string}> = [];
    const ifRegex = /if\s*\(([\s\S]*?)\)\s*{/g;
    
    let match;
    while ((match = ifRegex.exec(code)) !== null) {
      const condition = match[1];
      const complexity = (condition.match(/&&|\|\|/g) || []).length + 1;
      conditions.push({ complexity, condition });
    }

    return conditions;
  }

  private generateSimplifiedConditional(condition: any): string {
    return `// Simplify this condition by extracting to descriptive boolean variables:
const isCondition1 = /* first part of condition */;
const isCondition2 = /* second part of condition */;

if (isCondition1 && isCondition2) {
  // ...
}`;
  }

  private extractFunctionSignature(code: string): {name: string; parameters: string[]} | null {
    // Simple regex for common function signatures
    const patterns = [
      /function\s+(\w+)\s*\((.*?)\)/,
      /(\w+)\s*\((.*?)\)\s*{/,
      /(\w+)\s*=\s*\((.*?)\)\s*=>/,
      /def\s+(\w+)\s*\((.*?)\):/
    ];

    for (const pattern of patterns) {
      const match = code.match(pattern);
      if (match) {
        const name = match[1];
        const params = match[2].split(',').map(p => p.trim()).filter(p => p.length > 0);
        return { name, parameters: params };
      }
    }

    return null;
  }

  private extractMethodSignature(code: string): {parameters: string[]} | null {
    const signature = this.extractFunctionSignature(code);
    return signature ? { parameters: signature.parameters } : null;
  }

  private generateParameterObject(functionName: string, parameters: string[]): string {
    return `// Instead of:
// ${functionName}(${parameters.join(', ')})

// Consider using a parameter object:
interface ${functionName}Params {
${parameters.map(p => `  ${p.split(':')[0].trim()}: any; // Add proper type`).join('\n')}
}

function ${functionName}(params: ${functionName}Params) {
  // Use params.propertyName
}`;
  }

  private findUnusedVariables(code: string): string[] {
    const unused: string[] = [];
    const varRegex = /(?:let|const|var)\s+(\w+)/g;
    const variables: string[] = [];

    let match;
    while ((match = varRegex.exec(code)) !== null) {
      variables.push(match[1]);
    }

    variables.forEach(varName => {
      // Count occurrences (declaration + usage)
      const regex = new RegExp(`\\b${varName}\\b`, 'g');
      const occurrences = (code.match(regex) || []).length;
      if (occurrences === 1) {
        unused.push(varName);
      }
    });

    return unused;
  }

  private findUnreachableCode(code: string): string[] {
    const unreachable: string[] = [];
    const lines = code.split('\n');
    
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (line.startsWith('return') || line.startsWith('throw')) {
        const nextLine = lines[i + 1].trim();
        if (nextLine && !nextLine.startsWith('}')) {
          unreachable.push(`Line ${i + 2}: ${nextLine}`);
        }
      }
    }

    return unreachable;
  }

  private findPoorVariableNames(code: string): Array<{name: string; suggestion: string}> {
    const poor: Array<{name: string; suggestion: string}> = [];
    const varRegex = /(?:let|const|var)\s+([a-z])\s*=/g;
    
    let match;
    while ((match = varRegex.exec(code)) !== null) {
      const varName = match[1];
      // Exclude common loop variables
      if (!['i', 'j', 'k', 'x', 'y', 'z'].includes(varName)) {
        poor.push({
          name: varName,
          suggestion: `Consider a more descriptive name for "${varName}"`
        });
      }
    }

    return poor;
  }

  private normalizeCode(code: string): string {
    // Remove whitespace and comments for comparison
    return code
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private hashCodePattern(pattern: string): string {
    // Simple hash for grouping similar code
    let hash = 0;
    for (let i = 0; i < pattern.length; i++) {
      const char = pattern.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }

  private async analyzeMethodUsage(method: CodeChunk, allChunks: CodeChunk[]): Promise<{
    internalCalls: number;
    externalCalls: number;
  }> {
    let internalCalls = 0;
    let externalCalls = 0;

    const className = allChunks.find(c => c.id === method.parentId)?.name;

    for (const chunk of allChunks) {
      if (chunk.content.includes(method.name)) {
        if (chunk.parentId === method.parentId) {
          internalCalls++;
        } else {
          externalCalls++;
        }
      }
    }

    return { internalCalls, externalCalls };
  }
}