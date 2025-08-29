import { beforeEach, describe, expect, it, vi } from 'vitest';
import z from 'zod';

import { McpTool } from '../../../src/core/mcp';

// Mock the store to avoid bun/sqlite
const searchSpy = vi.fn(async () => []);
const ingestSpy = vi.fn(async () => {});

// Mock lib helpers
const chunkSpy = vi.fn((text, _opts) => ['c1', 'c2']);

vi.mock('mcpland', () => ({
	chunkText: (text: string, _opts: unknown) => chunkSpy(text, _opts),
	DB_PATH: '.data/context.sqlite',
	SqliteEmbedStore: class MockStore {
		constructor(_path: string) {}
		ingest = ingestSpy;
		search = searchSpy;
	},
	getSourceFolder: () => 'mcps',
	isMcpToolEnabled: vi.fn(() => true),
}));

// Mock zod-to-json-schema
vi.mock('zod-to-json-schema', () => ({
	default: (schema: any) => ({ type: 'object' }),
}));

class TestTool extends McpTool {
	constructor(name = 'Foo-MCP', mcpId?: string) {
		super({
			name,
			description: 'desc',
			sourceId: 'source-1',
			mcpId: mcpId || 'foo',
			toolId: 'bar',
			contextUrl: 'http://example.com',
			chunkOptions: { maxChars: 10, overlap: 2 },
			schema: z.object({
				query: z.string(),
			}),
		});
	}
	
	async fetchContext(): Promise<string> {
		return 'ctx';
	}
	
	async handleContext(args: unknown) {
		return { content: [] };
	}
}

