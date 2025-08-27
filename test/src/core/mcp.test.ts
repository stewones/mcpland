import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MCPLandTool, type McpToolDefinition } from 'mcpland/core';

// Mock the store to avoid bun/sqlite
const searchSpy = vi.fn(async () => []);
const ingestSpy = vi.fn(async () => {});

vi.mock('../../../src/store', () => ({
	DEFAULT_DB_PATH: '.data/context.sqlite',
	SqliteEmbedStore: class MockStore {
		constructor(_path: string) {}
		ingest = ingestSpy;
		search = searchSpy;
	},
}));

// Mock lib helpers
const chunkSpy = vi.fn((text, _opts) => ['c1', 'c2']);
const startSpy = vi.fn(async (..._args: unknown[]) => ({}));

vi.mock('mcpland/lib', () => ({
	chunkText: (text: string, _opts: unknown) => chunkSpy(text, _opts),
	startMcpServer: (...args: unknown[]) => startSpy(...args),
}));

vi.mock('ai/mcp-stdio', () => {
	// Mock transport defined inside the mock factory
	class MockTransport {
		command: string;
		args: string[];
		constructor(opts: any) {
			this.command = opts.command;
			this.args = opts.args;
		}
	}
	
	return {
		Experimental_StdioMCPTransport: MockTransport,
	};
});

class TestTool extends MCPLandTool {
	constructor(name = 'Foo-MCP') {
		super({
			name,
			description: 'desc',
			sourceId: 'source-1',
			contextUrl: 'http://example.com',
			chunkOptions: { maxChars: 10, overlap: 2 },
		});
	}
	getTools(): McpToolDefinition[] {
		return [
			{
				name: 'tool',
				description: 'd',
				inputSchema: {},
				handler: async () => ({ content: [] }),
			},
		];
	}
	async fetchContext(): Promise<string> {
		return 'ctx';
	}
}

describe('MCPLandTool base class', () => {
	beforeEach(() => {
		ingestSpy.mockClear();
		searchSpy.mockClear();
		chunkSpy.mockClear();
		startSpy.mockClear();
	});

	it('init fetches context, chunks, and ingests with metadata', async () => {
		const tool = new TestTool('Bar-MCP');
		await tool.init();
		expect(chunkSpy).toHaveBeenCalledWith('ctx', { maxChars: 10, overlap: 2 });
		expect(ingestSpy).toHaveBeenCalledWith(
			{ id: 'source-1', meta: { name: 'Bar-MCP', url: 'http://example.com' } },
			['c1', 'c2']
		);
	});

	it('getTransport builds stdio transport pointing to tool server script', () => {
		const tool = new TestTool('MyTool-MCP');
		const transport = tool.getTransport() as unknown as any;
		expect(transport.command).toBe('bun');
		expect(transport.args[0]).toMatch(/src\/tools\/mytool-mcp\/server\.ts$/);
	});

	it('startMcpServer forwards config and tools', async () => {
		const tool = new TestTool('Baz-MCP');
		const res = await tool.startMcpServer();
		expect(startSpy).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'Baz-MCP', description: 'desc' }),
			expect.arrayContaining([expect.objectContaining({ name: 'tool' })])
		);
	});

	it('searchContext delegates to store with source filter', async () => {
		const tool = new TestTool('Qux-MCP');
		await tool['searchContext']('query', 7);
		expect(searchSpy).toHaveBeenCalledWith('query', {
			limit: 7,
			sourceId: 'source-1',
		});
		await tool['searchContext']('query');
		expect(searchSpy).toHaveBeenCalledWith('query', {
			limit: 20,
			sourceId: 'source-1',
		});
	});
});
