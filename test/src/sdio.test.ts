import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startSpy = vi.fn(async (..._args: unknown[]) => {});

// Define mock tools outside to avoid hoisting issues
const toolA = {
	config: { name: 'A' },
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

const toolB = {
	config: { name: 'B' },
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

vi.mock('../../src/loader', () => ({ tools: [toolA, toolB] }));

describe('stdio createMCPClient behavior', () => {
	beforeEach(() => {
		vi.resetModules();
		startSpy.mockClear();
		toolA.init.mockClear();
		toolB.init.mockClear();
	});

	it('initializes all tools, aggregates definitions, and starts server', async () => {
		const { createMCPClient } = await import('../../src/stdio');
		const res = await createMCPClient();

		// initialized
		expect(toolA.init).toHaveBeenCalled();
		expect(toolB.init).toHaveBeenCalled();

		// aggregated tool definitions
		expect(res.tools.map((t) => t.name)).toEqual(['t1', 't2']);

		// server started with aggregated tools
		expect(startSpy).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'MCPLand' }),
			res.tools
		);
	});

	it('handles initialization error in registry', async () => {
		// Mock tools with failing init
		const failingTool = {
			config: { name: 'failing' },
			init: vi.fn(async () => {
				throw new Error('init failed');
			}),
			getTools: () => [],
		};

		vi.doMock('../../src/loader', () => ({ tools: [failingTool] }));

		// Mock console.error to capture error handling
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { createMCPClient } = await import('../../src/stdio');
		const res = await createMCPClient();

		// Should still return empty tools array
		expect(res.tools).toEqual([]);
		expect(errorSpy).toHaveBeenCalledWith(
			'Tool initialization failed:',
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
	});

	afterEach(() => {
		warnSpy.mockRestore();
		errorSpy.mockRestore();
		exitSpy.mockRestore();
	});

	it('executes successfully and logs tools', async () => {
		// Mock successful tools for this test
		vi.doMock('../../src/loader', () => ({
			tools: [toolA, toolB],
		}));

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
			'Initialized MCP clients for tools:',
			expect.stringContaining('t1')
		);
		expect(warnSpy).toHaveBeenCalledWith('MCP server running on stdio');
		expect(errorSpy).not.toHaveBeenCalled();
		expect(exitSpy).not.toHaveBeenCalled();
	});

	it('handles errors and calls process.exit', async () => {
		// Mock tools that cause createMCPClient to fail
		const failingTool = {
			config: { name: 'failing' },
			init: vi.fn(async () => {
				throw new Error('Catastrophic failure');
			}),
			getTools: () => [],
		};

		vi.doMock('../../src/loader', () => ({ tools: [failingTool] }));
		vi.doMock('mcpland/lib', () => ({
			startMcpServer: vi.fn().mockRejectedValue(new Error('Server failed')),
		}));

		const { main } = await import('../../src/stdio');

		// The main function should handle the error and call process.exit
		await main();

		// Verify error handling
		expect(errorSpy).toHaveBeenCalledWith(
			'Failed to start MCP server:',
			expect.any(Error)
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(warnSpy).not.toHaveBeenCalledWith('MCP server running on stdio');
	});

	it('executes the MCP server when run as entry', async () => {
		const { main } = await import('../../src/stdio');

		await main();

		expect(startSpy).toHaveBeenCalled();

		import.meta.main = false;
	});
});
