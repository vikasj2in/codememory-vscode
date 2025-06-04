// src/core/architectureAnalyzer.ts

import { CodeChunk, VectorSearchResult } from '../types';
import { VectorStore } from '../vectorstore/memoryVectorStore';
import * as path from 'path';

export interface ArchitecturalInsight {
  pattern: string;
  description: string;
  locations: string[];
  confidence: number;
  suggestions?: string[];
  violations?: string[];
}

export interface LayerAnalysis {
  layers: Map<string, string[]>;
  violations: LayerViolation[];
  suggestions: string[];
}

export interface LayerViolation {
  from: string;
  to: string;
  file: string;
  description: string;
}

export class ArchitectureAnalyzer {
  private vectorStore: VectorStore;
  private patterns: Map<string, ArchitecturalInsight> = new Map();
  
  constructor(vectorStore: VectorStore) {
    this.vectorStore = vectorStore;
  }

  async analyzeArchitecture(): Promise<{
    patterns: ArchitecturalInsight[];
    layers: LayerAnalysis;
    metrics: ArchitectureMetrics;
  }> {
    // Get all chunks for analysis
    const allChunks = await this.getAllChunks();
    
    // Detect patterns
    const patterns = await this.detectArchitecturalPatterns(allChunks);
    
    // Analyze layers
    const layers = await this.analyzeLayerArchitecture(allChunks);
    
    // Calculate metrics
    const metrics = this.calculateArchitectureMetrics(allChunks);
    
    return { patterns, layers, metrics };
  }

  private async getAllChunks(): Promise<CodeChunk[]> {
    // Search for all chunks (using a broad query)
    const results = await this.vectorStore.search('*', 10000);
    return results.map(r => r.chunk);
  }

  private async detectArchitecturalPatterns(chunks: CodeChunk[]): Promise<ArchitecturalInsight[]> {
    const insights: ArchitecturalInsight[] = [];
    
    // Detect MVC Pattern
    const mvcInsight = this.detectMVCPattern(chunks);
    if (mvcInsight.confidence > 0.6) {
      insights.push(mvcInsight);
    }
    
    // Detect Repository Pattern
    const repoInsight = this.detectRepositoryPattern(chunks);
    if (repoInsight.confidence > 0.6) {
      insights.push(repoInsight);
    }
    
    // Detect Service Layer
    const serviceInsight = this.detectServiceLayer(chunks);
    if (serviceInsight.confidence > 0.6) {
      insights.push(serviceInsight);
    }
    
    // Detect Factory Pattern
    const factoryInsight = this.detectFactoryPattern(chunks);
    if (factoryInsight.confidence > 0.6) {
      insights.push(factoryInsight);
    }
    
    // Detect Singleton Pattern
    const singletonInsight = this.detectSingletonPattern(chunks);
    if (singletonInsight.confidence > 0.6) {
      insights.push(singletonInsight);
    }
    
    // Detect Observer Pattern
    const observerInsight = this.detectObserverPattern(chunks);
    if (observerInsight.confidence > 0.6) {
      insights.push(observerInsight);
    }
    
    return insights;
  }

