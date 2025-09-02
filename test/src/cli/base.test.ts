import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { McpLandCli } from '../../../src/cli/base';
import { McpLandCommand } from '../../../src/cli/command';

// Mock command for testing
class TestCommand extends McpLandCommand {
	constructor(name: string, description?: string) {
		super(name, description);
	}

	async run(args: string[]): Promise<number> {
		if (args.includes('--fail')) return 1;
		return 0;
	}
}

describe('CLI shows helpful information to users', () => {
	let cli: McpLandCli;
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		cli = new McpLandCli({ name: 'testcli', version: '1.0.0' });
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleSpy.mockRestore();
	});

	it('shows version when user asks for it with --version', async () => {
		const result = await cli.run(['--version']);
		
		expect(result).toBe(0);
		expect(consoleSpy).toHaveBeenCalledWith('1.0.0');
	});

	it('shows version when user asks for it with -v', async () => {
		const result = await cli.run(['-v']);
		
		expect(result).toBe(0);
		expect(consoleSpy).toHaveBeenCalledWith('1.0.0');
	});

	it('shows help when user asks for it with --help', async () => {
		const result = await cli.run(['--help']);
		
		expect(result).toBe(1); // --help is treated as unknown command
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('Command not found: --help')
		);
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('Usage: testcli <command> [options]')
		);
	});

	it('shows help when user asks for it with -h', async () => {
		const result = await cli.run(['-h']);
		
		expect(result).toBe(1); // -h is treated as unknown command
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('Command not found: -h')
		);
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('Usage: testcli <command> [options]')
		);
	});

	it('shows help when user runs CLI without any commands', async () => {
		const result = await cli.run([]);
		
		expect(result).toBe(1); // No command provided results in empty lookup
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('Command not found:')
		);
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('Usage: testcli <command> [options]')
		);
	});

	it('uses default program name when none provided', () => {
		const defaultCli = new McpLandCli();
		expect(defaultCli.getProgramName()).toBe('mcp');
	});

	it('uses custom program name when provided', () => {
		expect(cli.getProgramName()).toBe('testcli');
	});

	it('shows default version when version not specified in config', async () => {
		const defaultCli = new McpLandCli({ name: 'testcli' }); // No version
		const result = await defaultCli.run(['--version']);
		
		expect(result).toBe(0);
		expect(consoleSpy).toHaveBeenCalledWith('0.0.0');
	});
});

describe('CLI handles commands properly', () => {
	let cli: McpLandCli;
	let consoleSpy: ReturnType<typeof vi.spyOn>;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		cli = new McpLandCli({ name: 'testcli', version: '1.0.0' });
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleSpy.mockRestore();
		consoleErrorSpy.mockRestore();
	});

	it('registers commands and makes them available', () => {
		const testCmd = new TestCommand('test', 'Test command');
		cli.addCommand(testCmd);
		
		const commands = cli.getCommands();
		expect(commands).toHaveLength(1);
		expect(commands[0]).toBe(testCmd);
	});

	it('registers command aliases and makes them work', () => {
		class AliasCommand extends TestCommand {
			aliases() {
				return ['t', 'testing'];
			}
		}
		
		const testCmd = new AliasCommand('test', 'Test command');
		cli.addCommand(testCmd);
		
		const commands = cli.getCommands();
		expect(commands).toHaveLength(1); // Should not duplicate the command
	});

	it('runs the correct command when user provides valid command name', async () => {
		const testCmd = new TestCommand('test', 'Test command');
		cli.addCommand(testCmd);
		
		const result = await cli.run(['test']);
		expect(result).toBe(0);
	});

	it('runs the correct command when user provides valid alias', async () => {
		class AliasCommand extends TestCommand {
			aliases() {
				return ['t'];
			}
		}
		
		const testCmd = new AliasCommand('test', 'Test command');
		cli.addCommand(testCmd);
		
		const result = await cli.run(['t']);
		expect(result).toBe(0);
	});

	it('shows helpful error when user provides unknown command', async () => {
		const result = await cli.run(['nonexistent']);
		
		expect(result).toBe(1);
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('Command not found: nonexistent')
		);
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('Usage: testcli <command> [options]')
		);
	});

	it('shows command help when command fails with option errors', async () => {
		class HelpCommand extends TestCommand {
			printHelp() {
				console.log('Command help shown');
			}
			
			async run(): Promise<number> {
				throw new Error('Unknown option --invalid');
			}
		}
		
		const testCmd = new HelpCommand('test', 'Test command');
		cli.addCommand(testCmd);
		
		const result = await cli.run(['test']);
		expect(result).toBe(1);
		expect(consoleSpy).toHaveBeenCalledWith('Command help shown');
	});

	it('passes command arguments correctly to the command', async () => {
		class ArgsCommand extends TestCommand {
			async run(args: string[]) {
				console.log(`Received args: ${args.join(', ')}`);
				return 0;
			}
		}
		
		const testCmd = new ArgsCommand('test');
		cli.addCommand(testCmd);
		
		await cli.run(['test', '--option', 'value', 'positional']);
		expect(consoleSpy).toHaveBeenCalledWith('Received args: --option, value, positional');
	});
});

describe('CLI displays helpful information about available commands', () => {
	let cli: McpLandCli;
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		cli = new McpLandCli({ name: 'testcli' });
		consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleSpy.mockRestore();
	});

	it('lists all available commands in help output', () => {
		cli.addCommand(new TestCommand('init', 'Initialize a project'));
		cli.addCommand(new TestCommand('serve', 'Start the server'));
		cli.addCommand(new TestCommand('deploy'));
		
		cli.printGlobalHelp();
		
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Commands:'));
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('init         Initialize a project'));
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('serve        Start the server'));
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('deploy'));
	});

	it('shows helpful usage examples in help output', () => {
		cli.addCommand(new TestCommand('test'));
		
		cli.printGlobalHelp();
		
		expect(consoleSpy).toHaveBeenCalledWith('Usage: testcli <command> [options]');
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Run 'testcli <command> --help'"));
	});

	it('shows global options in help output', () => {
		cli.printGlobalHelp();
		
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Global options:'));
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--version, -v        Show version number'));
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--help, -h           Show this help message'));
	});
});

describe('CLI handles errors gracefully', () => {
	let cli: McpLandCli;
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		cli = new McpLandCli();
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	it('catches and reports command execution failures', async () => {
		class FailingCommand extends TestCommand {
			async run(): Promise<number> {
				throw new Error('Something went wrong');
			}
		}
		
		const testCmd = new FailingCommand('test');
		cli.addCommand(testCmd);
		
		const result = await cli.run(['test']);
		expect(result).toBe(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining('Command failed: Error: Something went wrong')
		);
	});

	it('handles non-error exceptions gracefully', async () => {
		class ThrowingCommand extends TestCommand {
			async run(): Promise<number> {
				throw 'String error';
			}
		}
		
		const testCmd = new ThrowingCommand('test');
		cli.addCommand(testCmd);
		
		const result = await cli.run(['test']);
		expect(result).toBe(1);
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining('Command failed: String error')
		);
	});

	it('shows help with no commands when called with empty command name and --help', async () => {
		// Set up console spy for this test
		const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		
		const result = await cli.run(['', '--help']);
		
		expect(result).toBe(0);
		expect(consoleSpy).toHaveBeenCalledWith(
			expect.stringContaining('Usage: mcp <command> [options]')
		);
		
		consoleSpy.mockRestore();
	});
});
