# CodeMemory User Guide

Welcome to CodeMemory - your AI-powered code understanding assistant with persistent memory. This guide will help you get the most out of CodeMemory's features.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Initial Setup](#initial-setup)
3. [Core Features](#core-features)
4. [Advanced Features](#advanced-features)
5. [Commands Reference](#commands-reference)
6. [Configuration Options](#configuration-options)
7. [Tips and Best Practices](#tips-and-best-practices)
8. [Troubleshooting](#troubleshooting)
9. [FAQ](#faq)

## Getting Started

### Installation

1. **From VS Code Marketplace** (Recommended):
   - Open VS Code
   - Go to Extensions (Cmd/Ctrl + Shift + X)
   - Search for "CodeMemory"
   - Click Install

2. **From VSIX file**:
   ```bash
   code --install-extension codememory-0.0.1.vsix
   ```

### System Requirements

- VS Code version 1.74.0 or higher
- Node.js 16+ (for development only)
- At least 500MB free disk space for vector storage
- OpenAI or Anthropic API key (for AI features)

## Initial Setup

### Step 1: Open a Workspace

CodeMemory requires an open workspace to function:
- File → Open Folder
- Select your project directory

### Step 2: Configure API Key

To enable AI-powered features:

1. Open Settings (Cmd/Ctrl + ,)
2. Search for "codememory"
3. Enter your API key:
   - **For OpenAI**: Add your OpenAI API key
   - **For Anthropic**: Add your Anthropic API key
4. Select your preferred provider in "LLM Provider"

### Step 3: Initial Indexing

CodeMemory will automatically start indexing your codebase if auto-indexing is enabled. You'll see progress in the status bar.

For manual indexing:
- Command Palette (Cmd/Ctrl + Shift + P)
- Run "CodeMemory: Index Current Workspace"

## Core Features

### 1. 🔍 Semantic Code Search

Find related code based on meaning, not just keywords.

**How to use:**
1. Select any code snippet or function
2. Run "CodeMemory: Find Related Code"
3. Browse results ranked by relevance
4. Click to navigate to any result

**Example use cases:**
- Find all authentication-related code
- Locate similar implementations
- Discover usage patterns

### 2. 💡 Code Explanation

Get AI-powered explanations of complex code sections.

**How to use:**
1. Select the code you want explained
2. Run "CodeMemory: Explain Selected Code"
3. View detailed explanation including:
   - Summary of functionality
   - Purpose and responsibilities
   - Dependencies
   - Side effects
   - Improvement suggestions

**Best for:**
- Understanding legacy code
- Onboarding new team members
- Code review preparation

### 3. ❓ Ask Questions

Ask natural language questions about your codebase.

**How to use:**
1. Run "CodeMemory: Ask Question About Codebase"
2. Type your question
3. Get contextual answers based on your actual code

**Example questions:**
- "How does user authentication work?"
- "What API endpoints are available?"
- "Where is the payment processing logic?"
- "How is error handling implemented?"

### 4. 📊 Memory Status

View indexing statistics and memory usage.

**How to use:**
1. Run "CodeMemory: Show Memory Status"
2. See:
   - Total chunks indexed
   - Language distribution
   - Code type breakdown

### 5. 🔄 Automatic Updates

CodeMemory automatically updates its index when you:
- Create new files
- Modify existing code
- Delete files

No manual re-indexing needed!

## Advanced Features

### 1. 🏗️ Architecture Analysis

Analyze your codebase architecture and detect patterns.

**How to use:**
1. Run "CodeMemory: Analyze Architecture"
2. Review the comprehensive report including:
   - Detected patterns (MVC, Repository, Service Layer, etc.)
   - Architecture metrics
   - Layer violations
   - Improvement suggestions

**Metrics explained:**
- **Cohesion**: How well-organized related code is (higher is better)
- **Complexity**: Average cyclomatic complexity (lower is better)
- **Dependencies**: Average number of dependencies per file

### 2. 🔧 Refactoring Suggestions

Get intelligent refactoring recommendations.

**How to use:**

**For selected code:**
1. Select code in the editor
2. Run "CodeMemory: Suggest Refactoring"
3. Review suggestions for that specific code

**For entire codebase:**
1. Run "CodeMemory: Suggest Refactoring" with no selection
2. Get project-wide refactoring opportunities

**Types of suggestions:**
- Long method detection
- Duplicate code identification
- Complex conditional simplification
- Dead code removal
- Poor naming improvements
- Parameter object opportunities

### 3. 📈 Code Quality Report

Get a comprehensive quality assessment.

**How to use:**
1. Run "CodeMemory: Analyze Code Quality"
2. Review your quality score (0-100)
3. See breakdown by:
   - Architecture Score
   - Code Health Score
   - Maintainability Score

**Score interpretation:**
- 90-100: Excellent quality
- 75-89: Good quality
- 60-74: Fair quality
- Below 60: Needs improvement

## Commands Reference

| Command | Description | Keyboard Shortcut |
|---------|-------------|-------------------|
| `CodeMemory: Index Current Workspace` | Manually trigger workspace indexing | - |
| `CodeMemory: Explain Selected Code` | Get AI explanation of selected code | - |
| `CodeMemory: Find Related Code` | Find semantically similar code | - |
| `CodeMemory: Ask Question About Codebase` | Ask questions in natural language | - |
| `CodeMemory: Show Memory Status` | View indexing statistics | - |
| `CodeMemory: Analyze Architecture` | Analyze codebase architecture | - |
| `CodeMemory: Suggest Refactoring` | Get refactoring suggestions | - |
| `CodeMemory: Analyze Code Quality` | Generate quality report | - |

Access all commands via Command Palette (Cmd/Ctrl + Shift + P).

## Configuration Options

Access settings: Code → Preferences → Settings → Search "codememory"

| Setting | Description | Default |
|---------|-------------|---------|
| `codememory.llmProvider` | AI provider (openai/anthropic) | openai |
| `codememory.apiKey` | Your API key | - |
| `codememory.autoIndex` | Auto-index on startup | true |
| `codememory.indexFileTypes` | File extensions to index | [".ts", ".js", ".py", ".java", ".cpp", ".go", ".rs"] |
| `codememory.llmModel` | Specific model to use | Provider default |
| `codememory.llmTemperature` | AI response creativity (0-1) | 0.3 |
| `codememory.llmMaxTokens` | Max response length | 2000 |

## Tips and Best Practices

### 1. Optimize Indexing

- **Exclude unnecessary files**: Add large generated files or dependencies to `.gitignore`
- **Focus on relevant languages**: Adjust `indexFileTypes` to match your project
- **Regular cleanup**: Run re-indexing after major refactoring

### 2. Better AI Responses

- **Be specific**: "How does the UserService authenticate users?" vs "How does auth work?"
- **Provide context**: Select relevant code before asking questions
- **Iterate**: Ask follow-up questions for deeper understanding

### 3. Effective Code Search

- **Use descriptive queries**: "database connection pooling" vs "db"
- **Think conceptually**: Search for what the code does, not exact names
- **Combine with navigation**: Use results as starting points for exploration

### 4. Architecture Best Practices

- **Regular analysis**: Run architecture analysis weekly/monthly
- **Track improvements**: Save reports to track progress
- **Focus on violations**: Address layer violations first

### 5. Refactoring Workflow

1. Start with high-priority suggestions
2. Make one change at a time
3. Run tests after each refactoring
4. Re-analyze to verify improvements

## Troubleshooting

### Extension Not Activating

**Problem**: CodeMemory commands not available

**Solutions**:
- Ensure you have an open workspace
- Check VS Code version (≥1.74.0)
- Look for errors in Output → CodeMemory

### Indexing Issues

**Problem**: Indexing fails or takes too long

**Solutions**:
- Check available disk space
- Exclude large files/directories
- Reduce number of file types indexed
- Try manual indexing with smaller file set

### AI Features Not Working

**Problem**: "LLM not configured" error

**Solutions**:
1. Verify API key is set correctly
2. Check API key permissions/credits
3. Ensure internet connection
4. Try switching providers

### Memory/Performance Issues

**Problem**: VS Code becomes slow

**Solutions**:
- Clear index: Delete `.codememory` folder
- Reduce indexed file types
- Disable auto-indexing for large projects
- Close unused webview panels

### Search Not Finding Expected Results

**Problem**: Relevant code not appearing in search

**Solutions**:
- Ensure files are indexed (check status)
- Try different query terms
- Verify file type is in `indexFileTypes`
- Re-index the workspace

## FAQ

### Q: Is my code sent to the cloud?

**A**: Only when using AI features (explanation, questions). The vector index is stored locally. You can use search features completely offline.

### Q: How much disk space does CodeMemory use?

**A**: Typically 50-200MB for medium projects. The `.codememory` folder in your workspace contains all data.

### Q: Can I use CodeMemory without an API key?

**A**: Yes! Code search and basic analysis work offline. Only AI-powered explanations and questions require an API key.

### Q: Does CodeMemory work with all programming languages?

**A**: CodeMemory has optimized parsers for TypeScript, JavaScript, Python, and Java. Other languages are supported with basic parsing.

### Q: How often should I re-index?

**A**: CodeMemory auto-updates its index. Manual re-indexing is only needed after major structural changes or if you suspect index corruption.

### Q: Can I share my index with team members?

**A**: The `.codememory` folder can be shared, but it's better for each developer to build their own index for optimal performance.

### Q: What's the difference between OpenAI and Anthropic providers?

**A**: Both offer similar capabilities. OpenAI typically has faster response times, while Anthropic (Claude) often provides more detailed explanations.

### Q: How can I improve the quality of AI responses?

**A**: 
1. Ensure your code has good comments/documentation
2. Use descriptive variable/function names
3. Select relevant context before asking questions
4. Be specific in your queries

### Q: Is CodeMemory open source?

**A**: Yes! Contribute at [github.com/vikasj2in/codememory-vscode](https://github.com/vikasj2in/codememory-vscode)

## Support

- **Issues**: [GitHub Issues](https://github.com/vikasj2in/codememory-vscode/issues)
- **Discussions**: [GitHub Discussions](https://github.com/vikasj2in/codememory-vscode/discussions)
- **Updates**: Follow the repository for new features

---

Happy coding with CodeMemory! 🚀