import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock all external dependencies
const mockLoadConfig = vi.fn();
const mockLoadAvailableMcps = vi.fn();
const mockInitializeAll = vi.fn();
const mockGetAllTools = vi.fn();

vi.mock('mcpland', () => ({
	loadConfig: mockLoadConfig,
	loadAvailableMcps: mockLoadAvailableMcps,
	McpRegistry: {
		initializeAll: mockInitializeAll,
		getAllTools: mockGetAllTools,
	},
}));

const mockLog = {
	step: vi.fn(),
	success: vi.fn(),
	message: vi.fn(),
	error: vi.fn(),
};

vi.mock('@clack/prompts', () => ({
	log: mockLog,
}));

const mockFigletTextSync = vi.fn(() => 'MCPLAND BANNER');
vi.mock('figlet', () => ({
	default: {
		textSync: mockFigletTextSync,
	},
}));

const mockCors = vi.fn(() => ({}));
vi.mock('@elysiajs/cors', () => ({
	cors: mockCors,
}));

const mockElysiaInstance = {
	use: vi.fn().mockReturnThis(),
	get: vi.fn().mockReturnThis(),
	post: vi.fn().mockReturnThis(),
	listen: vi.fn().mockReturnThis(),
	handlers: {
		get: new Map(),
		post: new Map(),
	},
};

// Override get and post to capture handlers
mockElysiaInstance.get.mockImplementation((path: string, handler: any) => {
	mockElysiaInstance.handlers.get.set(path, handler);
	return mockElysiaInstance;
});

mockElysiaInstance.post.mockImplementation((path: string, handler: any) => {
	mockElysiaInstance.handlers.post.set(path, handler);
	return mockElysiaInstance;
});

const MockElysia = vi.fn(() => mockElysiaInstance);
vi.mock('elysia', () => ({
	default: MockElysia,
}));

// Mock path functions
vi.mock('path', () => ({
	resolve: vi.fn((...args: string[]) => args.join('/')),
}));

vi.mock('url', () => ({
	fileURLToPath: vi.fn((url: string) => url.replace('file://', '')),
}));

// Mock package.json
vi.mock('../../package.json', () => ({
	default: { version: '1.0.0' },
}));

