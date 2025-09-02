import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ServeCommand } from '../../../../src/cli/commands/serve';

// Mock all external dependencies
vi.mock('@clack/prompts', () => ({
	intro: vi.fn(),
	log: {
		step: vi.fn(),
		message: vi.fn(),
		error: vi.fn(),
	}
}));

vi.mock('figlet', () => ({
	default: {
		textSync: vi.fn(() => 'MCPLAND BANNER')
	}
}));

vi.mock('node:fs', () => ({
	existsSync: vi.fn()
}));

vi.mock('../../../../src/lib/config', () => ({
	getExecutionMode: vi.fn(),
	getSseScriptPath: vi.fn()
}));

// Mock Bun global
global.Bun = {
	which: vi.fn(() => 'bun'),
	spawn: vi.fn()
} as any;

describe('Serve command helps users start the SSE server easily', () => {
	let serveCommand: ServeCommand;
	let mockPrompts: any;
	let mockFs: any;
	let mockConfig: any;

	beforeEach(async () => {
		serveCommand = new ServeCommand();
		mockPrompts = vi.mocked(await import('@clack/prompts'));
		mockFs = vi.mocked(await import('node:fs'));
		mockConfig = vi.mocked(await import('../../../../src/lib/config'));
		
		vi.clearAllMocks();
		
		// Default mock implementations
		mockFs.existsSync.mockReturnValue(true);
		mockConfig.getExecutionMode.mockReturnValue('dev');
		mockConfig.getSseScriptPath.mockReturnValue('/path/to/sse.ts');
		
		// Mock a successful spawn process
		(global.Bun.spawn as any).mockReturnValue({
			stdout: { getReader: () => ({ read: () => Promise.resolve({ done: true, value: undefined }) }) },
			stderr: { getReader: () => ({ read: () => Promise.resolve({ done: true, value: undefined }) }) },
			exited: Promise.resolve(0)
		});
	});

	it('shows welcoming banner when starting server', async () => {
		const result = await serveCommand.run(['--port', '8080']);
		
		expect(mockPrompts.intro).toHaveBeenCalledWith('Start SSE Server');
		expect(mockPrompts.log.step).toHaveBeenCalledWith(
			expect.stringContaining('MCPLAND BANNER')
		);
		expect(result).toBe(0);
	});

	it('uses default port when none specified', async () => {
		await serveCommand.run([]);
		
		expect(mockPrompts.log.message).toHaveBeenCalledWith('Port: 1337');
		expect(global.Bun.spawn).toHaveBeenCalledWith(
			['bun', '/path/to/sse.ts'],
			expect.objectContaining({
				env: expect.objectContaining({
					MCPLAND_SSE_PORT: '1337'
				})
			})
		);
	});

	it('uses custom port when user specifies it', async () => {
		await serveCommand.run(['--port', '3000']);
		
		expect(mockPrompts.log.message).toHaveBeenCalledWith('Port: 3000');
		expect(global.Bun.spawn).toHaveBeenCalledWith(
			['bun', '/path/to/sse.ts'],
			expect.objectContaining({
				env: expect.objectContaining({
					MCPLAND_SSE_PORT: '3000'
				})
			})
		);
	});

	it('accepts short port flag', async () => {
		await serveCommand.run(['-p', '4000']);
		
		expect(mockPrompts.log.message).toHaveBeenCalledWith('Port: 4000');
	});

	it('shows current execution mode and script path', async () => {
		mockConfig.getExecutionMode.mockReturnValue('prod');
		mockConfig.getSseScriptPath.mockReturnValue('/node_modules/mcpland/sse.js');
		
		await serveCommand.run([]);
		
		expect(mockPrompts.log.step).toHaveBeenCalledWith(
			expect.stringContaining('Running in prod mode')
		);
		expect(mockPrompts.log.message).toHaveBeenCalledWith(
			'Source: /node_modules/mcpland/sse.js'
		);
	});
});

