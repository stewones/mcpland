import z from 'zod';

import { McpLandTool, type McpToolSpec } from 'mcpland/core';
import { fetchWithRetry } from 'mcpland/lib';

import type { ServerResult } from '@modelcontextprotocol/sdk/types.js';

const contextUrl = 'https://angular.dev/context/llm-files/llms-full.txt';

const spec: McpToolSpec = {
	name: 'docs',
	description: 'Angular docs context search tool.',
	sourceId: 'angular-llm-context',
	contextUrl: contextUrl,
	chunkOptions: { maxChars: 1200, overlap: 200 },
	schema: z.object({
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
	}),
};

export class AngularDocsTool extends McpLandTool {
	constructor() {
		super(spec);
	}

	/**
	 * Fetch initial context
	 * This is automatically called at MCP initialization
	 */
	async fetchContext(): Promise<string> {
		const res = await fetchWithRetry(this.spec.contextUrl!);
		return res.text();
	}

	/**
	 * Handle context for user inquiries
	 * You can hook in and customize context as per tool requirements
	 */
	async handleContext(args: unknown): Promise<ServerResult> {
		const parsed = spec.schema.safeParse(args);
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

export default new AngularDocsTool();
