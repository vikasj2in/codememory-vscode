# CodeMemory - AI-Powered Code Understanding with Persistent Memory

CodeMemory is a VSCode extension that gives your code editor a long-term memory. It understands your entire codebase, remembers past interactions, and provides intelligent assistance that gets better over time.

## 🚀 Features

### 1. **Persistent Code Memory**
- Indexes your entire codebase into a local vector database
- Maintains context across sessions
- Learns from your interactions

### 2. **Intelligent Code Understanding**
- Semantic search across your codebase
- Understands relationships between functions, classes, and modules
- Tracks dependencies and usage patterns

### 3. **Context-Aware Assistance**
- Answer questions about your codebase
- Explain complex code sections
- Find related code automatically
- Suggest improvements based on your patterns

### 4. **Privacy-First Design**
- All processing happens locally by default
- Your code never leaves your machine without explicit permission
- Optional cloud features with full control

## 📦 Installation

1. Install from VSCode Marketplace: Search for "CodeMemory"
2. Or install manually:
   ```bash
   code --install-extension codememory-0.0.1.vsix
   ```

## 🛠️ Setup

### Quick Start

1. Open a project in VSCode
2. CodeMemory will automatically start indexing (if auto-index is enabled)
3. Configure your preferred LLM provider in settings

### Configuration

Open VSCode settings and search for "CodeMemory":

```json
{
  // LLM Provider settings
  "codememory.llmProvider": "openai", // or "anthropic"
  "codememory.apiKey": "your-api-key-here",
  
  // Indexing settings
  "codememory.autoIndex": true,
  "codememory.indexFileTypes": [
    ".ts", ".js", ".py", ".java", ".cpp", ".go", ".rs"
  ],
  
  // Storage settings
  "codememory.localStoragePath": "", // defaults to workspace/.codememory
}
```

## 💡 Usage

### Commands

Access these commands via Command Palette (Cmd/Ctrl + Shift + P):

- **`CodeMemory: Index Current Workspace`** - Manually trigger indexing
- **`CodeMemory: Explain Selected Code`** - Get AI explanation of selected code
- **`CodeMemory: Find Related Code`** - Find similar or related code sections
- **`CodeMemory: Ask Question About Codebase`** - Ask any question about your code
- **`CodeMemory: Show Memory Status`** - View indexing statistics

### Example Queries

- "How does the authentication system work?"
- "Show me all API endpoints"
- "What does the UserService class do?"
- "Find all database queries"
- "How is error handling implemented?"

## 🏗️ Architecture

### Core Components

1. **Code Parser**: Language-specific parsers extract semantic information
2. **Vector Store**: ChromaDB stores embeddings locally
3. **Context Manager**: Manages retrieval and memory
4. **LLM Interface**: Integrates with OpenAI/Anthropic

### How It Works

1. **Indexing Phase**:
   - Parses code files into semantic chunks
   - Generates embeddings for each chunk
   - Stores in local vector database

2. **Query Phase**:
   - Converts queries to embeddings
   - Retrieves relevant code chunks
   - Provides context to LLM for response

3. **Learning Phase**:
   - Tracks successful queries
   - Updates relevance scores
   - Improves over time

## 🔧 Development

### Building from Source

```bash
# Clone repository
git clone https://github.com/vikasj2in/codememory-vscode
cd codememory-vscode

# Install dependencies
npm install

# Compile
npm run compile

# Run tests
npm test

# Package extension
vsce package
```

### Project Structure

```
codememory-vscode/
├── src/
│   ├── core/           # Core extension logic
│   ├── indexer/        # Code parsing and indexing
│   ├── vectorstore/    # Vector database integration
│   ├── context/        # Context management
│   ├── llm/            # LLM integrations
│   ├── ui/             # UI components
│   └── extension.ts    # Main entry point
├── test/               # Test suite
├── resources/          # Icons and assets
└── package.json        # Extension manifest
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Areas for Contribution

- Language parser improvements
- Additional LLM provider integrations
- Performance optimizations
- UI/UX enhancements
- Documentation improvements

## 📝 Roadmap

### Phase 1 (Current)
- ✅ Basic indexing and retrieval
- ✅ LLM integration
- ✅ Simple UI

### Phase 2
- 🔄 Incremental indexing
- 🔄 Multi-repository support
- 🔄 Team knowledge sharing

### Phase 3
- 📋 Advanced architectural understanding
- 📋 Automated refactoring suggestions
- 📋 Integration with CI/CD

## 🐛 Known Issues

- Large repositories (>10k files) may take time to index initially
- Some exotic language constructs might not be parsed correctly
- Memory usage scales with codebase size

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [LangChain](https://langchain.com/)
- Vector storage by [ChromaDB](https://www.trychroma.com/)
- Embeddings by [Transformers.js](https://xenova.github.io/transformers.js/)

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/vikasj2in/codememory-vscode/issues)
- **Discussions**: [GitHub Discussions](https://github.com/vikasj2in/codememory-vscode/discussions)
- **Email**: codememory-support@cloudivian.com

---

Made with ❤️ by developers, for developers.