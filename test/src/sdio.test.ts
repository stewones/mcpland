import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('mcpland/lib', () => ({
	startMcpServer: (...a: unknown[]) => startSpy(...a),
}));

// Mock the McpRegistry class
const mockInitializeAll = vi.fn();
const mockGetAll = vi.fn();
const mockClear = vi.fn();

vi.mock('mcpland/core', async (importOriginal) => {
	const actual = await importOriginal() as any;
	return {
		...actual,
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
			getStatuses: vi.fn()
		}
	};
});

// Mock loader to prevent actual file loading
vi.mock('../../src/loader', () => ({}));

describe('stdio createMcpClient behavior', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		
		// Set up default mock behaviors
		mockInitializeAll.mockImplementation(async () => {
			await mcpA.init();
			await mcpB.init();
		});
		
		mockGetAll.mockReturnValue([
			{ mcp: mcpA, initialized: true },
			{ mcp: mcpB, initialized: true }
		]);
		
		// Reset startSpy to default behavior
		startSpy.mockResolvedValue(undefined);
	});

	it('initializes all MCPs, aggregates definitions, and starts server', async () => {
		const { createMcpClient } = await import('../../src/stdio');
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

		const { createMcpClient } = await import('../../src/stdio');
		const res = await createMcpClient();

		expect(res.tools).toEqual([]);
		expect(errorSpy).toHaveBeenCalledWith(
			'MCP initialization failed:',
			expect.any(Error)
		);

		errorSpy.mockRestore();
	});
});

describe('stdio main', () => {
	let warnSpy: any;
	let errorSpy: any;
	let exitSpy: any;

	beforeEach(() => {
		// Mock console methods
		warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

		// Reset modules to avoid cross-test contamination
		vi.resetModules();
		vi.clearAllMocks();
		
		// Set up default mock behaviors
		mockInitializeAll.mockImplementation(async () => {
			await mcpA.init();
			await mcpB.init();
		});
		
		mockGetAll.mockReturnValue([
			{ mcp: mcpA, initialized: true },
			{ mcp: mcpB, initialized: true }
		]);
		
		// Reset startSpy to default behavior
		startSpy.mockResolvedValue(undefined);
	});

	afterEach(() => {
		warnSpy.mockRestore();
		errorSpy.mockRestore();
		exitSpy.mockRestore();
	});

	it('executes successfully and logs tools', async () => {
		const { main } = await import('../../src/stdio');
		const result = await main();

		// Verify successful execution
		expect(result).toEqual({
			tools: expect.arrayContaining([
				expect.objectContaining({ name: 't1' }),
				expect.objectContaining({ name: 't2' }),
			]),
		});

		// Verify console output
		expect(warnSpy).toHaveBeenCalledWith(
			'MCP server running on stdio with 2 tools'
		);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('"name": "t1"')
		);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('"name": "t2"')
		);
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('handles errors and calls process.exit', async () => {
		// Mock startMcpServer to throw error after successful initialization
		startSpy.mockRejectedValueOnce(new Error('server start failed'));

		const { main } = await import('../../src/stdio');
		await main();

		expect(errorSpy).toHaveBeenCalledWith(
			'Failed to start MCP server:',
			expect.any(Error)
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('executes the MCP server when run as entry', async () => {
		// Since import.meta.main is always true in tests (see vitest.config.ts),
		// the main() function is automatically called when we import stdio.ts.
		// Let's verify the module runs correctly when imported as main.
		
		// Import stdio - this will trigger main() because import.meta.main is true
		const stdioModule = await import('../../src/stdio');
		
		// Verify the main function was executed by checking the expected behavior
		expect(mockInitializeAll).toHaveBeenCalled();
		expect(startSpy).toHaveBeenCalled();
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('MCP server running on stdio')
		);
		
		// Verify the module exports are available
		expect(stdioModule.main).toBeDefined();
		expect(stdioModule.createMcpClient).toBeDefined();
	});
});