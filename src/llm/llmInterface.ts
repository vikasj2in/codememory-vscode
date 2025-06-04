// src/llm/llmInterface.ts

import { 
  LLMConfig, 
  CodeChunk, 
  VectorSearchResult, 
  CodeExplanation,
  ProjectContext 
} from '../types';
import * as vscode from 'vscode';

export abstract class LLMProvider {
  config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  abstract generateResponse(
    prompt: string, 
    context?: string
  ): Promise<string>;

  abstract explainCode(
    chunk: CodeChunk,
    context: VectorSearchResult[]
  ): Promise<CodeExplanation>;
}

export class OpenAIProvider extends LLMProvider {
  private apiEndpoint = 'https://api.openai.com/v1/chat/completions';

  async generateResponse(prompt: string, context?: string): Promise<string> {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful coding assistant with deep understanding of the user\'s codebase. Use the provided context to give accurate, specific answers about the code.'
      }
    ];

    if (context) {
      messages.push({
        role: 'system',
        content: `Codebase context:\n${context}`
      });
    }

    messages.push({
      role: 'user',
      content: prompt
    });

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model || 'gpt-4-turbo-preview',
        messages,
        temperature: this.config.temperature || 0.3,
        max_tokens: this.config.maxTokens || 2000
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.choices[0].message.content;
  }

  async explainCode(
    chunk: CodeChunk,
    context: VectorSearchResult[]
  ): Promise<CodeExplanation> {
    const contextStr = context.map(r => 
      `${r.chunk.type} ${r.chunk.name} in ${r.chunk.filepath}`
    ).join('\n');

    const prompt = `
Explain the following ${chunk.type} in detail:

File: ${chunk.filepath}
Type: ${chunk.type}
Name: ${chunk.name}
Lines: ${chunk.startLine}-${chunk.endLine}

Code:
\`\`\`${chunk.language}
${chunk.content}
\`\`\`

Related context:
${contextStr}

Provide:
1. A brief summary of what this code does
2. The main purpose/responsibility
3. Key dependencies (internal and external)
4. Any side effects or important behaviors
5. Suggestions for improvement (if any)

IMPORTANT: Format the response as valid JSON with this exact structure:
{
  "summary": "brief description of what the code does",
  "purpose": "main purpose and responsibility",
  "dependencies": ["dependency1", "dependency2"],
  "sideEffects": ["effect1", "effect2"],
  "suggestions": ["suggestion1", "suggestion2"]
}

Ensure all arrays are properly formatted even if empty.`;

    const response = await this.generateResponse(prompt);
    
    try {
      const parsed = JSON.parse(response);
      // Ensure all expected fields exist and are arrays where needed
      return {
        summary: parsed.summary || 'No summary available',
        purpose: parsed.purpose || 'No purpose description available',
        dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : [],
        sideEffects: Array.isArray(parsed.sideEffects) ? parsed.sideEffects : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
      };
    } catch (error) {
      console.log('Failed to parse JSON response, using fallback format');
      // Fallback if JSON parsing fails
      return {
        summary: response,
        purpose: 'Unable to parse structured response',
        dependencies: [],
        sideEffects: [],
        suggestions: []
      };
    }
  }
}

export class AnthropicProvider extends LLMProvider {
  private apiEndpoint = 'https://api.anthropic.com/v1/messages';

  async generateResponse(prompt: string, context?: string): Promise<string> {
    const systemPrompt = context 
      ? `You are a helpful coding assistant with deep understanding of the user's codebase. Use the provided context to give accurate, specific answers about the code.\n\nCodebase context:\n${context}`
      : 'You are a helpful coding assistant with deep understanding of the user\'s codebase.';

    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey!,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: this.config.model || 'claude-3-5-sonnet-20241022',
        max_tokens: this.config.maxTokens || 2000,
        temperature: this.config.temperature || 0.3,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', errorText);
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.content[0].text;
  }

  async explainCode(
    chunk: CodeChunk,
    context: VectorSearchResult[]
  ): Promise<CodeExplanation> {
    // Same implementation as OpenAI
    const contextStr = context.map(r => 
      `${r.chunk.type} ${r.chunk.name} in ${r.chunk.filepath}`
    ).join('\n');

    const prompt = `
Explain the following ${chunk.type} in detail:

File: ${chunk.filepath}
Type: ${chunk.type}
Name: ${chunk.name}
Lines: ${chunk.startLine}-${chunk.endLine}

Code:
\`\`\`${chunk.language}
${chunk.content}
\`\`\`

Related context:
${contextStr}

Provide:
1. A brief summary of what this code does
2. The main purpose/responsibility
3. Key dependencies (internal and external)
4. Any side effects or important behaviors
5. Suggestions for improvement (if any)

Format the response as JSON with keys: summary, purpose, dependencies, sideEffects, suggestions`;

    const response = await this.generateResponse(prompt);
    
    try {
      const parsed = JSON.parse(response);
      // Ensure all expected fields exist and are arrays where needed
      return {
        summary: parsed.summary || 'No summary available',
        purpose: parsed.purpose || 'No purpose description available',
        dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : [],
        sideEffects: Array.isArray(parsed.sideEffects) ? parsed.sideEffects : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
      };
    } catch (error) {
      console.log('Failed to parse JSON response, using fallback format');
      return {
        summary: response,
        purpose: 'Unable to parse structured response',
        dependencies: [],
        sideEffects: [],
        suggestions: []
      };
    }
  }
}

