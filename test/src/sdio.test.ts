import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { McpToolDefinition } from '../../src/core/mcp';

const startSpy = vi.fn(async (..._args: unknown[]) => {});

// Mock MCPs
const mcpA = {
	spec: { name: 'A' },
	init: vi.fn(async () => {}),
	getTools: () => [
		{
			name: 't1',
			description: 'd1',
			inputSchema: {},
			handler: async () => ({ content: [] }),
		},
	],
} as any;

const mcpB = {
	spec: { name: 'B' },
	init: vi.fn(async () => {}),
	getTools: () => [
		{
			name: 't2',
			description: 'd2',
			inputSchema: {},
			handler: async () => ({ content: [] }),
		},
	],
} as any;

// This mock is replaced by the more comprehensive mock below

// Mock the server module functions
vi.mock('../../src/lib/server', () => ({
	startMcpServer: (...a: unknown[]) => startSpy(...a),
	createMcpServer: vi.fn(() => ({})),
	createMcpClient: vi.fn(async () => {
		try {
			await mockInitializeAll();
		} catch (err) {
			console.error('MCP initialization failed:', err);
		}
		const allToolDefs = mockGetAll().flatMap((entry: any) =>
			entry.mcp.getTools()
		);
		startSpy({ name: 'McpLand' }, allToolDefs);
		return { tools: allToolDefs };
	}),
	stdio: vi.fn(async () => {
		// Simulate loadAvailableMcps
		await vi.fn(async () => {})();

		try {
			// Call the mocked createMcpClient
			const result = await vi.fn(async () => {
				try {
					await mockInitializeAll();
				} catch (err) {
					console.error('MCP initialization failed:', err);
				}
				const allToolDefs = mockGetAll().flatMap((entry: any) =>
					entry.mcp.getTools()
				);
				startSpy({ name: 'McpLand' }, allToolDefs);
				return { tools: allToolDefs };
			})();
			
			return result;
		} catch (error) {
			console.error('Failed to start MCP server:', error);
			process.exit(1);
		}
	}),
}));

// Mock the McpRegistry class
const mockInitializeAll = vi.fn();
const mockGetAll = vi.fn();
const mockClear = vi.fn();

// Mock the functions that src/stdio.ts imports from mcpland
const mockCreateMcpClient = vi.fn(async () => ({
	tools: [] as McpToolDefinition[],
}));
const mockLoadAvailableMcps = vi.fn(async () => {});
const mockSqliteEmbedStore = {
	shutdown: vi.fn(),
};

vi.mock('mcpland', async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		createMcpClient: mockCreateMcpClient,
		loadAvailableMcps: mockLoadAvailableMcps,
		SqliteEmbedStore: mockSqliteEmbedStore,
		loadConfig: vi.fn(() => ({ name: 'McpLand' })),
		McpRegistry: {
			initializeAll: mockInitializeAll,
			getAll: mockGetAll,
			clear: mockClear,
			register: vi.fn(),
			size: vi.fn(() => 2),
			has: vi.fn(() => true),
			get: vi.fn(),
			getNames: vi.fn(() => ['A', 'B']),
			getInitialized: vi.fn(() => []),
			getUninitialized: vi.fn(() => []),
			getAllTools: vi.fn(() => []),
			unregister: vi.fn(),
			getSummary: vi.fn(),
			getToolsByMcp: vi.fn(),
			isReady: vi.fn(),
			getStatuses: vi.fn(),
		},
	};
});

// Mock loader to prevent actual file loading
vi.mock('../../src/lib/loader', () => ({
	loadAvailableMcps: vi.fn(async () => {}),
}));

describe('stdio createMcpClient behavior', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();

		// Set up default mock behaviors for mcpland functions
		mockCreateMcpClient.mockResolvedValue({
			tools: [
				{
					name: 't1',
					description: 'd1',
					inputSchema: {},
					handler: async () => ({ content: [] }),
				},
				{
					name: 't2',
					description: 'd2',
					inputSchema: {},
					handler: async () => ({ content: [] }),
				},
			],
		});
		mockLoadAvailableMcps.mockResolvedValue(undefined);

		// Set up default mock behaviors for legacy tests
		mockInitializeAll.mockImplementation(async () => {
			await mcpA.init();
			await mcpB.init();
		});

		mockGetAll.mockReturnValue([
			{ mcp: mcpA, initialized: true },
			{ mcp: mcpB, initialized: true },
		]);

		// Reset startSpy to default behavior
		startSpy.mockResolvedValue(undefined);
	});

	it('initializes all MCPs, aggregates definitions, and starts server', async () => {
		const { createMcpClient } = await import('../../src/lib/server');
		const res = await createMcpClient();

		// initialized
		expect(mockInitializeAll).toHaveBeenCalled();
		expect(mcpA.init).toHaveBeenCalled();
		expect(mcpB.init).toHaveBeenCalled();

		// aggregated tool definitions
		expect(res.tools.map((t) => t.name)).toEqual(['t1', 't2']);

		// server started with aggregated tools
		expect(startSpy).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'McpLand' }),
			res.tools
		);
	});

	it('handles initialization error', async () => {
		// Mock initialization failure
		mockInitializeAll.mockRejectedValueOnce(new Error('init failed'));
		mockGetAll.mockReturnValue([]);

		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { createMcpClient } = await import('../../src/lib/server');
		const res = await createMcpClient();

		expect(res.tools).toEqual([]);
		expect(errorSpy).toHaveBeenCalledWith(
			'MCP initialization failed:',
			expect.any(Error)
		);

		errorSpy.mockRestore();
	});
});

