import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	type CommandOption,
	McpLandCommand,
	type ParsedArgs,
} from '../../../src/cli/command';

// Test command implementation
class TestCommand extends McpLandCommand {
	public testParseArgs(args: string[]): ParsedArgs {
		return this.parseArgs(args);
	}

	public testDefineOption(option: CommandOption): this {
		return this.defineOption(option);
	}

	async run(): Promise<number> {
		return 0;
	}
}

describe('Command framework helps users understand available options', () => {
	let command: TestCommand;
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: any;

	beforeEach(() => {
		command = new TestCommand('test', 'Test command for option testing');
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
			throw new Error('Process exit called');
		}) as any);
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		exitSpy.mockRestore();
	});

	it('shows helpful command usage when user asks for help', () => {
		command.testDefineOption({
			name: 'port',
			type: 'number',
			description: 'Port to listen on',
			default: 3000
		});

		expect(() => command.testParseArgs(['--help'])).toThrow('Process exit called');
		
		expect(consoleSpy).toHaveBeenCalledWith('Usage: mcp test [options]');
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Test command for option testing'));
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Options:'));
	});

	it('shows option details with types and descriptions', () => {
		command.testDefineOption({
			name: 'port',
			alias: 'p',
			type: 'number',
			description: 'Port to listen on',
			default: 3000,
			required: true
		});

		expect(() => command.testParseArgs(['--help'])).toThrow('Process exit called');
		
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('--port, -p <number>  Port to listen on (default: 3000) (required)')
		);
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('--help, -h           Show this help message')
		);
	});

	it('shows boolean options without type indicators', () => {
		command.testDefineOption({
			name: 'verbose',
			type: 'boolean',
			description: 'Enable verbose output',
			default: false
		});

		expect(() => command.testParseArgs(['-h'])).toThrow('Process exit called');
		
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('--verbose            Enable verbose output (default: false)')
		);
	});
});

describe('Command framework parses user options correctly', () => {
	let command: TestCommand;

	beforeEach(() => {
		command = new TestCommand('test');
	});

	it('parses long options with equals syntax', () => {
		command.testDefineOption({ name: 'port', type: 'number', description: 'Port' });
		
		const result = command.testParseArgs(['--port=8080']);
		
		expect(result.port).toBe(8080);
		expect(result._).toEqual([]);
	});

	it('parses long options with space syntax', () => {
		command.testDefineOption({ name: 'host', type: 'string', description: 'Host' });
		
		const result = command.testParseArgs(['--host', 'localhost']);
		
		expect(result.host).toBe('localhost');
		expect(result._).toEqual([]);
	});

	it('parses short options with values', () => {
		command.testDefineOption({ name: 'port', alias: 'p', type: 'number', description: 'Port' });
		
		const result = command.testParseArgs(['-p', '9000']);
		
		expect(result.port).toBe(9000);
	});

	it('parses boolean options correctly', () => {
		command.testDefineOption({ name: 'verbose', alias: 'v', type: 'boolean', description: 'Verbose' });
		
		const result1 = command.testParseArgs(['--verbose']);
		expect(result1.verbose).toBe(true);
		
		const result2 = command.testParseArgs(['--verbose=false']);
		expect(result2.verbose).toBe(false);
		
		const result3 = command.testParseArgs(['-v']);
		expect(result3.verbose).toBe(true);
	});

	it('applies default values for options not provided by user', () => {
		command.testDefineOption({ 
			name: 'timeout', 
			type: 'number', 
			description: 'Timeout', 
			default: 5000 
		});
		
		const result = command.testParseArgs([]);
		
		expect(result.timeout).toBe(5000);
	});

	it('preserves positional arguments', () => {
		command.testDefineOption({ name: 'flag', type: 'boolean', description: 'Flag' });
		
		const result = command.testParseArgs(['file1.txt', '--flag', 'file2.txt']);
		
		expect(result._).toEqual(['file1.txt', 'file2.txt']);
		expect(result.flag).toBe(true);
	});

	it('handles mixed option formats in same command', () => {
		command.testDefineOption({ name: 'port', alias: 'p', type: 'number', description: 'Port' });
		command.testDefineOption({ name: 'host', type: 'string', description: 'Host' });
		command.testDefineOption({ name: 'verbose', alias: 'v', type: 'boolean', description: 'Verbose' });
		
		const result = command.testParseArgs([
			'input.txt',
			'--port=3000',
			'--host', 'example.com',
			'-v',
			'output.txt'
		]);
		
		expect(result.port).toBe(3000);
		expect(result.host).toBe('example.com');
		expect(result.verbose).toBe(true);
		expect(result._).toEqual(['input.txt', 'output.txt']);
	});

	it('handles string options with equals syntax to cover type checking branch', () => {
		command.testDefineOption({ name: 'name', type: 'string', description: 'Name' });
		command.testDefineOption({ name: 'count', type: 'number', description: 'Count' });
		
		// Test string option with equals syntax (covers line 77 branch)
		const result1 = command.testParseArgs(['--name=John']);
		expect(result1.name).toBe('John');
		
		// Test number option with equals syntax (covers line 77 branch)  
		const result2 = command.testParseArgs(['--count=42']);
		expect(result2.count).toBe(42);
	});

	it('handles short options for strings to cover type checking branch', () => {
		command.testDefineOption({ name: 'file', alias: 'f', type: 'string', description: 'File' });
		command.testDefineOption({ name: 'num', alias: 'n', type: 'number', description: 'Number' });
		
		// Test short string option (covers line 107 branch)
		const result1 = command.testParseArgs(['-f', 'test.txt']);
		expect(result1.file).toBe('test.txt');
		
		// Test short number option (covers line 107 branch)
		const result2 = command.testParseArgs(['-n', '123']);
		expect(result2.num).toBe(123);
	});
});