describe('McpTool base class', () => {
	beforeEach(() => {
		ingestSpy.mockClear();
		searchSpy.mockClear();
		chunkSpy.mockClear();
	});

	it('init fetches context, chunks, and ingests with metadata', async () => {
		const tool = new TestTool('Bar-MCP');
		await tool.init();
		expect(chunkSpy).toHaveBeenCalledWith('ctx', { maxChars: 10, overlap: 2 });
		expect(ingestSpy).toHaveBeenCalledWith(
			{ id: 'source-1', meta: { name: 'Bar-MCP', url: 'http://example.com', file: undefined } },
			['c1', 'c2'],
			{ mcpId: 'foo', toolId: 'bar' }
		);
	});

	it('getTool returns tool definition with transformed schema', () => {
		const tool = new TestTool('MyTool-MCP');
		const toolDef = tool.getTool();
		expect(toolDef.name).toBe('MyTool-MCP');
		expect(toolDef.description).toBe('desc');
		expect(toolDef.inputSchema).toEqual({ type: 'object' });
		// Handler is now bound to the tool instance
		expect(typeof toolDef.handler).toBe('function');
		expect(toolDef.handler.name).toBe('bound handleContext');
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

	it('getToolPath returns correct path based on mcpId and toolId', () => {
		const tool = new TestTool('Path-MCP');
		const path = tool['getToolPath']();
		expect(path).toBe('mcps/foo/tools/bar');
	});
});

describe('McpLand base class', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('registers tools and initializes them', async () => {
		const { McpLand } = await import('../../../src/core/mcp');
		
		class TestMcp extends McpLand {
			constructor() {
				super({
					name: 'test-mcp',
					description: 'Test MCP',
				});
			}
		}

		const mcp = new TestMcp();
		const tool1 = new TestTool('tool1', 'test-mcp');
		const tool2 = new TestTool('tool2', 'test-mcp');

		// Register tools
		(mcp as any).registerTool(tool1, 'tool1');
		(mcp as any).registerTool(tool2, 'tool2');

		// Initialize
		await mcp.init();

		// Verify both tools were initialized
		expect(ingestSpy).toHaveBeenCalledTimes(2);
	});

	it('getTools returns all registered tool definitions', async () => {
		const { McpLand } = await import('../../../src/core/mcp');
		
		class TestMcp extends McpLand {
			constructor() {
				super({
					name: 'test-mcp',
					description: 'Test MCP',
				});
			}
		}

		const mcp = new TestMcp();
		const tool1 = new TestTool('tool1', 'test-mcp');
		const tool2 = new TestTool('tool2', 'test-mcp');

		(mcp as any).registerTool(tool1, 'tool1');
		(mcp as any).registerTool(tool2, 'tool2');

		const tools = mcp.getTools();
		expect(tools).toHaveLength(2);
		expect(tools[0].name).toBe('test-mcp-tool1');
		expect(tools[1].name).toBe('test-mcp-tool2');
	});

	it('registerTool normalizes tool names with MCP prefix', async () => {
		const { McpLand } = await import('../../../src/core/mcp');
		
		class TestMcp extends McpLand {
			constructor() {
				super({
					name: 'my-mcp',
					description: 'My MCP',
				});
			}
		}

		const mcp = new TestMcp();
		const tool = new TestTool('simple-tool');
		tool.spec.mcpId = 'my-mcp';

		(mcp as any).registerTool(tool);

		const tools = mcp.getTools();
		expect(tools[0].name).toBe('my-mcp-simple-tool');
	});

	it('registerTool throws on missing tool spec', async () => {
		const { McpLand } = await import('../../../src/core/mcp');
		
		class TestMcp extends McpLand {
			constructor() {
				super({
					name: 'test-mcp',
					description: 'Test MCP',
				});
			}
		}

		const mcp = new TestMcp();
		const invalidTool = { spec: null };

		expect(() => (mcp as any).registerTool(invalidTool)).toThrow('Tool is missing required config');
	});

	it('registerTool throws on empty tool name', async () => {
		const { McpLand } = await import('../../../src/core/mcp');
		
		class TestMcp extends McpLand {
			constructor() {
				super({
					name: 'test-mcp',
					description: 'Test MCP',
				});
			}
		}

		const mcp = new TestMcp();
		const tool = new TestTool('');

		expect(() => (mcp as any).registerTool(tool)).toThrow('Tool is missing required spec.name');
	});

	it('registerTool skips disabled tools', async () => {
		// Mock isMcpToolEnabled to return false for this specific test
		vi.doMock('mcpland', () => ({
			chunkText: (text: string, _opts: unknown) => chunkSpy(text, _opts),
			DB_PATH: '.data/context.sqlite',
			SqliteEmbedStore: class MockStore {
				constructor(_path: string) {}
				ingest = ingestSpy;
				search = searchSpy;
			},
			getSourceFolder: () => 'mcps',
			isMcpToolEnabled: vi.fn((mcpName: string, toolName: string) => {
				return toolName !== 'disabled'; // Return false for 'disabled' tool
			}),
		}));
		
		// Reset modules to pick up the new mock
		vi.resetModules();
		
		const { McpLand } = await import('../../../src/core/mcp');
		
		// Need to reimport TestTool class after module reset
		const { McpTool } = await import('../../../src/core/mcp');
		
		class LocalTestTool extends McpTool {
			constructor(name: string, mcpId: string) {
				super({
					name,
					description: 'desc',
					sourceId: 'source-1',
					mcpId: mcpId,
					toolId: 'disabled',
					contextUrl: 'http://example.com',
					chunkOptions: { maxChars: 10, overlap: 2 },
					schema: z.object({
						query: z.string(),
					}),
				});
			}
			
			async fetchContext(): Promise<string> {
				return 'ctx';
			}
			
			async handleContext(args: unknown) {
				return { content: [] };
			}
		}
		
		class TestMcp extends McpLand {
			constructor() {
				super({
					name: 'test-mcp',
					description: 'Test MCP',
				});
			}
		}

		const mcp = new TestMcp();
		const tool = new LocalTestTool('disabled-tool', 'test-mcp');

		(mcp as any).registerTool(tool, 'disabled');

		const tools = mcp.getTools();
		expect(tools).toHaveLength(0);
	});
});
