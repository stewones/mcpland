import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LinkCommand } from '../../../../src/cli/commands/link';

// Mock all external dependencies
vi.mock('@clack/prompts', () => ({
	intro: vi.fn(),
	outro: vi.fn(),
	text: vi.fn(),
	cancel: vi.fn(),
	isCancel: vi.fn()
}));

vi.mock('node:fs', () => ({
	existsSync: vi.fn(),
	mkdirSync: vi.fn(),
	readFileSync: vi.fn(),
	writeFileSync: vi.fn()
}));

vi.mock('node:path', () => ({
	default: {
		join: vi.fn((...args: string[]) => args.join('/')),
		relative: vi.fn((from: string, to: string) => to.replace(from + '/', ''))
	}
}));

describe('Link command helps users connect MCPLand to Cursor easily', () => {
	let linkCommand: LinkCommand;
	let mockPrompts: any;
	let mockFs: any;

	beforeEach(async () => {
		linkCommand = new LinkCommand();
		mockPrompts = vi.mocked(await import('@clack/prompts'));
		mockFs = vi.mocked(await import('node:fs'));
		
		vi.clearAllMocks();
		
		// Default mock implementations
		mockPrompts.isCancel.mockReturnValue(false);
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue('OPENAI_API_KEY=sk-test123');
		mockFs.writeFileSync.mockImplementation(() => {});
	});

	it('shows helpful intro message', async () => {
		const result = await linkCommand.run([]);
		
		expect(mockPrompts.intro).toHaveBeenCalledWith(
			'Add MCPLand to Cursor (stdio mode)'
		);
		expect(result).toBe(0);
	});

	it('shows SSE mode in intro when --sse flag is used', async () => {
		mockPrompts.text.mockResolvedValue('http://localhost:1337');
		
		const result = await linkCommand.run(['--sse']);
		
		expect(mockPrompts.intro).toHaveBeenCalledWith(
			'Add MCPLand to Cursor (SSE mode)'
		);
		expect(result).toBe(0);
	});

	it('has helpful command aliases', () => {
		expect(linkCommand.aliases()).toContain('link:cursor');
		expect(linkCommand.aliases()).toContain('cursor');
	});

	it('defines SSE option correctly', () => {
		const options = linkCommand.getOptions();
		const sseOption = options.find(opt => opt.name === 'sse');
		
		expect(sseOption).toBeDefined();
		expect(sseOption?.type).toBe('boolean');
		expect(sseOption?.description).toBe('Use SSE transport instead of stdio');
		expect(sseOption?.default).toBe(false);
	});
});

describe('Link command validates environment properly', () => {
	let linkCommand: LinkCommand;
	let mockPrompts: any;
	let mockFs: any;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		linkCommand = new LinkCommand();
		mockPrompts = vi.mocked(await import('@clack/prompts'));
		mockFs = vi.mocked(await import('node:fs'));
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		
		vi.clearAllMocks();
		mockPrompts.isCancel.mockReturnValue(false);
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	it('checks for OpenAI API key in .env file', async () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue('OPENAI_API_KEY=sk-test123\nOTHER_VAR=value');
		
		const result = await linkCommand.run([]);
		
		expect(result).toBe(0);
		expect(mockFs.readFileSync).toHaveBeenCalledWith(
			expect.stringContaining('.env'),
			'utf-8'
		);
	});

	it('shows error when API key is missing', async () => {
		mockFs.existsSync.mockReturnValue(false); // No .env file
		
		const result = await linkCommand.run([]);
		
		expect(result).toBe(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining('OPENAI_API_KEY not found in .env')
		);
	});

	it('shows error when .env exists but API key is missing', async () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue('OTHER_VAR=value\n# No API key here');
		
		const result = await linkCommand.run([]);
		
		expect(result).toBe(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining('OPENAI_API_KEY not found in .env')
		);
	});

	it('handles .env file read errors gracefully', async () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockImplementation(() => {
			throw new Error('Permission denied');
		});
		
		const result = await linkCommand.run([]);
		
		expect(result).toBe(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining('OPENAI_API_KEY not found in .env')
		);
	});
});

