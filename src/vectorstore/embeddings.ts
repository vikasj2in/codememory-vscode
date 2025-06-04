// src/vectorstore/embeddings.ts
// Simple local embeddings without external dependencies

export class EmbeddingGenerator {
    private vocabulary: Map<string, number> = new Map();
    private idfScores: Map<string, number> = new Map();
    private documents: string[] = [];
    private dimension: number = 384;
    
    async initialize(): Promise<void> {
      // No initialization needed
      console.log('Local embedding generator initialized');
    }
  
    async generate(text: string): Promise<number[]> {
      // Add to documents for IDF calculation
      this.documents.push(text);
      const tokens = this.tokenize(text);
      this.updateVocabulary(tokens);
      this.computeIDF();
      
      return this.textToVector(text);
    }
  
    async generateBatch(texts: string[]): Promise<number[][]> {
      // Update vocabulary and IDF with all texts
      for (const text of texts) {
        this.documents.push(text);
        const tokens = this.tokenize(text);
        this.updateVocabulary(tokens);
      }
      
      this.computeIDF();
      
      // Generate vectors
      return texts.map(text => this.textToVector(text));
    }
  
    private tokenize(text: string): string[] {
      // Simple tokenization with n-grams
      const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(token => token.length > 0);
      
      // Add bigrams for better context
      const tokens: string[] = [...words];
      for (let i = 0; i < words.length - 1; i++) {
        tokens.push(`${words[i]}_${words[i + 1]}`);
      }
      
      return tokens;
    }
  
    private computeTF(tokens: string[]): Map<string, number> {
      const tf = new Map<string, number>();
      const totalTokens = tokens.length;
      
      for (const token of tokens) {
        tf.set(token, (tf.get(token) || 0) + 1);
      }
      
      // Normalize
      for (const [token, count] of tf) {
        tf.set(token, count / totalTokens);
      }
      
      return tf;
    }
  
    private updateVocabulary(tokens: string[]) {
      for (const token of tokens) {
        if (!this.vocabulary.has(token)) {
          this.vocabulary.set(token, this.vocabulary.size);
        }
      }
    }
  
    private computeIDF() {
      const N = this.documents.length || 1;
      this.idfScores.clear();
      
      for (const [token, _] of this.vocabulary) {
        let documentCount = 0;
        for (const doc of this.documents) {
          if (doc.toLowerCase().includes(token)) {
            documentCount++;
          }
        }
        
        if (documentCount > 0) {
          this.idfScores.set(token, Math.log(N / documentCount));
        }
      }
    }
  
    private textToVector(text: string): number[] {
      const tokens = this.tokenize(text);
      const tf = this.computeTF(tokens);
      const vector = new Array(this.dimension).fill(0);
      
      // TF-IDF features
      for (const [token, tfScore] of tf) {
        const index = this.vocabulary.get(token);
        const idfScore = this.idfScores.get(token) || 0;
        
        if (index !== undefined && index < this.dimension) {
          vector[index] = tfScore * idfScore;
        } else if (index !== undefined) {
          // Hash to fit within dimension
          const hashedIndex = this.simpleHash(token) % this.dimension;
          vector[Math.abs(hashedIndex)] += tfScore * idfScore;
        }
      }
      
      // Add some semantic features
      this.addSemanticFeatures(text, vector);
      
      // Normalize vector
      const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
      if (magnitude > 0) {
        return vector.map(val => val / magnitude);
      }
      
      return vector;
    }
  
    private addSemanticFeatures(text: string, vector: number[]) {
      const lowerText = text.toLowerCase();
      
      // Language-specific keywords (for code understanding)
      const features = [
        { keywords: ['function', 'def', 'func', 'method'], index: 300 },
        { keywords: ['class', 'struct', 'interface'], index: 301 },
        { keywords: ['import', 'require', 'include', 'from'], index: 302 },
        { keywords: ['export', 'module.exports', 'public'], index: 303 },
        { keywords: ['async', 'await', 'promise', 'then'], index: 304 },
        { keywords: ['return', 'yield'], index: 305 },
        { keywords: ['if', 'else', 'switch', 'case'], index: 306 },
        { keywords: ['for', 'while', 'foreach', 'map'], index: 307 },
        { keywords: ['try', 'catch', 'throw', 'error'], index: 308 },
        { keywords: ['const', 'let', 'var', 'val'], index: 309 },
        { keywords: ['new', 'constructor', 'init'], index: 310 },
        { keywords: ['get', 'set', 'getter', 'setter'], index: 311 },
        { keywords: ['api', 'endpoint', 'route', 'rest'], index: 312 },
        { keywords: ['test', 'spec', 'describe', 'it', 'expect'], index: 313 },
        { keywords: ['database', 'query', 'sql', 'select'], index: 314 }
      ];
      
      for (const feature of features) {
        const count = feature.keywords.filter(kw => lowerText.includes(kw)).length;
        if (count > 0 && feature.index < this.dimension) {
          vector[feature.index] = count / feature.keywords.length;
        }
      }
      
      // Add code structure features
      const structureFeatures = [
        { pattern: /\{[\s\S]*\}/g, index: 320 }, // Blocks
        { pattern: /\([\s\S]*\)/g, index: 321 }, // Parentheses
        { pattern: /\[[\s\S]*\]/g, index: 322 }, // Arrays
        { pattern: /=>/g, index: 323 }, // Arrow functions
        { pattern: /\./g, index: 324 }, // Method calls
        { pattern: /::/g, index: 325 }, // Scope resolution
        { pattern: /->/g, index: 326 }, // Pointer access
      ];
      
      for (const feature of structureFeatures) {
        const matches = text.match(feature.pattern);
        if (matches && feature.index < this.dimension) {
          vector[feature.index] = Math.min(matches.length / 10, 1);
        }
      }
    }
  
    private simpleHash(str: string): number {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      return hash;
    }
  }
  
  // For compatibility - both classes use the same implementation
  export class OpenAIEmbeddingGenerator extends EmbeddingGenerator {
    constructor(apiKey?: string) {
      super();
      // Ignore API key - always use local embeddings
      console.log('Using local embeddings (no API required)');
    }
  }