describe('Serve command validates user input properly', () => {
	let serveCommand: ServeCommand;
	let mockPrompts: any;

	beforeEach(async () => {
		serveCommand = new ServeCommand();
		mockPrompts = vi.mocked(await import('@clack/prompts'));
		vi.clearAllMocks();
	});

	it('rejects invalid port numbers', async () => {
		const result = await serveCommand.run(['--port', '0']);
		
		expect(result).toBe(1);
		expect(mockPrompts.log.error).toHaveBeenCalledWith(
			expect.stringContaining('Invalid port number. Port must be between 1 and 65535.')
		);
	});

	it('rejects port numbers that are too high', async () => {
		const result = await serveCommand.run(['--port', '99999']);
		
		expect(result).toBe(1);
		expect(mockPrompts.log.error).toHaveBeenCalledWith(
			expect.stringContaining('Invalid port number. Port must be between 1 and 65535.')
		);
	});

	it('rejects non-numeric port values', async () => {
		const result = await serveCommand.run(['--port', 'not-a-number']);
		
		expect(result).toBe(1);
		// The error is caught by the outer try-catch and shows as a general server start error
		// because parseArgs throws an error for invalid numbers before reaching port validation
		expect(mockPrompts.log.error).toHaveBeenCalledWith(
			expect.stringContaining('Failed to start SSE server')
		);
	});

	it('accepts valid port numbers at boundaries', async () => {
		const mockFs = vi.mocked(await import('node:fs'));
		const mockConfig = vi.mocked(await import('../../../../src/lib/config'));
		
		mockFs.existsSync.mockReturnValue(true);
		mockConfig.getExecutionMode.mockReturnValue('dev');
		mockConfig.getSseScriptPath.mockReturnValue('/path/to/sse.ts');
		
		(global.Bun.spawn as any).mockReturnValue({
			stdout: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) },
			stderr: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) },
			exited: Promise.resolve(0)
		});
		
		// Test minimum valid port
		let result = await serveCommand.run(['--port', '1']);
		expect(result).toBe(0);
		
		// Test maximum valid port
		result = await serveCommand.run(['--port', '65535']);
		expect(result).toBe(0);
	});
});

describe('Serve command handles environment and file system issues', () => {
	let serveCommand: ServeCommand;
	let mockPrompts: any;
	let mockFs: any;
	let mockConfig: any;

	beforeEach(async () => {
		serveCommand = new ServeCommand();
		mockPrompts = vi.mocked(await import('@clack/prompts'));
		mockFs = vi.mocked(await import('node:fs'));
		mockConfig = vi.mocked(await import('../../../../src/lib/config'));
		
		vi.clearAllMocks();
	});

	it('shows helpful error when SSE script is missing in dev mode', async () => {
		mockFs.existsSync.mockReturnValue(false);
		mockConfig.getExecutionMode.mockReturnValue('dev');
		mockConfig.getSseScriptPath.mockReturnValue('/missing/sse.ts');
		
		const result = await serveCommand.run([]);
		
		expect(result).toBe(1);
		expect(mockPrompts.log.error).toHaveBeenCalledWith(
			expect.stringContaining('SSE script not found at: /missing/sse.ts')
		);
	});

	it('shows helpful error with install instructions in prod mode', async () => {
		mockFs.existsSync.mockReturnValue(false);
		mockConfig.getExecutionMode.mockReturnValue('prod');
		mockConfig.getSseScriptPath.mockReturnValue('/missing/sse.js');
		
		const result = await serveCommand.run([]);
		
		expect(result).toBe(1);
		expect(mockPrompts.log.error).toHaveBeenCalledWith(
			expect.stringContaining('Make sure mcpland is installed as a dependency')
		);
	});

	it('handles spawn process failures gracefully', async () => {
		mockFs.existsSync.mockReturnValue(true);
		mockConfig.getExecutionMode.mockReturnValue('dev');
		mockConfig.getSseScriptPath.mockReturnValue('/path/to/sse.ts');
		
		// Mock spawn throwing an error
		(global.Bun.spawn as any).mockImplementation(() => {
			throw new Error('Spawn failed');
		});
		
		const result = await serveCommand.run([]);
		
		expect(result).toBe(1);
		expect(mockPrompts.log.error).toHaveBeenCalledWith(
			expect.stringContaining('Failed to start SSE server')
		);
	});

	it('finds bun executable in system PATH', async () => {
		mockFs.existsSync.mockReturnValue(true);
		mockConfig.getExecutionMode.mockReturnValue('dev');
		mockConfig.getSseScriptPath.mockReturnValue('/path/to/sse.ts');
		
		(global.Bun.which as any).mockReturnValue('/usr/local/bin/bun');
		(global.Bun.spawn as any).mockReturnValue({
			stdout: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) },
			stderr: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) },
			exited: Promise.resolve(0)
		});
		
		await serveCommand.run([]);
		
		expect(global.Bun.spawn).toHaveBeenCalledWith(
			['/usr/local/bin/bun', '/path/to/sse.ts'],
			expect.any(Object)
		);
	});

	it('falls back to default bun when not found in PATH', async () => {
		mockFs.existsSync.mockReturnValue(true);
		mockConfig.getExecutionMode.mockReturnValue('dev');
		mockConfig.getSseScriptPath.mockReturnValue('/path/to/sse.ts');
		
		(global.Bun.which as any).mockReturnValue(null);
		(global.Bun.spawn as any).mockReturnValue({
			stdout: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) },
			stderr: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) },
			exited: Promise.resolve(0)
		});
		
		await serveCommand.run([]);
		
		expect(global.Bun.spawn).toHaveBeenCalledWith(
			['bun', '/path/to/sse.ts'],
			expect.any(Object)
		);
	});
});