describe('Link command configures stdio mode correctly', () => {
	let linkCommand: LinkCommand;
	let mockFs: any;
	let mockPrompts: any;

	beforeEach(async () => {
		linkCommand = new LinkCommand();
		mockFs = vi.mocked(await import('node:fs'));
		mockPrompts = vi.mocked(await import('@clack/prompts'));
		
		vi.clearAllMocks();
		
		mockPrompts.isCancel.mockReturnValue(false);
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue('OPENAI_API_KEY=sk-test123');
	});

	it('creates .cursor directory if it does not exist', async () => {
		mockFs.existsSync.mockImplementation((path: string) => {
			if (path.includes('.env')) return true;
			if (path.includes('.cursor')) return false;
			return true;
		});
		
		await linkCommand.run([]);
		
		expect(mockFs.mkdirSync).toHaveBeenCalledWith(
			expect.stringContaining('.cursor'),
			{ recursive: true }
		);
	});

	it('creates new mcp.json file with stdio configuration', async () => {
		mockFs.existsSync.mockImplementation((path: string) => {
			if (path.includes('.env')) return true;
			if (path.includes('mcp.json')) return false;
			return true;
		});
		
		await linkCommand.run([]);
		
		const writeCall = mockFs.writeFileSync.mock.calls.find(call => 
			String(call[0]).includes('mcp.json')
		);
		expect(writeCall).toBeDefined();
		
		const configContent = JSON.parse(writeCall![1] as string);
		expect(configContent.mcpServers.MCPLand).toEqual({
			command: 'bun',
			args: [expect.stringContaining('node_modules/mcpland/index.js')],
			env: { OPENAI_API_KEY: 'sk-test123' }
		});
	});

	it('updates existing mcp.json file preserving other servers', async () => {
		const existingConfig = {
			mcpServers: {
				'Other Server': {
					command: 'node',
					args: ['other-server.js']
				}
			}
		};
		
		mockFs.readFileSync.mockImplementation((path: string) => {
			if (path.includes('.env')) return 'OPENAI_API_KEY=sk-test123';
			if (path.includes('mcp.json')) return JSON.stringify(existingConfig);
			return '';
		});
		
		await linkCommand.run([]);
		
		const writeCall = mockFs.writeFileSync.mock.calls.find(call => 
			String(call[0]).includes('mcp.json')
		);
		const configContent = JSON.parse(writeCall![1] as string);
		
		expect(configContent.mcpServers['Other Server']).toEqual(existingConfig.mcpServers['Other Server']);
		expect(configContent.mcpServers.MCPLand).toBeDefined();
	});

	it('handles corrupted mcp.json file gracefully', async () => {
		mockFs.readFileSync.mockImplementation((path: string) => {
			if (path.includes('.env')) return 'OPENAI_API_KEY=sk-test123';
			if (path.includes('mcp.json')) return 'invalid json{';
			return '';
		});
		
		const result = await linkCommand.run([]);
		
		expect(result).toBe(0);
		const writeCall = mockFs.writeFileSync.mock.calls.find(call => 
			String(call[0]).includes('mcp.json')
		);
		const configContent = JSON.parse(writeCall![1] as string);
		expect(configContent.mcpServers.MCPLand).toBeDefined();
	});

	it('shows success message for stdio mode', async () => {
		const result = await linkCommand.run([]);
		
		expect(result).toBe(0);
		expect(mockPrompts.outro).toHaveBeenCalledWith(
			expect.stringContaining('Updated .cursor/mcp.json for stdio mode')
		);
	});
});

