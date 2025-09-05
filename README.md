# MCPLand

[![Tests](./assets/test.svg)](https://github.com/stewones/mcpland/tree/main/test/src)
[![Coverage](./assets/coverage.svg)](https://app.codecov.io/github/stewones/mcpland)
[![NPM Version](https://img.shields.io/npm/v/mcpland)](https://www.npmjs.com/package/mcpland)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://github.com/stewones/mcpland/blob/main/LICENSE)

MCPLand is a TypeScript framework for building and managing **Model Context Protocol (MCP) tools** with embedded context search capabilities. It provides a unified platform for creating AI-powered tools that can fetch, process, and search contextual information from various sources.

## Content

- [Installation](#installation)
- [Usage](#usage)
  - [Quick Start](#quick-start)
  - [Commands](#commands)
    - [`mcp init`](#mcp-init)
    - [`mcp new`](#mcp-new)
    - [`mcp serve`](#mcp-serve)
    - [`mcp link`](#mcp-link)
  - [Global Options](#global-options)
- [Available MCPs](#available-mcps)
- [Architecture](#architecture)
  - [Data Flow](#data-flow)
  - [Technical Features](#technical-features)
    - [Embedding-Powered Search](#embedding-powered-search)
    - [Plugin Architecture](#plugin-architecture)
    - [Production Ready](#production-ready)
  - [MCP Creation](#mcp-creation)
  - [Integration Points](#integration-points)
- [Roadmap](#roadmap)
- [License](#license)


# Installation

```bash
bun install -g mcpland
```

# Usage

## Quick Start

```bash
# Initialize a new MCP project
mcp init

# Scaffold a new MCP (inside the project)
mcp new my-mcp

# Link with Cursor IDE (stdio mode)
mcp link cursor

# Or link with Cursor IDE (SSE mode)
mcp link cursor --sse

# Start SSE server (required for SSE mode)
mcp serve
```

## Commands

### `mcp init`

Initialize a new MCP project with interactive setup.

**Usage:**
```bash
mcp init
```

**What it does:**
- Creates a new project directory (if needed)
- Sets up `package.json` with mcpland dependency
- Creates `mcpland.json` configuration file
- Downloads and installs selected MCP tools
- Sets up environment variables
- Configures `.gitignore` and `.env` files
- Installs dependencies automatically

**Interactive prompts:**
- Project name (if no package.json exists)
- Source directory for MCPs (default: `src/mcps`)
- OpenAI API key
- Selection of available MCP tools from registry

### `mcp new`

Scaffold a new MCP from the [base template](https://github.com/stewones/mcpland/tree/main/src/mcps/_).

**Usage:**
```bash
mcp new [name]
```

**Arguments:**
- `name` - Optional MCP name. If omitted, it will be asked for.

**What it does:**
- Creates `src/mcps/<name>/index.ts`
- Creates an initial tool at `src/mcps/<name>/tools/<tool>/index.ts`
- Prints next steps to edit your MCP and add more tools.

**Interactive prompts:**
- MCP name (if not provided as an argument)
- MCP description
- Initial tool name (e.g., `docs`)
- Tool description

**Examples:**
```bash
mcp new                    # Fully interactive
mcp new my-mcp             # Skips name prompt, asks for the rest
```

**Notes:**
- Run this command inside your project root (where `mcpland.json` lives). If `mcp init` created a new folder, `cd` into it first.

### `mcp serve`

Start the MCPLand SSE (Server-Sent Events) server.

**Usage:**
```bash
mcp serve [options]
```

**Options:**
- `--port, -p <number>` - Port to run the SSE server on (default: 1337)

**Examples:**
```bash
mcp serve                    # Start server on default port 1337
mcp serve --port 3000        # Start server on port 3000
mcp serve -p 8080            # Start server on port 8080 (short form)
```

**Note:** This command is required when using SSE transport mode with Cursor.

### `mcp link`

Configure Cursor IDE integration.

**Usage:**
```bash
mcp link [options]
```

**Aliases:**
- `mcp link:cursor`
- `mcp cursor`

**Options:**
- `--sse` - Use SSE transport instead of stdio (default: false)

**Examples:**
```bash
mcp link cursor             # Configure stdio mode (default)
mcp link cursor --sse       # Configure SSE mode
mcp cursor --sse            # Alternative syntax
```

**What it does:**
- Creates `.cursor/mcp.json` configuration file
- Sets up MCP server connection for Cursor IDE
- Configures environment variables (stdio mode)
- Sets up SSE endpoint URL (SSE mode)

**Transport Modes:**
- **stdio mode** (default): Direct process communication, automatically managed by Cursor
- **SSE mode**: HTTP-based communication, requires running `mcp serve` separately

## Global Options

```bash
mcp --version, -v           # Show version number
mcp --help, -h              # Show all commands and global help
mcp <command> --help        # Show help for specific command
```

**Examples:**
```bash
mcp --help                  # Show general help and command list
mcp init --help             # Show help for init command
mcp new --help              # Show help for new command
mcp serve --help            # Show help for serve command
mcp link --help             # Show help for link command
```

# Available MCPs

MCPLand comes with built-in MCPs that you can use out of the box. These are automatically available during project initialization.

## Angular MCP

**Source:** [`src/mcps/angular/index.ts`](src/mcps/angular/index.ts)

The Angular MCP provides access to Angular's official documentation and context for AI-powered development assistance.

**Tools:**
- **`angular-docs`** - Search through Angular's comprehensive documentation
  - **Context Source:** [Angular LLM Context](https://angular.dev/context/llm-files/llms-full.txt)
  - **Capabilities:** Semantic search through Angular docs, guides, API references, and best practices
  - **Usage:** Ask questions about Angular components, directives, services, routing, forms, and more

**Example queries:**
- "What is modern Angular?"
- "How do I create a reactive form in Angular?"
- "What's the difference between ViewChild and ContentChild?"
- "Show me how to implement lazy loading for routes"
- "How to handle HTTP errors in Angular?"

# Architecture

![architecture](./assets/architecture.svg)

## Data Flow

1. 📥 Context Ingestion
   `External Source → Fetcher → Chunker → Embedder → SQLite Store`

2. 🔍 Query Processing  
   `LLM Query → MCP Server → Tool Handler → Vector Search → Ranked Results`

3. 📤 Response Generation
   `Search Results → Context Assembly → MCP Response → LLM Client`


## Technical Features

### Embedding-Powered Search
- **Semantic search** capabilities beyond keyword matching
- **Relevance scoring** with configurable limits
- **Source isolation** for multi-context environments

### Plugin Architecture
- **Auto-discovery** of MCP implementations
- **Tool registration** with validation
- **Modular design** for easy extension

### Production Ready
- **Comprehensive testing** with Vitest
- **Type safety** throughout with TypeScript
- **Error handling** and logging


## MCP Creation
```typescript
// Create new MCP in src/mcps/your-mcp/
class YourMCP extends MCPLand {
  constructor() {
    super({ name: 'your-mcp', description: 'Your description' });
  }
}

// Create tools in src/mcps/your-mcp/tools/
class YourTool extends McpTool {
  async fetchContext(): Promise<string> {
    // Fetch your context
  }
  
  async handleContext(args: unknown): Promise<ServerResult> {
    // Handle search queries
  }
}
```

## Integration Points
- **Cursor IDE integration** via link command
- **Multiple LLM clients** via MCP protocol
- **External APIs** and local files as context sources
- **Custom embedding models** and search algorithms

# Roadmap

- [x] Add ability to serve SSE requests
- [ ] Add ability to schedule context updates
- [ ] Add ability to link with cursor globally
- [x] Add ability to scaffold new mcps

# License

MIT
