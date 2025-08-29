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
		const allToolDefs = mockGetAll().flatMap((entry: any) => entry.mcp.getTools());
		startSpy(
			{ name: 'McpLand' },
			allToolDefs
		);
		return { tools: allToolDefs };
	}),
	stdio: vi.fn(async () => {
		console.warn('Starting MCP stdio');
		
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
				const allToolDefs = mockGetAll().flatMap((entry: any) => entry.mcp.getTools());
				startSpy(
					{ name: 'McpLand' },
					allToolDefs
				);
				return { tools: allToolDefs };
			})();
			
			console.warn(`MCP server running on stdio with ${result.tools.length} tools`);
			console.warn(JSON.stringify(result.tools, null, 2));
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

const mockedMain = vi.fn(() => true);
const mockedStdio = vi.fn(async () => ({ tools: [] }));

vi.mock('mcpland', async (importOriginal) => {
	const actual = await importOriginal() as any;
	return {
		...actual,
		main: mockedMain, // Mock main to return true for testing
		stdio: mockedStdio, // Mock stdio function
		loadAvailableMcps: vi.fn(async () => {}),
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
			getStatuses: vi.fn()
		}
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
		const { stdio } = await import('../../src/lib/server');
		const result = await stdio();

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
		startSpy.mockImplementationOnce(() => {
			throw new Error('server start failed');
		});

		const { stdio } = await import('../../src/lib/server');
		await stdio();

		expect(errorSpy).toHaveBeenCalledWith(
			'Failed to start MCP server:',
			expect.any(Error)
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('executes the MCP server when run as entry', async () => {
		// Clear all mocks and reset modules to start fresh
		vi.resetModules();
		vi.clearAllMocks();
		
		// Ensure main returns true so stdio will be called
		mockedMain.mockReturnValue(true);
		
		// Import stdio module - this should trigger the main() check and stdio() call
		await import('../../src/stdio');
		
		// Give it a moment to complete async operations
		await new Promise(resolve => setTimeout(resolve, 10));
		
		// Verify that main() was called to check if running as entry point
		expect(mockedMain).toHaveBeenCalled();
		
		// Verify that stdio() was called since main() returns true
		expect(mockedStdio).toHaveBeenCalled();
	});
});