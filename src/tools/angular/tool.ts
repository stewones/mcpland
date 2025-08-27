import z from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { McpToolDefinition } from 'mcpland/core';
import { MCPLandTool } from 'mcpland/core';
import { fetchWithRetry } from 'mcpland/lib';

import type { ServerResult } from '@modelcontextprotocol/sdk/types.js';

const DEFAULT_CONTEXT_URL =
	'https://angular.dev/context/llm-files/llms-full.txt';

export class AngularTool extends MCPLandTool {
	static name = 'angular';
	static description =
		'Always use this tool when working with Angular, it is helpful for answering questions and refactoring code.';
	static sourceId = 'angular-llm-context';
	static contextUrl = DEFAULT_CONTEXT_URL;
	static chunkOptions = { maxChars: 1200, overlap: 200 };

	static schema = z.object({
		query: z
			.string()
			.min(2)
			.describe('Natural language query to search for Angular context'),
		limit: z
			.number()
			.int()
			.min(1)
			.max(50)
			.optional()
			.describe('Number of chunks to return (default 20)'),
	});

	constructor() {
		super({
			name: AngularTool.name,
			description: AngularTool.description,
			sourceId: AngularTool.sourceId,
			contextUrl: AngularTool.contextUrl,
			chunkOptions: AngularTool.chunkOptions,
		});
	}

	getTools(): McpToolDefinition[] {
		return [
			{
				name: `${AngularTool.name}-context`,
				description: AngularTool.description,
				inputSchema: zodToJsonSchema(AngularTool.schema),
				handler: this.handleContext.bind(this),
			},
		];
	}

	async fetchContext(): Promise<string> {
		const res = await fetchWithRetry(this.config.contextUrl!, 4, 500);
		return res.text();
	}

	private async handleContext(args: unknown): Promise<ServerResult> {
		const parsed = AngularTool.schema.safeParse(args);
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

		return {
			content: [
				{
					type: 'text',
					text: payload,
				},
			],
		};
	}
}