describe('SSE Server', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Reset process.env and argv
		process.env.MCPLAND_SSE_PORT = '';
		process.argv = ['node', '/test/script.js'];

		// Default mock implementations
		mockLoadConfig.mockReturnValue({ name: 'TestMCP' });
		mockLoadAvailableMcps.mockResolvedValue(undefined);
		mockInitializeAll.mockResolvedValue(undefined);
		mockGetAllTools.mockReturnValue([]);
	});

	it('creates Elysia server instance with correct configuration', async () => {
		await import('../../src/sse');

		expect(MockElysia).toHaveBeenCalledWith({
			name: 'MCPLand SSE Server',
		});

		expect(mockElysiaInstance.use).toHaveBeenCalledWith({});
		expect(mockElysiaInstance.get).toHaveBeenCalledTimes(2); // / and /sse endpoints
		expect(mockElysiaInstance.post).toHaveBeenCalledTimes(1); // /sse endpoint
	});

	it('root endpoint returns figlet banner', async () => {
		await import('../../src/sse');

		// Get the root endpoint handler
		const rootHandler = mockElysiaInstance.handlers.get.get('/');

		expect(rootHandler).toBeDefined();
		const result = rootHandler();

		expect(mockFigletTextSync).toHaveBeenCalledWith('MCPLAND', {
			font: 'Sub-Zero',
		});
		expect(result).toBe('MCPLAND BANNER');
	});

	it('SSE GET endpoint sets correct headers and returns stream', async () => {
		await import('../../src/sse');

		// Get the SSE GET endpoint handler
		const sseGetHandler = mockElysiaInstance.handlers.get.get('/sse');

		expect(sseGetHandler).toBeDefined();

		const mockSet = {
			headers: {},
		};

		const result = await sseGetHandler({ set: mockSet });

		// Verify headers are set correctly
		expect(mockSet.headers['Content-Type']).toBe('text/event-stream');
		expect(mockSet.headers['Cache-Control']).toBe('no-cache');
		expect(mockSet.headers['Connection']).toBe('keep-alive');
		expect(mockSet.headers['Access-Control-Allow-Origin']).toBe('*');

		// Verify stream is returned
		expect(result).toBeInstanceOf(ReadableStream);
	});

	it('SSE POST endpoint handles initialize method', async () => {
		await import('../../src/sse');

		// Get the SSE POST endpoint handler
		const ssePostHandler = mockElysiaInstance.handlers.post.get('/sse');

		expect(ssePostHandler).toBeDefined();

		const mockSet = { headers: {} };
		const mockBody = {
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: {},
		};

		const result = await ssePostHandler({ body: mockBody, set: mockSet });

		expect(result.jsonrpc).toBe('2.0');
		expect(result.id).toBe(1);
		expect(result.result.protocolVersion).toBe('2024-11-05');
		expect(result.result.capabilities).toEqual({ tools: {} });
		expect(result.result.serverInfo.name).toBe('TestMCP');
		expect(result.result.serverInfo.version).toBe('1.0.0');
	});

	it('SSE POST endpoint uses default server name when config name is missing', async () => {
		mockLoadConfig.mockReturnValue({}); // No name in config

		await import('../../src/sse');

		const ssePostHandler = mockElysiaInstance.handlers.post.get('/sse');

		const mockSet = { headers: {} };
		const mockBody = {
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: {},
		};

		const result = await ssePostHandler({ body: mockBody, set: mockSet });

		expect(result.result.serverInfo.name).toBe('MCPLand SSE');
	});

	it('SSE POST endpoint handles tools/list method', async () => {
		const mockTools = [
			{ name: 'tool1', description: 'desc1', inputSchema: {} },
			{ name: 'tool2', description: 'desc2', inputSchema: {} },
		];
		mockGetAllTools.mockReturnValue(mockTools);

		await import('../../src/sse');

		const ssePostHandler = mockElysiaInstance.handlers.post.get('/sse');

		const mockSet = { headers: {} };
		const mockBody = {
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/list',
			params: {},
		};

		const result = await ssePostHandler({ body: mockBody, set: mockSet });

		expect(result.jsonrpc).toBe('2.0');
		expect(result.id).toBe(2);
		expect(result.result.tools).toHaveLength(2);
		expect(result.result.tools[0]).toEqual({
			name: 'tool1',
			description: 'desc1',
			inputSchema: {},
		});
	});

	it('SSE POST endpoint handles prompts/list method', async () => {
		await import('../../src/sse');

		const ssePostHandler = mockElysiaInstance.handlers.post.get('/sse');

		const mockSet = { headers: {} };
		const mockBody = {
			jsonrpc: '2.0',
			id: 3,
			method: 'prompts/list',
			params: {},
		};

		const result = await ssePostHandler({ body: mockBody, set: mockSet });

		expect(result.jsonrpc).toBe('2.0');
		expect(result.id).toBe(3);
		expect(result.result.prompts).toEqual([]);
	});

	it('SSE POST endpoint handles resources/list method', async () => {
		await import('../../src/sse');

		const ssePostHandler = mockElysiaInstance.handlers.post.get('/sse');

		const mockSet = { headers: {} };
		const mockBody = {
			jsonrpc: '2.0',
			id: 4,
			method: 'resources/list',
			params: {},
		};

		const result = await ssePostHandler({ body: mockBody, set: mockSet });

		expect(result.jsonrpc).toBe('2.0');
		expect(result.id).toBe(4);
		expect(result.result.resources).toEqual([]);
	});

	it('SSE POST endpoint handles tools/call method successfully', async () => {
		const mockHandler = vi.fn().mockResolvedValue({
			content: [{ type: 'text', text: 'Success' }],
		});

		const mockTools = [
			{
				name: 'test-tool',
				description: 'Test tool',
				inputSchema: {},
				handler: mockHandler,
			},
		];
		mockGetAllTools.mockReturnValue(mockTools);

		await import('../../src/sse');

		const ssePostHandler = mockElysiaInstance.handlers.post.get('/sse');

		const mockSet = { headers: {} };
		const mockBody = {
			jsonrpc: '2.0',
			id: 5,
			method: 'tools/call',
			params: {
				name: 'test-tool',
				arguments: { input: 'test' },
			},
		};

		const result = await ssePostHandler({ body: mockBody, set: mockSet });

		expect(result.jsonrpc).toBe('2.0');
		expect(result.id).toBe(5);
		expect(result.result.content).toEqual([{ type: 'text', text: 'Success' }]);
		expect(mockHandler).toHaveBeenCalledWith({ input: 'test' });
	});

	it('SSE POST endpoint handles tools/call method with unknown tool', async () => {
		mockGetAllTools.mockReturnValue([]);

		await import('../../src/sse');

		const ssePostHandler = mockElysiaInstance.handlers.post.get('/sse');

		const mockSet = { headers: {} };
		const mockBody = {
			jsonrpc: '2.0',
			id: 6,
			method: 'tools/call',
			params: {
				name: 'unknown-tool',
				arguments: {},
			},
		};

		const result = await ssePostHandler({ body: mockBody, set: mockSet });

		expect(result.jsonrpc).toBe('2.0');
		expect(result.id).toBe(6);
		expect(result.error.code).toBe(-32601);
		expect(result.error.message).toBe('Unknown tool: unknown-tool');
	});

	it('SSE POST endpoint handles tools/call method with handler error', async () => {
		const mockHandler = vi.fn().mockRejectedValue(new Error('Tool failed'));

		const mockTools = [
			{
				name: 'failing-tool',
				description: 'Failing tool',
				inputSchema: {},
				handler: mockHandler,
			},
		];
		mockGetAllTools.mockReturnValue(mockTools);

		await import('../../src/sse');

		const ssePostHandler = mockElysiaInstance.handlers.post.get('/sse');

		const mockSet = { headers: {} };
		const mockBody = {
			jsonrpc: '2.0',
			id: 7,
			method: 'tools/call',
			params: {
				name: 'failing-tool',
				arguments: {},
			},
		};

		const result = await ssePostHandler({ body: mockBody, set: mockSet });

		expect(result.jsonrpc).toBe('2.0');
		expect(result.id).toBe(7);
		expect(result.error.code).toBe(-32603);
		expect(result.error.message).toBe('Tool failed');
	});

	it('SSE POST endpoint handles tools/call method with non-Error thrown value', async () => {
		const mockHandler = vi.fn().mockRejectedValue('String error'); // Non-Error thrown

		const mockTools = [
			{
				name: 'failing-tool',
				description: 'Failing tool',
				inputSchema: {},
				handler: mockHandler,
			},
		];
		mockGetAllTools.mockReturnValue(mockTools);

		await import('../../src/sse');

		const ssePostHandler = mockElysiaInstance.handlers.post.get('/sse');

		const mockSet = { headers: {} };
		const mockBody = {
			jsonrpc: '2.0',
			id: 7,
			method: 'tools/call',
			params: {
				name: 'failing-tool',
				arguments: {},
			},
		};

		const result = await ssePostHandler({ body: mockBody, set: mockSet });

		expect(result.jsonrpc).toBe('2.0');
		expect(result.id).toBe(7);
		expect(result.error.code).toBe(-32603);
		expect(result.error.message).toBe('Internal error'); // Falls back to default
	});

	it('SSE POST endpoint handles unknown method', async () => {
		await import('../../src/sse');

		const ssePostHandler = mockElysiaInstance.handlers.post.get('/sse');

		const mockSet = { headers: {} };
		const mockBody = {
			jsonrpc: '2.0',
			id: 8,
			method: 'unknown/method',
			params: {},
		};

		const result = await ssePostHandler({ body: mockBody, set: mockSet });

		expect(result.jsonrpc).toBe('2.0');
		expect(result.id).toBe(8);
		expect(result.error.code).toBe(-32601);
		expect(result.error.message).toBe('Method not found');
	});

	it('SSE POST endpoint handles request parsing errors', async () => {
		await import('../../src/sse');

		const ssePostHandler = mockElysiaInstance.handlers.post.get('/sse');

		// Mock an error being thrown during processing
		const mockSet = { headers: {} };
		const mockBody = null; // This should cause an error

		const result = await ssePostHandler({ body: mockBody, set: mockSet });

		expect(result.jsonrpc).toBe('2.0');
		expect(result.id).toBeUndefined();
		expect(result.error.code).toBe(-32603);
		expect(result.error.message).toBeDefined();
	});

	it('SSE POST endpoint handles outer catch with non-Error thrown value', async () => {
		await import('../../src/sse');

		const ssePostHandler = mockElysiaInstance.handlers.post.get('/sse');

		// Mock the handler to trigger the outer catch block
		// We'll mock loadConfig to throw a non-Error to test the outer catch
		mockLoadConfig.mockImplementation(() => {
			throw 'String error'; // Non-Error thrown value
		});

		const mockSet = { headers: {} };
		const mockBody = { id: 123, method: 'initialize' };

		const result = await ssePostHandler({ body: mockBody, set: mockSet });

		expect(result.jsonrpc).toBe('2.0');
		expect(result.id).toBe(123);
		expect(result.error.code).toBe(-32603);
		expect(result.error.message).toBe('Internal error'); // Non-Error fallback
	});
});

