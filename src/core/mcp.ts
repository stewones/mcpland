import z from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	chunkText,
	DB_PATH,
	fetchWithRetry,
	getSourceFolder,
	isMcpToolEnabled,
	SqliteEmbedStore,
} from 'mcpland';

import type { ServerResult } from '@modelcontextprotocol/sdk/types.js';

import { log } from '../lib/log';

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
	sourceId?: string;
	/** Owning MCP identifier (folder under src/mcps) */
	mcpId?: string;
	/** Tool identifier (folder under src/mcps/<mcp>/tools) */
	toolId?: string;
	/** URL to fetch context from on tool initialization */
	contextUrl?: string;
	/** File pathname relative to the tool directory to fetch context from on tool initialization */
	contextFile?: string;
	/** Directory relative to the tool directory to recursively read text documents for ingestion */
	contextDir?: string;
	/** Prompt to inject in the tool response - useful for additional context */
	prompt?: string;
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

	public registerTool(mcpName: string, tool: ExtendedTool): void {
		if (!tool?.spec) {
			throw new Error('Tool is missing required config');
		}
		if (!tool.spec.name || tool.spec.name.trim().length === 0) {
			throw new Error('Tool is missing required spec.name');
		}
		if (!tool.spec.description || tool.spec.description.trim().length === 0) {
			throw new Error('Tool is missing required spec.description');
		}

		const mcpId = tool.spec.mcpId ?? mcpName;
		const toolId = tool.spec.toolId ?? tool.spec.name;

		tool.spec.toolId = tool.spec.toolId ?? toolId;
		tool.spec.mcpId = tool.spec.mcpId ?? mcpId;

		tool.spec.name = `${mcpId}-${toolId}`;

		tool.spec.sourceId = tool.spec.sourceId ?? `${mcpId}-${toolId}-context`;

		if (!isMcpToolEnabled(mcpId, toolId!)) {
			log.message(`Skipping disabled tool ${mcpId}/${toolId}`);
			return;
		}

		this.tools.push(tool);
	}

	public async init(): Promise<void> {
		await Promise.allSettled(this.tools.map((t) => t.init()));
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

	// Abstract methods that subclasses must implement if not using built-in options
	abstract fetchContext(): Promise<string>;
	abstract handleContext(args: unknown): Promise<ServerResult> | ServerResult;

	// Standardized initialization method
	async init(): Promise<void> {
		const mcpId = this.spec.mcpId!;
		const toolId = this.spec.toolId!;

		log.step(`Initializing ${mcpId}/${toolId}...`);

		if (this.spec.mcpId && this.spec.toolId) {
			if (!isMcpToolEnabled(this.spec.mcpId, this.spec.toolId)) {
				log.warn(
					`Tool disabled by config: ${this.spec.mcpId}/${this.spec.toolId}`
				);
				return;
			}
		}

		// Always fetch and attempt ingestion - store will skip duplicate chunks
		const docsText = await this.fetchContext();

		log.message(
			`Fetched context for ${this.spec.name} with length ${docsText.length} `
		);
		log.message(`Preview: ${docsText.substring(0, 100)}...`);

		const chunks = chunkText(docsText, this.spec.chunkOptions);

		log.message(`Ingesting ${chunks.length} chunks for ${mcpId}/${toolId}`);

		// Ensure sourceId is set
		const sourceId = this.spec.sourceId!;
		await this.store.ingest(
			{
				id: sourceId,
				meta: {
					name: this.spec.name,
					url: this.spec.contextUrl,
					file: this.spec.contextFile,
					dir: this.spec.contextDir,
				},
			},
			chunks,
			{
				mcpId,
				toolId,
			}
		);
	}

	protected getToolPath(): string {
		const sourceFolder = getSourceFolder();
		return `${sourceFolder}/${this.spec.mcpId}/tools/${this.spec.toolId}`;
	}

	protected async fetchFromUrl(): Promise<string> {
		const res = await fetchWithRetry(this.spec.contextUrl!);
		return res.text();
	}

	protected async fetchFromFile(): Promise<string> {
		const fileText = readFileSync(
			dirname(fileURLToPath(import.meta.url)) + '/' + this.spec.contextFile!,
			'utf-8'
		);
		return fileText;
	}

	/**
	 * Check if a file is likely binary by examining its content
	 */
	private async isBinaryFile(
		filePath: string,
		readFileSync: any
	): Promise<boolean> {
		try {
			// Read first 8KB to check for binary content
			const buffer = readFileSync(filePath, { encoding: null, flag: 'r' });
			const chunk = buffer.subarray(0, Math.min(8192, buffer.length));

			// Check for null bytes (common in binary files)
			if (chunk.indexOf(0) !== -1) {
				return true;
			}

			// Check ratio of non-printable characters
			let nonPrintableCount = 0;
			for (let i = 0; i < chunk.length; i++) {
				const byte = chunk[i];
				// Consider bytes outside printable ASCII range (excluding common whitespace)
				/* c8 ignore start */
				if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
					nonPrintableCount++;
				} else if (byte > 126) {
					nonPrintableCount++;
				}
				/* c8 ignore stop */
			}

			// If more than 30% of characters are non-printable, consider it binary
			const nonPrintableRatio = nonPrintableCount / chunk.length;
			return nonPrintableRatio > 0.3;
		} catch {
			// If we can't read the file, assume it's binary to be safe
			return true;
		}
	}

	protected async fetchFromDirectory(): Promise<string> {
		// Build context from contextDir (recursive text files) when provided
		let docsText: string = '';
		if (this.spec.contextDir?.trim()) {
			const baseDir = this.getToolPath();
			const dirToRead = `${baseDir}/${this.spec.contextDir}`;
			const { readdirSync, statSync, readFileSync } = await import('node:fs');
			const pathMod = await import('node:path');

			const files: string[] = [];
			const walk = async (dir: string) => {
				let entries: string[] = [];
				try {
					entries = readdirSync(dir);
				} catch {
					return;
				}
				for (const entry of entries) {
					const full = pathMod.join(dir, entry);
					try {
						const st = statSync(full);
						if (st.isDirectory()) {
							await walk(full);
						} else if (st.isFile()) {
							// Skip files that are likely binary
							const isBinary = await this.isBinaryFile(full, readFileSync);
							if (!isBinary) {
								files.push(full);
							}
						}
						// eslint-disable-next-line no-empty
					} catch {}
				}
			};
			await walk(dirToRead);
			const pieces: string[] = [];
			for (const f of files) {
				try {
					const rel = pathMod.relative(dirToRead, f);
					const content = readFileSync(f, 'utf-8');
					pieces.push(`=== ${rel} ===\n\n${content}`);
				} /* c8 ignore next - file might be binary despite our check */ catch {}
			}
			docsText = pieces.join('\n\n');
		}

		return docsText;
	}

	public async fetchAvailableContext(): Promise<string> {
		let finalContext = '';

		if (this.spec.contextUrl) {
			finalContext += await this.fetchFromUrl();
		}

		if (this.spec.contextFile) {
			finalContext += await this.fetchFromFile();
		}

		if (this.spec.contextDir) {
			finalContext += await this.fetchFromDirectory();
		}

		return finalContext;
	}

	public async handleAvailableContext(args: unknown): Promise<ServerResult> {
		const parsed = this.spec.schema.safeParse(args);

		if (!parsed.success) {
			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify({
							error: 'Invalid arguments',
							details: parsed.error.errors,
						}),
					},
				],
			};
		}

		const { query, limit } = parsed.data;
		const results = await this.searchContext(query, limit);

		if (results.length === 0) {
			return {
				content: [
					{
						type: 'text',
						text: 'No relevant context found.',
					},
				],
			};
		}

		const payload = results
			.map(
				(r, i) =>
					`[[Chunk ${i + 1} | score=${r.score.toFixed(3)}]]\n${r.content}`
			)
			.join('\n\n');

		const serverResult: ServerResult = {
			content: [
				{
					type: 'text',
					text: payload,
				},
			],
		};

		if (this.spec.prompt) {
			serverResult.content.push({
				type: 'text',
				text: this.spec.prompt,
			});
		}

		return serverResult;
	}

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
			handler: this.handleContext.bind(this),
		};
	}
}
