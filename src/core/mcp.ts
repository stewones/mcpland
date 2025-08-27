import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio';

import { resolve } from 'node:path';

import { chunkText, startMcpServer } from 'mcpland/lib';

import type { ServerResult } from '@modelcontextprotocol/sdk/types.js';

import { DEFAULT_DB_PATH, SqliteEmbedStore } from '../store';

export interface ToolConfig {
	name: string;
	description: string;
	sourceId: string;
	contextUrl?: string;
	chunkOptions?: {
		maxChars?: number;
		overlap?: number;
	};
}

export type JsonSchema = Record<string, any>;

export interface McpToolDefinition {
	name: string;
	description: string;
	inputSchema: JsonSchema;
	handler: (args: unknown) => Promise<ServerResult> | ServerResult;
}

export interface McpServerConfig {
	name: string;
	version?: string;
	description?: string;
}

export abstract class MCPLandTool {
	public config: ToolConfig;
	protected store: SqliteEmbedStore;

	constructor(config: ToolConfig) {
		this.config = config;
		this.store = new SqliteEmbedStore(DEFAULT_DB_PATH);
	}

	// Abstract methods that subclasses must implement
	abstract getTools(): McpToolDefinition[];
	abstract fetchContext(): Promise<string>;

	// Standardized initialization method
	async init(): Promise<void> {
		console.warn(`Initializing ${this.config.name}...`);

		// Always fetch and attempt ingestion - store will skip duplicate chunks
		const docsText = await this.fetchContext();

		console.warn(
			'Fetched context for',
			this.config.name,
			'with length',
			docsText.length,
			`${docsText.substring(0, 100)}...`
		);

		const chunks = chunkText(docsText, this.config.chunkOptions);

		console.warn('Ingesting chunks for', this.config.name, chunks.length);

		await this.store.ingest(
			{
				id: this.config.sourceId,
				meta: {
					name: this.config.name,
					url: this.config.contextUrl,
				},
			},
			chunks
		);
	}

	// Generate MCP transport for this tool
	getTransport(): Experimental_StdioMCPTransport {
		const scriptPath = resolve(
			process.cwd(),
			`src/tools/${this.getToolPath()}/server.ts`
		);
		return new Experimental_StdioMCPTransport({
			command: 'bun',
			args: [scriptPath],
		});
	}

	// Start MCP server for this tool
	async startMcpServer() {
		return startMcpServer(
			{
				name: this.config.name,
				description: this.config.description,
			},
			this.getTools()
		);
	}

	// Subclasses can override this to customize the script path
	protected getToolPath(): string {
		return this.config.name.replace('-mcp', '').toLowerCase();
	}

	// Helper method for embedding-based search
	protected async searchContext(query: string, limit = 20) {
		return this.store.search(query, {
			limit,
			sourceId: this.config.sourceId,
		});
	}
}