describe('SSE Server main function', () => {
	let originalArgv: string[];
	let originalEnv: typeof process.env;
	let exitSpy: any;

	beforeEach(() => {
		vi.clearAllMocks();
		originalArgv = process.argv;
		originalEnv = { ...process.env };
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);

		// Default mock implementations
		mockLoadConfig.mockReturnValue({ name: 'TestMCP' });
		mockLoadAvailableMcps.mockResolvedValue(undefined);
		mockInitializeAll.mockResolvedValue(undefined);
		mockGetAllTools.mockReturnValue([{ name: 'tool1' }]);
	});

	afterEach(() => {
		process.argv = originalArgv;
		process.env = originalEnv;
		exitSpy.mockRestore();
	});

	it('main function detects when executed directly', async () => {
		// Mock import.meta.url and process.argv to simulate direct execution
		process.argv = ['bun', '/test/src/sse.ts'];

		// We need to mock the path.resolve calls that main() makes
		const mockResolve = vi.mocked(await import('path')).resolve;
		mockResolve
			.mockReturnValueOnce('/test/src/sse.ts') // currentFilePath
			.mockReturnValueOnce('/test/src/sse.ts'); // mainScriptPath

		// Re-import to trigger main function
		vi.resetModules();

		// Import again to test main function detection
		await import('../../src/sse');

		// The main function should detect direct execution and start the server
		expect(mockResolve).toHaveBeenCalledTimes(2);
	});

	it('main function handles valid port from environment', async () => {
		process.env.MCPLAND_SSE_PORT = '3000';
		process.argv = ['bun', '/test/src/sse.ts'];

		const mockResolve = vi.mocked(await import('path')).resolve;
		mockResolve
			.mockReturnValueOnce('/test/src/sse.ts')
			.mockReturnValueOnce('/test/src/sse.ts');

		// Mock the listen callback to be called immediately
		mockElysiaInstance.listen.mockImplementation((port, callback) => {
			if (callback) callback();
			return mockElysiaInstance;
		});

		vi.resetModules();
		await import('../../src/sse');

		// Wait for async operations
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(mockLoadAvailableMcps).toHaveBeenCalled();
		expect(mockInitializeAll).toHaveBeenCalled();
		expect(mockElysiaInstance.listen).toHaveBeenCalledWith(
			3000,
			expect.any(Function)
		);
	});

	it('main function handles invalid port from environment', async () => {
		process.env.MCPLAND_SSE_PORT = 'invalid-port';
		process.argv = ['bun', '/test/src/sse.ts'];

		const mockResolve = vi.mocked(await import('path')).resolve;
		mockResolve
			.mockReturnValueOnce('/test/src/sse.ts')
			.mockReturnValueOnce('/test/src/sse.ts');

		vi.resetModules();
		await import('../../src/sse');

		// Wait for async operations
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(mockLog.error).toHaveBeenCalledWith(
			'Invalid port number from environment variable. Using default port 1337.'
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('main function handles port out of range', async () => {
		process.env.MCPLAND_SSE_PORT = '99999';
		process.argv = ['bun', '/test/src/sse.ts'];

		const mockResolve = vi.mocked(await import('path')).resolve;
		mockResolve
			.mockReturnValueOnce('/test/src/sse.ts')
			.mockReturnValueOnce('/test/src/sse.ts');

		vi.resetModules();
		await import('../../src/sse');

		// Wait for async operations
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(mockLog.error).toHaveBeenCalledWith(
			'Invalid port number from environment variable. Using default port 1337.'
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('main function uses default port when none specified', async () => {
		delete process.env.MCPLAND_SSE_PORT;
		process.argv = ['bun', '/test/src/sse.ts'];

		const mockResolve = vi.mocked(await import('path')).resolve;
		mockResolve
			.mockReturnValueOnce('/test/src/sse.ts')
			.mockReturnValueOnce('/test/src/sse.ts');

		mockElysiaInstance.listen.mockImplementation((port, callback) => {
			if (callback) callback();
			return mockElysiaInstance;
		});

		vi.resetModules();
		await import('../../src/sse');

		// Wait for async operations
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(mockElysiaInstance.listen).toHaveBeenCalledWith(
			1337,
			expect.any(Function)
		);
	});

	it('main function handles MCP loading errors', async () => {
		process.argv = ['bun', '/test/src/sse.ts'];
		mockLoadAvailableMcps.mockRejectedValue(new Error('Failed to load MCPs'));

		const mockResolve = vi.mocked(await import('path')).resolve;
		mockResolve
			.mockReturnValueOnce('/test/src/sse.ts')
			.mockReturnValueOnce('/test/src/sse.ts');

		vi.resetModules();
		await import('../../src/sse');

		// Wait for async operations
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(mockLog.error).toHaveBeenCalledWith(
			expect.stringContaining('Failed to start SSE server')
		);
		expect(exitSpy).toHaveBeenCalledWith(1);
	});

	it('main function does not start server when not executed directly', async () => {
		// Mock different paths to simulate import vs direct execution
		process.argv = ['bun', '/different/path.ts'];

		const mockResolve = vi.mocked(await import('path')).resolve;
		mockResolve
			.mockReturnValueOnce('/test/src/sse.ts') // currentFilePath
			.mockReturnValueOnce('/different/path.ts'); // mainScriptPath

		vi.resetModules();
		await import('../../src/sse');

		// Wait for any async operations
		await new Promise((resolve) => setTimeout(resolve, 0));

		// Server should not start when not executed directly
		expect(mockElysiaInstance.listen).not.toHaveBeenCalled();
		expect(mockLoadAvailableMcps).not.toHaveBeenCalled();
	});
});
