// src/types/chromadb.d.ts

declare module 'chromadb' {
    export interface IEmbeddingFunction {
      generate(texts: string[]): Promise<number[][]>;
    }
  
    export interface Collection {
      add(params: {
        ids: string[];
        embeddings?: number[][];
        documents?: string[];
        metadatas?: Record<string, any>[];
      }): Promise<void>;
  
      query(params: {
        queryTexts?: string[];
        queryEmbeddings?: number[][];
        nResults?: number;
      }): Promise<any>;
  
      get(params?: {
        ids?: string[];
      }): Promise<any>;
  
      update(params: {
        ids: string[];
        embeddings?: number[][];
        documents?: string[];
        metadatas?: Record<string, any>[];
      }): Promise<void>;
  
      delete(params: {
        ids: string[];
      }): Promise<void>;
    }
  
    export interface ChromaClient {
      getCollection(params: {
        name: string;
        embeddingFunction?: IEmbeddingFunction;
      }): Promise<Collection>;
  
      createCollection(params: {
        name: string;
        embeddingFunction?: IEmbeddingFunction;
        metadata?: Record<string, any>;
      }): Promise<Collection>;
  
      deleteCollection(params: {
        name: string;
      }): Promise<void>;
    }
  
    export class ChromaClient {
      constructor(params?: { path?: string });
    }
  }