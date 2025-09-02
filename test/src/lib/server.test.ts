import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { createMcpServer, startMcpServer } from '../../../src/lib/server';

// Mocks for MCP SDK
vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
	ListToolsRequestSchema: 'LIST',
	CallToolRequestSchema: 'CALL',
}));

const connectSpy = vi.fn();

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
	Server: class MockServer {
		info: any;
		opts: any;
		handlers = new Map();
		connected = false;
		transport: any;
		constructor(info: any, opts: any) {
			this.info = info;
			this.opts = opts;
		}
		setRequestHandler(schema: any, fn: any) {
			this.handlers.set(schema, fn);
		}
		async connect(transport: any) {
			this.transport = transport;
			this.connected = true;
			connectSpy();
		}
	},
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
	StdioServerTransport: class MockTransport {},
}));

describe('createMcpServer behavior', () => {
	const cfg = { name: 'TestServer', version: '1.0.0', description: 'desc' };
	const tools = [
		{
			name: 'echo',
			description: 'Echo input',
			inputSchema: {},
			handler: vi.fn(async (args: any) => ({
				content: [{ type: 'text', text: JSON.stringify(args) }],
			})),
		},
	];

	it('lists provided tools via handler', async () => {
		const server: any = createMcpServer(cfg as any, tools as any);
		const { tools: listed } = await server.handlers.get(
			ListToolsRequestSchema
		)();

		expect(listed).toEqual([
			{ name: 'echo', description: 'Echo input', inputSchema: {} },
		]);
	});

	it('calls tool handlers and returns results', async () => {
		const server: any = createMcpServer(cfg as any, tools as any);
		const res = await server.handlers.get(CallToolRequestSchema)({
			params: { name: 'echo', arguments: { hello: 'world' } },
		});

		expect(res).toEqual({
			content: [{ type: 'text', text: JSON.stringify({ hello: 'world' }) }],
		});
		expect(tools[0].handler).toHaveBeenCalled();
	});

	it('returns error when tool is unknown', async () => {
		const server: any = createMcpServer(cfg as any, tools as any);
		const res = await server.handlers.get(CallToolRequestSchema)({
			params: { name: 'nope', arguments: {} },
		});

		expect(res.content[0].type).toBe('text');
		expect(JSON.parse(res.content[0].text)).toEqual({
			error: 'Unknown tool: nope',
		});
	});

	it('wraps thrown handler errors as failure results', async () => {
		const badTools = [
			{
				name: 'bad',
				description: 'bad',
				inputSchema: {},
				handler: vi.fn(async () => {
					throw new Error('boom');
				}),
			},
		];
		const server: any = createMcpServer(cfg as any, badTools as any);
		const res = await server.handlers.get(CallToolRequestSchema)({
			params: { name: 'bad', arguments: {} },
		});

		expect(JSON.parse(res.content[0].text)).toEqual({
			error: 'Tool execution failed',
			details: 'boom',
		});
	});

	it('handles non-Error thrown values', async () => {
		const badTools = [
			{
				name: 'bad',
				description: 'bad',
				inputSchema: {},
				handler: vi.fn(async () => {
					throw 'string error'; // Non-Error thrown value
				}),
			},
		];
		const server: any = createMcpServer(cfg as any, badTools as any);
		const res = await server.handlers.get(CallToolRequestSchema)({
			params: { name: 'bad', arguments: {} },
		});

		expect(JSON.parse(res.content[0].text)).toEqual({
			error: 'Tool execution failed',
			details: 'string error',
		});
	});
});

describe('startMcpServer behavior', () => {
	beforeEach(() => connectSpy.mockClear());
	it('connects server over stdio transport', async () => {
		const srv: any = await startMcpServer({ name: 's' } as any, [] as any);
    
		expect(connectSpy).toHaveBeenCalled();
		expect(srv.connected).toBe(true);
		expect(srv.transport).toBeInstanceOf(
			(await import('@modelcontextprotocol/sdk/server/stdio.js'))
				.StdioServerTransport as any
		);
	});
});

describe('createMcpClient behavior', () => {
	let mockStep: any;
	let mockError: any;
	let mockStartMcpServer: any;

	beforeEach(() => {
		vi.resetModules();
		mockStep = vi.fn();
		mockError = vi.fn();
		mockStartMcpServer = vi.fn().mockResolvedValue({});
		
		vi.doMock('../../../src/lib/log', () => ({
			log: {
				step: mockStep,
				error: mockError
			}
		}));
		
		// Mock the startMcpServer function
		vi.doMock('../../../src/lib/server', async () => {
			const actual = await vi.importActual('../../../src/lib/server') as any;
			return {
				...actual,
				startMcpServer: mockStartMcpServer
			};
		});
	});

	it('creates MCP client and starts server with aggregated tools', async () => {
		const mockLoadConfig = vi.fn(() => ({ 
			name: 'TestMCP', 
			description: 'Test Description' 
		}));
		
		const mockGetAll = vi.fn(() => [
			{
				mcp: {
					getTools: () => [
						{ name: 'tool1', description: 'desc1', inputSchema: {}, handler: () => {} },
						{ name: 'tool2', description: 'desc2', inputSchema: {}, handler: () => {} }
					]
				}
			}
		]);

		const mockInitializeAll = vi.fn().mockResolvedValue(undefined);

		vi.doMock('mcpland', () => ({
			loadConfig: mockLoadConfig,
			McpRegistry: {
				getAll: mockGetAll,
				initializeAll: mockInitializeAll
			}
		}));

		const { createMcpClient } = await import('../../../src/lib/server');

		const result = await createMcpClient();

		expect(mockStep).toHaveBeenCalledWith('Creating MCP client');
		expect(mockInitializeAll).toHaveBeenCalled();
		expect(result.tools).toHaveLength(2);
	});

	it('handles MCP initialization errors gracefully', async () => {
		const mockLoadConfig = vi.fn(() => ({ name: 'TestMCP' }));
		
		const mockGetAll = vi.fn(() => [
			{
				mcp: {
					getTools: () => [{ name: 'tool1', description: 'desc1', inputSchema: {}, handler: () => {} }]
				}
			}
		]);

		const mockInitializeAll = vi.fn().mockRejectedValue(new Error('Init failed'));

		vi.doMock('mcpland', () => ({
			loadConfig: mockLoadConfig,
			McpRegistry: {
				getAll: mockGetAll,
				initializeAll: mockInitializeAll
			}
		}));

		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { createMcpClient } = await import('../../../src/lib/server');

		const result = await createMcpClient();

		// Should still return tools even if initialization fails
		expect(result.tools).toHaveLength(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			'MCP initialization failed:',
			expect.any(Error)
		);

		consoleErrorSpy.mockRestore();
	});

	it('uses default names when config is incomplete', async () => {
		const mockLoadConfig = vi.fn(() => ({})); // Empty config
		
		const mockGetAll = vi.fn(() => []);
		const mockInitializeAll = vi.fn().mockResolvedValue(undefined);

		vi.doMock('mcpland', () => ({
			loadConfig: mockLoadConfig,
			McpRegistry: {
				getAll: mockGetAll,
				initializeAll: mockInitializeAll
			}
		}));

		const { createMcpClient } = await import('../../../src/lib/server');

		const result = await createMcpClient();

		// Just verify the function runs and returns expected structure
		expect(result).toBeDefined();
		expect(result.tools).toEqual([]);
	});
});