  private detectMVCPattern(chunks: CodeChunk[]): ArchitecturalInsight {
    const controllers = chunks.filter(c => 
      c.name.toLowerCase().includes('controller') || 
      c.filepath.toLowerCase().includes('controller')
    );
    
    const models = chunks.filter(c => 
      c.name.toLowerCase().includes('model') || 
      c.filepath.toLowerCase().includes('model')
    );
    
    const views = chunks.filter(c => 
      c.name.toLowerCase().includes('view') || 
      c.filepath.toLowerCase().includes('view') ||
      c.filepath.toLowerCase().includes('template')
    );
    
    const totalRelevant = controllers.length + models.length + views.length;
    const confidence = totalRelevant > 0 ? 
      Math.min((controllers.length > 0 ? 0.33 : 0) + 
                (models.length > 0 ? 0.33 : 0) + 
                (views.length > 0 ? 0.34 : 0), 1) : 0;
    
    const locations = [
      ...controllers.map(c => c.filepath),
      ...models.map(c => c.filepath),
      ...views.map(c => c.filepath)
    ].slice(0, 10);
    
    const suggestions: string[] = [];
    if (controllers.length === 0) suggestions.push('Consider organizing controllers in a dedicated directory');
    if (models.length === 0) suggestions.push('Consider organizing models in a dedicated directory');
    if (views.length === 0 && chunks.some(c => c.filepath.includes('.html') || c.filepath.includes('.jsx'))) {
      suggestions.push('Consider organizing views/templates in a dedicated directory');
    }
    
    return {
      pattern: 'Model-View-Controller (MVC)',
      description: 'Separates application logic into models (data), views (presentation), and controllers (logic)',
      locations,
      confidence,
      suggestions
    };
  }

  private detectRepositoryPattern(chunks: CodeChunk[]): ArchitecturalInsight {
    const repositories = chunks.filter(c => 
      c.name.toLowerCase().includes('repository') ||
      c.name.toLowerCase().includes('repo') ||
      c.filepath.toLowerCase().includes('repository')
    );
    
    const dataAccessMethods = chunks.filter(c => 
      c.type === 'method' && 
      (c.content.includes('find') || c.content.includes('save') || 
       c.content.includes('delete') || c.content.includes('update'))
    );
    
    const confidence = repositories.length > 0 ? 
      Math.min(0.6 + (dataAccessMethods.length * 0.02), 1) : 0;
    
    const violations: string[] = [];
    
    // Check for data access outside repositories
    const nonRepoDataAccess = chunks.filter(c => 
      !c.filepath.toLowerCase().includes('repository') &&
      (c.content.includes('SELECT') || c.content.includes('INSERT') || 
       c.content.includes('UPDATE') || c.content.includes('DELETE'))
    );
    
    if (nonRepoDataAccess.length > 0 && repositories.length > 0) {
      violations.push(`Found ${nonRepoDataAccess.length} files with direct database access outside repository layer`);
    }
    
    return {
      pattern: 'Repository Pattern',
      description: 'Encapsulates data access logic and provides a more object-oriented view of the persistence layer',
      locations: repositories.map(r => r.filepath).slice(0, 10),
      confidence,
      suggestions: confidence > 0 ? [] : ['Consider implementing repository pattern for data access'],
      violations
    };
  }

  private detectServiceLayer(chunks: CodeChunk[]): ArchitecturalInsight {
    const services = chunks.filter(c => 
      c.name.toLowerCase().includes('service') ||
      c.filepath.toLowerCase().includes('service')
    );
    
    const businessLogic = chunks.filter(c => 
      c.type === 'method' && 
      c.content.length > 200 && // Substantial methods
      !c.filepath.toLowerCase().includes('controller') &&
      !c.filepath.toLowerCase().includes('repository')
    );
    
    const confidence = services.length > 0 ? 
      Math.min(0.5 + (services.length * 0.05), 1) : 0;
    
    return {
      pattern: 'Service Layer',
      description: 'Defines application boundaries and orchestrates business operations',
      locations: services.map(s => s.filepath).slice(0, 10),
      confidence,
      suggestions: confidence > 0 ? [] : ['Consider implementing service layer for business logic']
    };
  }

  private detectFactoryPattern(chunks: CodeChunk[]): ArchitecturalInsight {
    const factories = chunks.filter(c => 
      c.name.toLowerCase().includes('factory') ||
      c.content.includes('createInstance') ||
      c.content.includes('getInstance') ||
      (c.type === 'method' && c.name.toLowerCase().startsWith('create'))
    );
    
    const confidence = factories.length > 0 ? 
      Math.min(0.5 + (factories.length * 0.1), 1) : 0;
    
    return {
      pattern: 'Factory Pattern',
      description: 'Provides interface for creating objects without specifying exact classes',
      locations: factories.map(f => f.filepath).slice(0, 10),
      confidence,
      suggestions: []
    };
  }