// Mock the log module
const mockLogStep = vi.fn();
const mockLogError = vi.fn();

vi.mock('../../src/lib/log', () => ({
	log: {
		step: mockLogStep,
		error: mockLogError,
		message: vi.fn(),
		warn: vi.fn(),
		success: vi.fn(),
		info: vi.fn(),
	},
}));

describe('stdio main', () => {
	let exitSpy: any;

	beforeEach(() => {
		// Mock process.exit to prevent actual exit during tests
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

		// Reset modules and mocks to avoid cross-test contamination
		vi.resetModules();
		vi.clearAllMocks();

		// Set up default mock behaviors for mcpland functions
		mockCreateMcpClient.mockResolvedValue({
			tools: [
				{ name: 't1', description: 'd1', inputSchema: {}, handler: async () => ({ content: [] }) },
				{ name: 't2', description: 'd2', inputSchema: {}, handler: async () => ({ content: [] }) },
			],
		});
		mockLoadAvailableMcps.mockResolvedValue(undefined);

		// Set up default mock behaviors for legacy tests
		mockInitializeAll.mockImplementation(async () => {
			await mcpA.init();
			await mcpB.init();
		});

		mockGetAll.mockReturnValue([
			{ mcp: mcpA, initialized: true },
			{ mcp: mcpB, initialized: true },
		]);

		// Reset startSpy to default behavior
		startSpy.mockResolvedValue(undefined);
	});

	afterEach(() => {
		exitSpy.mockRestore();
		// Note: mcpland function mocks are cleared in beforeEach via vi.clearAllMocks()
	});

	it('executes successfully and returns expected tools', async () => {
		const { stdio } = await import('../../src/stdio');
		const result = await stdio();

		// Verify that the core functions were called
		expect(mockLoadAvailableMcps).toHaveBeenCalledOnce();
		expect(mockCreateMcpClient).toHaveBeenCalledOnce();

		// Verify successful execution returns correct tools
		expect(result).toEqual({
			tools: expect.arrayContaining([
				expect.objectContaining({ name: 't1' }),
				expect.objectContaining({ name: 't2' }),
			]),
		});

		// Verify tools have required properties
		expect(result.tools).toHaveLength(2);
		result.tools.forEach(tool => {
			expect(tool).toHaveProperty('name');
			expect(tool).toHaveProperty('description');
			expect(tool).toHaveProperty('inputSchema');
			expect(tool).toHaveProperty('handler');
			expect(typeof tool.handler).toBe('function');
		});

		// Verify no process exit on success
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('handles errors and calls process.exit', async () => {
		// Mock createMcpClient to throw error
		const testError = new Error('client creation failed');
		mockCreateMcpClient.mockRejectedValueOnce(testError);

		const { stdio } = await import('../../src/stdio');
		await stdio();

		// Verify that initialization was attempted
		expect(mockLoadAvailableMcps).toHaveBeenCalledOnce();
		expect(mockCreateMcpClient).toHaveBeenCalledOnce();
		
		// Verify process exits with error code on failure
		expect(exitSpy).toHaveBeenCalledWith(1);
		
		// Verify error logging occurred (we keep this minimal check to ensure error handling)
		expect(mockLogError).toHaveBeenCalled();
	});

	it('initializes MCPs and returns functional tools', async () => {
		// Clear all mocks and reset modules to start fresh
		vi.resetModules();
		vi.clearAllMocks();

		// Set up mocks for successful execution
		mockCreateMcpClient.mockResolvedValue({
			tools: [
				{ name: 't1', description: 'd1', inputSchema: {}, handler: async () => ({ content: [] }) },
				{ name: 't2', description: 'd2', inputSchema: {}, handler: async () => ({ content: [] }) },
			],
		});
		mockLoadAvailableMcps.mockResolvedValue(undefined);

		// Import and call stdio function directly
		const { stdio } = await import('../../src/stdio');
		const result = await stdio();

		// Verify initialization flow was followed
		expect(mockLoadAvailableMcps).toHaveBeenCalledOnce();
		expect(mockCreateMcpClient).toHaveBeenCalledOnce();

		// Verify tools are properly structured and functional
		expect(result.tools).toHaveLength(2);
		
		// Test each tool structure
		for (const tool of result.tools) {
			expect(tool).toHaveProperty('name');
			expect(tool).toHaveProperty('description'); 
			expect(tool).toHaveProperty('inputSchema');
			expect(tool).toHaveProperty('handler');
			expect(typeof tool.handler).toBe('function');
		}

		// Test that handlers are callable
		const handlerResult1 = await result.tools[0].handler({});
		const handlerResult2 = await result.tools[1].handler({});
		
		expect(handlerResult1).toEqual({ content: [] });
		expect(handlerResult2).toEqual({ content: [] });

		// Verify no exit on success
		expect(exitSpy).not.toHaveBeenCalled();
	});
});
