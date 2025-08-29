import z from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

import {
	chunkText,
	DB_PATH,
	getSourceFolder,
	isMcpToolEnabled,
	SqliteEmbedStore,
} from 'mcpland';

import type { ServerResult } from '@modelcontextprotocol/sdk/types.js';

export type JsonSchema = Record<string, any>;

export interface McpSpec {
	name: string;
	description?: string;
}
export interface McpToolSpec {
	/** Tool name - MCP name is added as prefix automatically */
	name: string;
	/** Tool description - give it a short description of what the tool does */
	description: string;
	/** Zod schema for the tool input */
	schema: z.ZodObject<Record<string, z.ZodTypeAny>>;
	/** Source identifier for the tool context to be stored in db */
	sourceId: string;
	/** Owning MCP identifier (folder under src/mcps) */
	mcpId?: string;
	/** Tool identifier (folder under src/mcps/<mcp>/tools) */
	toolId?: string;
	/** URL to fetch context from on tool initialization */
	contextUrl?: string;
	/** Options for chunking the context */
	chunkOptions?: {
		maxChars?: number;
		overlap?: number;
	};
}

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

export abstract class McpLand<ExtendedTool extends McpTool = McpTool> {
	public readonly spec: McpSpec;
	protected readonly tools: ExtendedTool[] = [];

	constructor(spec: McpSpec) {
		this.spec = spec;
	}

	public registerTool(tool: ExtendedTool, discoveredToolId?: string): void {
		if (!tool?.spec) {
			throw new Error('Tool is missing required config');
		}
		if (!tool.spec.name || tool.spec.name.trim().length === 0) {
			throw new Error('Tool is missing required spec.name');
		}
		if (!tool.spec.description || tool.spec.description.trim().length === 0) {
			throw new Error('Tool is missing required spec.description');
		}
		// Compute MCP and tool identifiers if missing
		const mcpId = (tool.spec.mcpId = tool.spec.mcpId || this.spec.name);
		const toolId = (tool.spec.toolId =
			tool.spec.toolId || discoveredToolId || tool.spec.name);

		if (mcpId !== this.spec.name) {
			throw new Error(
				`Tool MCP mismatch: expected ${this.spec.name}, got ${mcpId}`
			);
		}

		// Normalize tool display name and source id
		const baseName = tool.spec.name.trim();
		const expectedPrefix = `${mcpId}-`;
		if (!baseName.startsWith(expectedPrefix)) {
			tool.spec.name = `${mcpId}-${baseName}`;
		}
		if (!tool.spec.sourceId || tool.spec.sourceId.trim().length === 0) {
			tool.spec.sourceId = `${mcpId}-${toolId}-context`;
		}

		if (!isMcpToolEnabled(this.spec.name, toolId)) {
			console.warn(`Skipping disabled tool ${this.spec.name}/${toolId}`);
			return;
		}
		this.tools.push(tool);
	}

	public async init(): Promise<void> {
		await Promise.all(this.tools.map((t) => t.init()));
	}

	public getTools(): McpToolDefinition[] {
		return this.tools.flatMap((t) => t.getTool());
	}
}

export abstract class McpTool {
	public readonly spec: McpToolSpec;
	protected readonly store: SqliteEmbedStore;

	constructor(spec: McpToolSpec) {
		this.spec = spec;
		this.store = new SqliteEmbedStore(DB_PATH);
	}

	// Abstract methods that subclasses must implement
	abstract fetchContext(): Promise<string>;
	abstract handleContext(args: unknown): Promise<ServerResult> | ServerResult;

	// Standardized initialization method
	async init(): Promise<void> {
		const mcpId = this.spec.mcpId ?? 'unknown-mcp';
		const toolId = this.spec.toolId ?? this.spec.name;

		console.warn(`Initializing ${mcpId}/${toolId}...`);

		if (this.spec.mcpId && this.spec.toolId) {
			if (!isMcpToolEnabled(this.spec.mcpId, this.spec.toolId)) {
				console.warn(
					`Tool disabled by config: ${this.spec.mcpId}/${this.spec.toolId}`
				);
				return;
			}
		}

		// Always fetch and attempt ingestion - store will skip duplicate chunks
		const docsText = await this.fetchContext();

		console.warn(
			'Fetched context for',
			this.spec.name,
			'with length',
			docsText.length,
			`${docsText.substring(0, 100)}...`
		);

		const chunks = chunkText(docsText, this.spec.chunkOptions);

		console.warn('Ingesting chunks for', `${mcpId}/${toolId}`, chunks.length);

		// Ensure sourceId is set
		const sourceId = this.spec.sourceId ?? `${mcpId}-${toolId}-context`;
		this.spec.sourceId = sourceId;

		await this.store.ingest(
			{
				id: sourceId,
				meta: {
					name: this.spec.name,
					url: this.spec.contextUrl,
				},
			},
			chunks
		);
	}

	protected getToolPath(): string {
		const sourceFolder = getSourceFolder();
		return `${sourceFolder}/${this.spec.mcpId}/tools/${this.spec.toolId}`;
	}

	// Embedding-based search
	protected async searchContext(query: string, limit = 20) {
		return this.store.search(query, {
			limit,
			sourceId: this.spec.sourceId!,
		});
	}

	public getTool() {
		return {
			name: this.spec.name,
			description: this.spec.description,
			inputSchema: zodToJsonSchema(this.spec.schema),
			handler: this.handleContext,
		};
	}
}