  private detectSingletonPattern(chunks: CodeChunk[]): ArchitecturalInsight {
    const singletons = chunks.filter(c => 
      c.content.includes('instance') && 
      (c.content.includes('private constructor') || 
       c.content.includes('getInstance') ||
       c.content.includes('_instance'))
    );
    
    const confidence = singletons.length > 0 ? 
      Math.min(0.7 + (singletons.length * 0.1), 1) : 0;
    
    return {
      pattern: 'Singleton Pattern',
      description: 'Ensures a class has only one instance and provides global access',
      locations: singletons.map(s => s.filepath).slice(0, 10),
      confidence,
      suggestions: singletons.length > 5 ? 
        ['Consider if all singleton instances are necessary - overuse can lead to testing difficulties'] : []
    };
  }

  private detectObserverPattern(chunks: CodeChunk[]): ArchitecturalInsight {
    const observers = chunks.filter(c => 
      c.name.toLowerCase().includes('observer') ||
      c.name.toLowerCase().includes('listener') ||
      c.content.includes('addEventListener') ||
      c.content.includes('subscribe') ||
      c.content.includes('notify') ||
      c.content.includes('emit')
    );
    
    const confidence = observers.length > 0 ? 
      Math.min(0.5 + (observers.length * 0.05), 1) : 0;
    
    return {
      pattern: 'Observer Pattern',
      description: 'Defines one-to-many dependency between objects for event notification',
      locations: observers.map(o => o.filepath).slice(0, 10),
      confidence,
      suggestions: []
    };
  }

  private async analyzeLayerArchitecture(chunks: CodeChunk[]): Promise<LayerAnalysis> {
    const layers = new Map<string, string[]>();
    const violations: LayerViolation[] = [];
    
    // Categorize files into layers based on path and naming
    chunks.forEach(chunk => {
      const filepath = chunk.filepath.toLowerCase();
      let layer = 'unknown';
      
      if (filepath.includes('controller')) layer = 'presentation';
      else if (filepath.includes('service')) layer = 'business';
      else if (filepath.includes('repository') || filepath.includes('dao')) layer = 'data';
      else if (filepath.includes('model') || filepath.includes('entity')) layer = 'domain';
      else if (filepath.includes('util') || filepath.includes('helper')) layer = 'utility';
      else if (filepath.includes('config')) layer = 'configuration';
      
      if (!layers.has(layer)) {
        layers.set(layer, []);
      }
      layers.get(layer)!.push(chunk.filepath);
    });
    
    // Detect layer violations
    chunks.forEach(chunk => {
      const fromLayer = this.getLayerForFile(chunk.filepath);
      
      // Analyze imports/dependencies
      const imports = this.extractImports(chunk);
      imports.forEach(imp => {
        const toLayer = this.getLayerForFile(imp);
        
        if (this.isLayerViolation(fromLayer, toLayer)) {
          violations.push({
            from: fromLayer,
            to: toLayer,
            file: chunk.filepath,
            description: `${fromLayer} layer should not depend on ${toLayer} layer`
          });
        }
      });
    });
    
    const suggestions: string[] = [];
    if (violations.length > 0) {
      suggestions.push(`Found ${violations.length} layer violations that should be addressed`);
    }
    
    if (!layers.has('service') || layers.get('service')!.length === 0) {
      suggestions.push('Consider introducing a service layer to encapsulate business logic');
    }
    
    return { layers, violations, suggestions };
  }

  private getLayerForFile(filepath: string): string {
    const lower = filepath.toLowerCase();
    if (lower.includes('controller')) return 'presentation';
    if (lower.includes('service')) return 'business';
    if (lower.includes('repository') || lower.includes('dao')) return 'data';
    if (lower.includes('model') || lower.includes('entity')) return 'domain';
    if (lower.includes('util') || lower.includes('helper')) return 'utility';
    if (lower.includes('config')) return 'configuration';
    return 'unknown';
  }

