// src/ui/quickPick.ts

import * as vscode from 'vscode';
import { CodeChunk } from '../types';

export interface CodeChunkQuickPickItem extends vscode.QuickPickItem {
  chunk: CodeChunk;
}

export async function showCodeChunkPicker(
  chunks: CodeChunk[],
  title: string
): Promise<CodeChunk | undefined> {
  const items: CodeChunkQuickPickItem[] = chunks.map(chunk => ({
    label: `$(symbol-${chunk.type}) ${chunk.name}`,
    description: chunk.filepath,
    detail: `Lines ${chunk.startLine}-${chunk.endLine}`,
    chunk
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: title,
    matchOnDescription: true,
    matchOnDetail: true
  });

  return selected?.chunk;
}