# Contributing to CodeMemory

Thank you for your interest in contributing to CodeMemory! This document provides guidelines and instructions for contributing.

## 🤝 Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct:
- Be respectful and inclusive
- Welcome newcomers and help them get started
- Focus on constructive criticism
- Respect differing viewpoints and experiences

## 🚀 Getting Started

### Prerequisites

- Node.js 16+ and npm
- VSCode (for testing the extension)
- Git

### Development Setup

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/vikasj2in/codememory-vscode.git
   cd codememory-vscode
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Open in VSCode:
   ```bash
   code .
   ```

4. Run the extension in development:
   - Press `F5` to launch a new VSCode window with the extension loaded
   - Make changes and reload the window to test

## 📝 Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Your Changes

- Follow the existing code style
- Add tests for new functionality
- Update documentation as needed

### 3. Test Your Changes

```bash
# Run unit tests
npm test

# Run linting
npm run lint

# Test the extension manually
# Press F5 in VSCode
```

### 4. Commit Your Changes

Follow conventional commit format:
```
feat: add new parser for Ruby files
fix: resolve memory leak in vector store
docs: update API documentation
chore: upgrade dependencies
```

### 5. Submit a Pull Request

- Push your branch to your fork
- Create a PR against the main branch
- Fill out the PR template
- Wait for review

## 🏗️ Architecture Guidelines

### Adding a New LLM Provider

1. Create a new provider class extending `LLMProvider`:
   ```typescript
   export class YourProvider extends LLMProvider {
     async generateResponse(prompt: string, context?: string): Promise<string> {
       // Implementation
     }
   }
   ```

2. Add to `LLMInterface` constructor switch statement

3. Update configuration schema in `package.json`

4. Add documentation for configuration

### Performance Considerations

- Batch operations when possible
- Use streaming for large files
- Implement proper caching
- Monitor memory usage

## 📋 Testing Guidelines

### Unit Tests

- Test individual components in isolation
- Mock external dependencies
- Aim for >80% coverage

### Integration Tests

- Test component interactions
- Use real file samples
- Test error scenarios

### Manual Testing Checklist

- [ ] Extension activates without errors
- [ ] Indexing completes successfully
- [ ] Commands work as expected
- [ ] Memory persists across sessions
- [ ] Error messages are helpful

## 📚 Documentation

### Code Documentation

- Add JSDoc comments to public APIs
- Include examples in comments
- Document complex algorithms

### User Documentation

- Update README for new features
- Add examples to documentation
- Include screenshots when relevant

## 🐛 Reporting Issues

### Before Submitting

1. Check existing issues
2. Try with latest version
3. Reproduce with minimal setup

### Issue Template

```markdown
**Description**
Clear description of the issue

**Steps to Reproduce**
1. Step one
2. Step two
3. ...

**Expected Behavior**
What should happen

**Actual Behavior**
What actually happens

**Environment**
- VSCode version:
- Extension version:
- OS:
```

## 💡 Feature Requests

We love new ideas! When proposing features:

1. Explain the use case
2. Provide examples
3. Consider implementation complexity
4. Be open to feedback

## 🎯 Priority Areas

Current areas where we especially welcome contributions:

1. **Language Support**
   - Go parser improvements
   - Rust parser
   - Ruby parser
   - PHP parser

2. **Performance**
   - Incremental indexing
   - Parallel processing
   - Memory optimization

3. **Features**
   - Git integration
   - Multi-root workspace support
   - Remote development support

4. **UI/UX**
   - Better visualization
   - Inline suggestions
   - Interactive tutorials

## 📦 Release Process

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create release tag
4. Build and publish to marketplace

## 🙏 Recognition

Contributors will be:
- Added to CONTRIBUTORS.md
- Mentioned in release notes
- Given credit in commits

## 📬 Contact

- GitHub Issues: Bug reports and feature requests
- GitHub Discussions: General questions and ideas
- Email: dev@codememory.dev

---

# Additional Files

## .eslintrc.json
```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2020,
    "sourceType": "module"
  },
  "plugins": [
    "@typescript-eslint"
  ],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/naming-convention": "warn",
    "@typescript-eslint/semi": "warn",
    "curly": "warn",
    "eqeqeq": "warn",
    "no-throw-literal": "warn",
    "semi": "off"
  }
}
```

## CHANGELOG.md
```markdown
# Changelog

All notable changes to the CodeMemory extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1] - 2025-06-03

### Added
- Initial release
- Basic code indexing for TypeScript, JavaScript, Python, and Java
- Vector-based semantic search
- Integration with OpenAI and Anthropic
- Persistent memory across sessions
- VSCode UI integration
- Basic commands for code exploration

### Known Issues
- Large repositories may take significant time to index
- Some language constructs may not be parsed correctly
```

## [0.0.2] - 2025-06-05
### Added
- Advanced architectural understanding
- Automated refactoring suggestions

## LICENSE
```
MIT License

Copyright (c) 2024 CodeMemory Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## .github/workflows/ci.yml
```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [16.x, 18.x]
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Use Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linter
      run: npm run lint
    
    - name: Run tests
      run: npm test
    
    - name: Build extension
      run: npm run compile
```anguage Parser

1. Create a new parser class extending `LanguageParser`:
   ```typescript
   class RubyParser extends LanguageParser {
     async parse(document: vscode.TextDocument): Promise<CodeChunk[]> {
       // Implementation
     }
   }
   ```

2. Register in `CodeParser.initializeParsers()`

3. Add file extension to default settings

4. Add tests for the parser