describe('Command framework validates user input properly', () => {
	let command: TestCommand;

	beforeEach(() => {
		command = new TestCommand('test');
	});

	it('throws helpful error when user provides unknown long option', () => {
		expect(() => {
			command.testParseArgs(['--unknown']);
		}).toThrow('Unknown option: --unknown');
	});

	it('throws helpful error when user provides unknown short option', () => {
		expect(() => {
			command.testParseArgs(['-x']);
		}).toThrow('Unknown option: -x');
	});

	it('throws helpful error when user forgets required option', () => {
		command.testDefineOption({ 
			name: 'config', 
			type: 'string', 
			description: 'Config file', 
			required: true 
		});
		
		expect(() => {
			command.testParseArgs([]);
		}).toThrow('Required option --config is missing');
	});

	it('throws helpful error when user provides option without required value', () => {
		command.testDefineOption({ name: 'port', type: 'number', description: 'Port' });
		
		expect(() => {
			command.testParseArgs(['--port']);
		}).toThrow('Option --port requires a value');
		
		expect(() => {
			command.testParseArgs(['--port', '--other']);
		}).toThrow('Option --port requires a value');
	});

	it('throws helpful error when user provides invalid number', () => {
		command.testDefineOption({ name: 'port', alias: 'p', type: 'number', description: 'Port' });
		
		expect(() => {
			command.testParseArgs(['--port', 'not-a-number']);
		}).toThrow('Option --port must be a number');
		
		expect(() => {
			command.testParseArgs(['-p', 'abc']);
		}).toThrow('Option -p must be a number');
	});

	it('throws helpful error for short option without required value', () => {
		command.testDefineOption({ name: 'file', alias: 'f', type: 'string', description: 'File' });
		
		expect(() => {
			command.testParseArgs(['-f']);
		}).toThrow('Option -f requires a value');
	});
});

describe('Command framework provides useful option information', () => {
	let command: TestCommand;

	beforeEach(() => {
		command = new TestCommand('test', 'A test command');
	});

	it('returns all defined options for introspection', () => {
		const option1 = { name: 'port', type: 'number' as const, description: 'Port' };
		const option2 = { name: 'host', type: 'string' as const, description: 'Host' };
		
		command.testDefineOption(option1);
		command.testDefineOption(option2);
		
		const options = command.getOptions();
		expect(options).toHaveLength(2);
		expect(options).toContain(option1);
		expect(options).toContain(option2);
	});

	it('provides command aliases for flexible usage', () => {
		class AliasCommand extends McpLandCommand {
			aliases() {
				return ['t', 'testing'];
			}
			
			async run(): Promise<number> {
				return 0;
			}
		}
		
		const cmd = new AliasCommand('test');
		expect(cmd.aliases()).toEqual(['t', 'testing']);
	});

	it('has empty aliases by default', () => {
		expect(command.aliases()).toEqual([]);
	});

	it('maintains command name and description', () => {
		expect(command.name).toBe('test');
		expect(command.description).toBe('A test command');
	});
});