export class LLMInterface {
  private provider: LLMProvider;
  private contextWindow = 8000; // Conservative estimate

  constructor(config: LLMConfig) {
    switch (config.provider) {
      case 'openai':
        this.provider = new OpenAIProvider(config);
        break;
      case 'anthropic':
        this.provider = new AnthropicProvider(config);
        break;
      default:
        throw new Error(`Unsupported LLM provider: ${config.provider}`);
    }
  }

  async askQuestion(
    question: string,
    relevantChunks: VectorSearchResult[],
    projectContext?: ProjectContext
  ): Promise<string> {
    const context = this.buildContext(relevantChunks, projectContext);
    return this.provider.generateResponse(question, context);
  }

  async explainCode(
    chunk: CodeChunk,
    relatedChunks: VectorSearchResult[]
  ): Promise<CodeExplanation> {
    return this.provider.explainCode(chunk, relatedChunks);
  }

  async suggestCode(
    prompt: string,
    currentFile: string,
    relevantChunks: VectorSearchResult[],
    projectContext?: ProjectContext
  ): Promise<string> {
    const context = this.buildContext(relevantChunks, projectContext);
    
    const enhancedPrompt = `
Current file: ${currentFile}

User request: ${prompt}

Based on the codebase context and patterns, provide a code suggestion that:
1. Follows the existing code style and conventions
2. Uses appropriate existing utilities and patterns
3. Integrates well with the current architecture

Provide the code suggestion with brief explanation.`;

    return this.provider.generateResponse(enhancedPrompt, context);
  }

  async findSimilarCode(
    codeSnippet: string,
    searchResults: VectorSearchResult[]
  ): Promise<string> {
    const context = searchResults.map(r => `
File: ${r.chunk.filepath}
Type: ${r.chunk.type} - ${r.chunk.name}
Lines: ${r.chunk.startLine}-${r.chunk.endLine}
Similarity: ${(1 - r.score).toFixed(3)}

\`\`\`${r.chunk.language}
${r.chunk.content.slice(0, 200)}${r.chunk.content.length > 200 ? '...' : ''}
\`\`\`
`).join('\n---\n');

    const prompt = `
Given this code snippet:
\`\`\`
${codeSnippet}
\`\`\`

And these similar code sections found in the codebase:
${context}

Analyze:
1. What patterns are common across these code sections
2. Any improvements or best practices from the existing code
3. Potential refactoring opportunities to reduce duplication`;

    return this.provider.generateResponse(prompt);
  }

  private buildContext(
    chunks: VectorSearchResult[], 
    projectContext?: ProjectContext
  ): string {
    const parts: string[] = [];

    // Add project context
    if (projectContext) {
      parts.push('=== PROJECT CONTEXT ===');
      parts.push(`Languages: ${projectContext.language.join(', ')}`);
      parts.push(`Frameworks: ${projectContext.frameworks.join(', ')}`);
      
      if (projectContext.patterns.length > 0) {
        parts.push(`Patterns: ${projectContext.patterns.map(p => p.name).join(', ')}`);
      }
      parts.push('');
    }

    // Add relevant code chunks
    parts.push('=== RELEVANT CODE ===');
    
    let totalLength = parts.join('\n').length;
    const maxContextLength = this.contextWindow * 0.7; // Leave room for response

    for (const result of chunks) {
      const chunkStr = this.formatChunkForContext(result);
      if (totalLength + chunkStr.length > maxContextLength) break;
      
      parts.push(chunkStr);
      totalLength += chunkStr.length;
    }

    return parts.join('\n');
  }

  private formatChunkForContext(result: VectorSearchResult): string {
    const chunk = result.chunk;
    const lines = chunk.content.split('\n');
    const preview = lines.slice(0, 10).join('\n');
    const hasMore = lines.length > 10;

    return `
File: ${chunk.filepath}
Type: ${chunk.type} - ${chunk.name}
Lines: ${chunk.startLine}-${chunk.endLine}
${chunk.metadata.docstring ? `Doc: ${chunk.metadata.docstring}` : ''}

\`\`\`${chunk.language}
${preview}${hasMore ? '\n// ... more ...' : ''}
\`\`\`
`;
  }

  updateConfig(config: Partial<LLMConfig>) {
    const newConfig = { ...this.provider.config, ...config };
    
    switch (newConfig.provider) {
      case 'openai':
        this.provider = new OpenAIProvider(newConfig);
        break;
      case 'anthropic':
        this.provider = new AnthropicProvider(newConfig);
        break;
    }
  }
}