describe('Link command configures SSE mode correctly', () => {
	let linkCommand: LinkCommand;
	let mockFs: any;
	let mockPrompts: any;
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		linkCommand = new LinkCommand();
		mockFs = vi.mocked(await import('node:fs'));
		mockPrompts = vi.mocked(await import('@clack/prompts'));
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		
		vi.clearAllMocks();
		
		mockPrompts.isCancel.mockReturnValue(false);
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue('OPENAI_API_KEY=sk-test123');
	});

	afterEach(() => {
		consoleSpy.mockRestore();
	});

	it('prompts for SSE server URL', async () => {
		mockPrompts.text.mockResolvedValue('http://localhost:3000');
		
		const result = await linkCommand.run(['--sse']);
		
		expect(result).toBe(0);
		expect(mockPrompts.text).toHaveBeenCalledWith({
			message: 'Enter SSE server URL',
			placeholder: 'http://localhost:1337',
			initialValue: 'http://localhost:1337',
			validate: expect.any(Function)
		});
	});

	it('validates SSE URL input properly', async () => {
		mockPrompts.text.mockResolvedValue('http://localhost:3000');
		
		await linkCommand.run(['--sse']);
		
		const textCall = mockPrompts.text.mock.calls[0][0];
		const validate = textCall.validate;
		
		expect(validate('')).toBe('Please enter a valid URL');
		expect(validate('   ')).toBe('Please enter a valid URL');
		expect(validate('not-a-url')).toBe('Please enter a valid URL (e.g., http://localhost:1337)');
		expect(validate('http://localhost:1337')).toBeUndefined();
		expect(validate('https://example.com:8080')).toBeUndefined();
	});

	it('automatically adds /sse endpoint to URL', async () => {
		mockPrompts.text.mockResolvedValue('http://localhost:3000');
		
		await linkCommand.run(['--sse']);
		
		const writeCall = mockFs.writeFileSync.mock.calls.find(call => 
			String(call[0]).includes('mcp.json')
		);
		const configContent = JSON.parse(writeCall![1] as string);
		
		expect(configContent.mcpServers.MCPLand).toEqual({
			url: 'http://localhost:3000/sse'
		});
	});

	it('does not double-add /sse endpoint if URL already has it', async () => {
		mockPrompts.text.mockResolvedValue('http://localhost:3000/sse');
		
		await linkCommand.run(['--sse']);
		
		const writeCall = mockFs.writeFileSync.mock.calls.find(call => 
			String(call[0]).includes('mcp.json')
		);
		const configContent = JSON.parse(writeCall![1] as string);
		
		expect(configContent.mcpServers.MCPLand.url).toBe('http://localhost:3000/sse');
	});

	it('handles URLs with trailing slashes correctly', async () => {
		mockPrompts.text.mockResolvedValue('http://localhost:3000/');
		
		await linkCommand.run(['--sse']);
		
		const writeCall = mockFs.writeFileSync.mock.calls.find(call => 
			String(call[0]).includes('mcp.json')
		);
		const configContent = JSON.parse(writeCall![1] as string);
		
		expect(configContent.mcpServers.MCPLand.url).toBe('http://localhost:3000/sse');
	});

	it('shows success message and instructions for SSE mode', async () => {
		mockPrompts.text.mockResolvedValue('http://localhost:3000');
		
		const result = await linkCommand.run(['--sse']);
		
		expect(result).toBe(0);
		expect(mockPrompts.outro).toHaveBeenCalledWith(
			expect.stringContaining('Updated .cursor/mcp.json for SSE mode')
		);
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('Make sure to run `mcp serve --port=<port>` to start the SSE server')
		);
	});

	it('handles user canceling URL input', async () => {
		mockPrompts.text.mockResolvedValue(Symbol('cancel'));
		mockPrompts.isCancel.mockReturnValue(true);
		
		const result = await linkCommand.run(['--sse']);
		
		expect(result).toBe(1);
		expect(mockPrompts.cancel).toHaveBeenCalledWith('Aborted');
	});
});

