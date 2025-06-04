// src/ui/statusBar.ts

import * as vscode from 'vscode';
import { IndexingProgress } from '../types';

export class StatusBarManager implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private isLoading: boolean = false;
  private loadingInterval?: NodeJS.Timeout;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'codememory.showMemoryStatus';
    this.statusBarItem.tooltip = 'CodeMemory Status';
    this.updateDisplay();
    this.statusBarItem.show();
  }

  setLoading(loading: boolean, message?: string) {
    this.isLoading = loading;
    
    if (loading) {
      if (this.loadingInterval) {
        clearInterval(this.loadingInterval);
      }
      
      let frame = 0;
      const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      
      this.loadingInterval = setInterval(() => {
        this.statusBarItem.text = `${frames[frame]} CodeMemory: ${message || 'Processing...'}`;
        frame = (frame + 1) % frames.length;
      }, 100);
    } else {
      if (this.loadingInterval) {
        clearInterval(this.loadingInterval);
        this.loadingInterval = undefined;
      }
      this.updateDisplay();
    }
  }

  updateIndexingStatus(progress: IndexingProgress) {
    if (progress.status === 'indexing') {
      const percentage = Math.round((progress.processedFiles / progress.totalFiles) * 100);
      this.statusBarItem.text = `$(sync~spin) CodeMemory: Indexing ${percentage}%`;
      this.statusBarItem.tooltip = `Indexing ${progress.currentFile}`;
    } else if (progress.status === 'completed') {
      this.statusBarItem.text = `$(check) CodeMemory: Ready`;
      this.statusBarItem.tooltip = `Indexed ${progress.processedFiles} files`;
    } else if (progress.status === 'error') {
      this.statusBarItem.text = `$(error) CodeMemory: Error`;
      this.statusBarItem.tooltip = `Errors: ${progress.errors.join(', ')}`;
    } else {
      this.updateDisplay();
    }
  }

  private updateDisplay() {
    if (!this.isLoading) {
      this.statusBarItem.text = '$(database) CodeMemory';
    }
  }

  dispose() {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
    }
    this.statusBarItem.dispose();
  }
}