  private isLayerViolation(from: string, to: string): boolean {
    // Define allowed dependencies (lower layers can't depend on upper layers)
    const layerHierarchy = ['presentation', 'business', 'data', 'domain', 'utility', 'configuration'];
    const fromIndex = layerHierarchy.indexOf(from);
    const toIndex = layerHierarchy.indexOf(to);
    
    // Presentation should not be imported by any other layer
    if (to === 'presentation' && from !== 'presentation') return true;
    
    // Business logic should not be imported by data or domain layers
    if (to === 'business' && (from === 'data' || from === 'domain')) return true;
    
    return false;
  }

  private extractImports(chunk: CodeChunk): string[] {
    const imports: string[] = [];
    const lines = chunk.content.split('\n');
    
    lines.forEach(line => {
      // JavaScript/TypeScript imports
      const jsMatch = line.match(/(?:import|require)\s*(?:\()?['"]([^'"]+)['"]/);
      if (jsMatch) imports.push(jsMatch[1]);
      
      // Python imports
      const pyMatch = line.match(/(?:from\s+(\S+)\s+)?import\s+/);
      if (pyMatch && pyMatch[1]) imports.push(pyMatch[1]);
      
      // Java imports
      const javaMatch = line.match(/import\s+([\w.]+);/);
      if (javaMatch) imports.push(javaMatch[1]);
    });
    
    return imports;
  }

  private calculateArchitectureMetrics(chunks: CodeChunk[]): ArchitectureMetrics {
    const totalFiles = new Set(chunks.map(c => c.filepath)).size;
    const avgFileSize = chunks.reduce((sum, c) => sum + c.content.length, 0) / chunks.length;
    
    // Coupling metric - how many dependencies between files
    const dependencies = new Map<string, Set<string>>();
    chunks.forEach(chunk => {
      const imports = this.extractImports(chunk);
      dependencies.set(chunk.filepath, new Set(imports));
    });
    
    const avgDependencies = Array.from(dependencies.values())
      .reduce((sum, deps) => sum + deps.size, 0) / dependencies.size;
    
    // Cohesion metric - how well organized are related files
    const cohesion = this.calculateCohesion(chunks);
    
    return {
      totalFiles,
      avgFileSize,
      avgDependencies,
      cohesion,
      complexity: this.calculateComplexity(chunks)
    };
  }

  private calculateCohesion(chunks: CodeChunk[]): number {
    // Simple cohesion metric based on how well files are organized by type
    const typeGroups = new Map<string, Set<string>>();
    
    chunks.forEach(chunk => {
      const dir = path.dirname(chunk.filepath);
      const type = chunk.type;
      
      if (!typeGroups.has(type)) {
        typeGroups.set(type, new Set());
      }
      typeGroups.get(type)!.add(dir);
    });
    
    // Lower number of different directories per type = higher cohesion
    const avgDirsPerType = Array.from(typeGroups.values())
      .reduce((sum, dirs) => sum + dirs.size, 0) / typeGroups.size;
    
    return Math.max(0, 1 - (avgDirsPerType / 10));
  }

  private calculateComplexity(chunks: CodeChunk[]): number {
    // Cyclomatic complexity approximation
    const complexityKeywords = ['if', 'else', 'for', 'while', 'switch', 'case', 'catch'];
    
    const totalComplexity = chunks.reduce((sum, chunk) => {
      const complexity = complexityKeywords.reduce((count, keyword) => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'g');
        return count + (chunk.content.match(regex) || []).length;
      }, 1); // Base complexity of 1
      
      return sum + complexity;
    }, 0);
    
    return totalComplexity / chunks.length;
  }
}

interface ArchitectureMetrics {
  totalFiles: number;
  avgFileSize: number;
  avgDependencies: number;
  cohesion: number;
  complexity: number;
}