describe('Serve command manages server process lifecycle', () => {
	let serveCommand: ServeCommand;
	let mockFs: any;
	let mockConfig: any;

	beforeEach(async () => {
		serveCommand = new ServeCommand();
		mockFs = vi.mocked(await import('node:fs'));
		mockConfig = vi.mocked(await import('../../../../src/lib/config'));
		
		vi.clearAllMocks();
		
		mockFs.existsSync.mockReturnValue(true);
		mockConfig.getExecutionMode.mockReturnValue('dev');
		mockConfig.getSseScriptPath.mockReturnValue('/path/to/sse.ts');
	});

	it('streams server output to console', async () => {
		const mockStdoutReader = {
			read: vi.fn()
				.mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('Server starting...\n') })
				.mockResolvedValueOnce({ done: true, value: undefined })
		};
		
		const mockStderrReader = {
			read: vi.fn()
				.mockResolvedValueOnce({ done: false, value: new TextEncoder().encode('Warning: something\n') })
				.mockResolvedValueOnce({ done: true, value: undefined })
		};
		
		(global.Bun.spawn as any).mockReturnValue({
			stdout: { getReader: () => mockStdoutReader },
			stderr: { getReader: () => mockStderrReader },
			exited: Promise.resolve(0)
		});
		
		const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		
		const result = await serveCommand.run([]);
		
		// Wait a bit for async streams to process
		await new Promise(resolve => setTimeout(resolve, 10));
		
		expect(result).toBe(0);
		expect(stdoutSpy).toHaveBeenCalledWith('Server starting...\n');
		expect(stderrSpy).toHaveBeenCalledWith('Warning: something\n');
		
		stdoutSpy.mockRestore();
		stderrSpy.mockRestore();
	});

	it('returns server exit code', async () => {
		(global.Bun.spawn as any).mockReturnValue({
			stdout: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) },
			stderr: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) },
			exited: Promise.resolve(42) // Custom exit code
		});
		
		const result = await serveCommand.run([]);
		
		expect(result).toBe(42);
	});

	it('handles stream reading errors gracefully', async () => {
		const mockPrompts = vi.mocked(await import('@clack/prompts'));
		
		const mockStdoutReader = {
			read: vi.fn().mockRejectedValue(new Error('Stream error'))
		};
		
		(global.Bun.spawn as any).mockReturnValue({
			stdout: { getReader: () => mockStdoutReader },
			stderr: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) },
			exited: Promise.resolve(0)
		});
		
		const result = await serveCommand.run([]);
		
		expect(result).toBe(0);
		expect(mockPrompts.log.error).toHaveBeenCalledWith(
			expect.stringContaining('Error reading stdout')
		);
	});

	it('passes environment variables to spawned process', async () => {
		process.env.CUSTOM_VAR = 'test-value';
		
		(global.Bun.spawn as any).mockReturnValue({
			stdout: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) },
			stderr: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) },
			exited: Promise.resolve(0)
		});
		
		await serveCommand.run(['--port', '5000']);
		
		expect(global.Bun.spawn).toHaveBeenCalledWith(
			['bun', '/path/to/sse.ts'],
			expect.objectContaining({
				env: expect.objectContaining({
					CUSTOM_VAR: 'test-value',
					MCPLAND_SSE_PORT: '5000'
				})
			})
		);
		
		delete process.env.CUSTOM_VAR;
	});

	it('handles stderr reading errors gracefully', async () => {
		const mockPrompts = vi.mocked(await import('@clack/prompts'));
		const mockFs = vi.mocked(await import('node:fs'));
		const mockConfig = vi.mocked(await import('../../../../src/lib/config'));
		
		mockFs.existsSync.mockReturnValue(true);
		mockConfig.getExecutionMode.mockReturnValue('dev');
		mockConfig.getSseScriptPath.mockReturnValue('/path/to/sse.ts');
		
		const mockStderrReader = {
			read: vi.fn().mockRejectedValue(new Error('Stderr read error'))
		};
		
		(global.Bun.spawn as any).mockReturnValue({
			stdout: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) },
			stderr: { getReader: () => mockStderrReader },
			exited: Promise.resolve(0)
		});
		
		const result = await serveCommand.run([]);
		
		expect(result).toBe(0);
		expect(mockPrompts.log.error).toHaveBeenCalledWith(
			expect.stringContaining('Error reading stderr')
		);
	});

	it('sets up signal handlers for graceful shutdown', async () => {
		const mockFs = vi.mocked(await import('node:fs'));
		const mockConfig = vi.mocked(await import('../../../../src/lib/config'));
		const mockPrompts = vi.mocked(await import('@clack/prompts'));
		
		mockFs.existsSync.mockReturnValue(true);
		mockConfig.getExecutionMode.mockReturnValue('dev');
		mockConfig.getSseScriptPath.mockReturnValue('/path/to/sse.ts');
		
		const mockProcess = {
			kill: vi.fn(),
			exited: Promise.resolve(0),
			stdout: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) },
			stderr: { getReader: () => ({ read: () => Promise.resolve({ done: true }) }) }
		};
		
		(global.Bun.spawn as any).mockReturnValue(mockProcess);
		
		// Mock process.on to capture handlers
		const originalOn = process.on;
		const signalHandlers: Record<string | symbol, (...args: any[]) => void> = {};
		const processSpy = vi.spyOn(process, 'on').mockImplementation((event: string | symbol, listener: (...args: any[]) => void) => {
			signalHandlers[event] = listener;
			return process;
		});
		
		// Mock process.exit to avoid actually exiting
		const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
		
		await serveCommand.run([]);
		
		// Verify signal handlers were set up
		expect(processSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
		expect(processSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
		
		// Test SIGINT handler
		if (signalHandlers.SIGINT) {
			signalHandlers.SIGINT();
			expect(mockPrompts.log.step).toHaveBeenCalledWith(
				expect.stringContaining('Shutting down SSE server...')
			);
			expect(mockProcess.kill).toHaveBeenCalled();
			expect(exitSpy).toHaveBeenCalledWith(0);
		}
		
		// Test SIGTERM handler
		if (signalHandlers.SIGTERM) {
			
			signalHandlers.SIGTERM();
			expect(mockPrompts.log.step).toHaveBeenCalledWith(
				expect.stringContaining('Shutting down SSE server...')
			);
			expect(mockProcess.kill).toHaveBeenCalled();
			expect(exitSpy).toHaveBeenCalledWith(0);
		}
		
		// Cleanup
		processSpy.mockRestore();
		exitSpy.mockRestore();
	});
});