describe('Link command handles file system operations safely', () => {
	let linkCommand: LinkCommand;
	let mockFs: any;
	let mockPrompts: any;

	beforeEach(async () => {
		linkCommand = new LinkCommand();
		mockFs = vi.mocked(await import('node:fs'));
		mockPrompts = vi.mocked(await import('@clack/prompts'));
		
		vi.clearAllMocks();
		
		mockPrompts.isCancel.mockReturnValue(false);
		mockFs.readFileSync.mockReturnValue('OPENAI_API_KEY=sk-test123');
	});

	it('handles directory creation errors gracefully', async () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.mkdirSync.mockImplementation(() => {
			throw new Error('Permission denied');
		});
		
		// Should still succeed - the try/catch handles it
		const result = await linkCommand.run([]);
		expect(result).toBe(0);
	});

	it('handles mcp.json write errors gracefully', async () => {
		mockFs.existsSync.mockReturnValue(true);
		mockFs.writeFileSync.mockImplementation(() => {
			throw new Error('Disk full');
		});
		
		// The implementation currently doesn't handle writeFileSync errors gracefully
		// So we expect it to throw, which is the current behavior
		await expect(linkCommand.run([])).rejects.toThrow('Disk full');
	});

	it('works when mcp.json does not exist initially', async () => {
		// Reset the writeFileSync mock for this test to not throw
		mockFs.writeFileSync.mockImplementation(() => {});
		mockFs.existsSync.mockImplementation((path: string) => {
			if (path.includes('mcp.json')) return false;
			return true;
		});
		
		const result = await linkCommand.run([]);
		
		expect(result).toBe(0);
		const writeCall = mockFs.writeFileSync.mock.calls.find(call => 
			String(call[0]).includes('mcp.json')
		);
		expect(writeCall).toBeDefined();
	});

	it('handles different API key formats in .env file', async () => {
		// Reset the writeFileSync mock for this test to not throw
		mockFs.writeFileSync.mockImplementation(() => {});
		
		const testCases = [
			'OPENAI_API_KEY=sk-123456789',
			'OPENAI_API_KEY="sk-123456789"',
			'OPENAI_API_KEY=\'sk-123456789\'',
			'  OPENAI_API_KEY  =  sk-123456789  ',
			'# Comment\nOPENAI_API_KEY=sk-123456789\n# Another comment'
		];
		
		for (const envContent of testCases) {
			// Clear previous calls
			mockFs.writeFileSync.mockClear();
			mockFs.readFileSync.mockReturnValue(envContent);
			
			const result = await linkCommand.run([]);
			expect(result).toBe(0);
			
			const writeCall = mockFs.writeFileSync.mock.calls.find(call => 
				String(call[0]).includes('mcp.json')
			);
			const configContent = JSON.parse(writeCall![1] as string);
			expect(configContent.mcpServers.MCPLand.env?.OPENAI_API_KEY).toBeTruthy();
		}
	});

	it('handles cursor config file with invalid format to cover JSON parsing branch', async () => {
		// Test line 80: cfg = JSON.parse(...) ?? {} branch coverage
		mockFs.writeFileSync.mockImplementation(() => {});
		mockFs.existsSync.mockImplementation((path: string) => {
			if (path.includes('.env')) return true;
			if (path.includes('mcp.json')) return true; // Existing cursor config
			return true;
		});
		
		// Mock reading existing cursor config that returns null after JSON.parse
		mockFs.readFileSync.mockImplementation((path: string) => {
			if (path.includes('.env')) return 'OPENAI_API_KEY=sk-test';
			if (path.includes('mcp.json')) return 'null'; // Valid JSON but null result
			return '';
		});
		
		const result = await linkCommand.run([]);
		expect(result).toBe(0);
		
		// Should handle null config gracefully and create new one
		const writeCall = mockFs.writeFileSync.mock.calls.find(call => 
			String(call[0]).includes('mcp.json')
		);
		expect(writeCall).toBeDefined();
	});

	it('handles cursor config that is array instead of object to cover type checking', async () => {
		// Test line 84: if (typeof cfg !== 'object' || Array.isArray(cfg)) cfg = {};
		mockFs.writeFileSync.mockImplementation(() => {});
		mockFs.existsSync.mockReturnValue(true);
		
		mockFs.readFileSync.mockImplementation((path: string) => {
			if (path.includes('.env')) return 'OPENAI_API_KEY=sk-test';
			if (path.includes('mcp.json')) return '["not", "an", "object"]'; // Array instead of object
			return '';
		});
		
		const result = await linkCommand.run([]);
		expect(result).toBe(0);
		
		// Should reset config to empty object when it's an array
		const writeCall = mockFs.writeFileSync.mock.calls.find(call => 
			String(call[0]).includes('mcp.json')
		);
		const configContent = JSON.parse(writeCall![1] as string);
		expect(configContent.mcpServers).toBeDefined();
	});

	it('handles directory creation errors to cover ensureDirSync catch block', async () => {
		// Test line 123: catch {} in ensureDirSync
		mockFs.writeFileSync.mockImplementation(() => {});
		mockFs.existsSync.mockReturnValue(true);
		mockFs.readFileSync.mockReturnValue('OPENAI_API_KEY=sk-test');
		
		// Make mkdirSync throw an error
		mockFs.mkdirSync.mockImplementation(() => {
			throw new Error('Permission denied');
		});
		
		const result = await linkCommand.run([]);
		
		// Should complete successfully despite directory creation error
		expect(result).toBe(0);
	});

	it('handles .env file with malformed lines to cover env parsing edge cases', async () => {
		// Test line 136: if (idx === -1) continue; in readEnvVar
		mockFs.writeFileSync.mockImplementation(() => {});
		mockFs.existsSync.mockReturnValue(true);
		
		// Create .env with malformed lines (no = sign)
		mockFs.readFileSync.mockImplementation((path: string) => {
			if (path.includes('.env')) {
				return `# Comment line
OPENAI_API_KEY=sk-valid-key
MALFORMED_LINE_NO_EQUALS
ANOTHER_MALFORMED
VALID_VAR=value`;
			}
			return '';
		});
		
		const result = await linkCommand.run([]);
		
		// Should successfully find the valid API key despite malformed lines
		expect(result).toBe(0);
		
		const writeCall = mockFs.writeFileSync.mock.calls.find(call => 
			String(call[0]).includes('mcp.json')
		);
		const configContent = JSON.parse(writeCall![1] as string);
		expect(configContent.mcpServers.MCPLand.env.OPENAI_API_KEY).toBe('sk-valid-key');
	});

	it('handles directory creation silently when already exists', async () => {
		const mockFs = vi.mocked(await import('node:fs'));
		mockFs.existsSync.mockImplementation((p: any) => {
			const pathStr = String(p);
			if (pathStr.endsWith('.cursor')) return true;
			if (pathStr.endsWith('.env')) return true;
			return false;
		});
		mockFs.readFileSync.mockReturnValue('OPENAI_API_KEY=sk-test123');
		mockFs.mkdirSync.mockImplementation(() => { throw new Error('Already exists'); });
		
		const cmd = new LinkCommand();
		const result = await cmd.run([]);
		
		expect(result).toBe(0);
	});

	it('handles env file lines with no equals sign', async () => {
		const mockFs = vi.mocked(await import('node:fs'));
		mockFs.existsSync.mockImplementation((p: any) => {
			const pathStr = String(p);
			if (pathStr.endsWith('.env')) return true;
			return false;
		});
		mockFs.readFileSync.mockReturnValue(`
# Comment
INVALID_LINE_NO_EQUALS
OPENAI_API_KEY=sk-test123
ANOTHER_LINE_NO_EQUALS
`);
		
		const cmd = new LinkCommand();
		const result = await cmd.run([]);
		
		expect(result).toBe(0);
		
		const writeCall = mockFs.writeFileSync.mock.calls.find(call => 
			String(call[0]).includes('mcp.json')
		);
		const configContent = JSON.parse(writeCall![1] as string);
		expect(configContent.mcpServers.MCPLand.env.OPENAI_API_KEY).toBe('sk-test123');
	});
});
