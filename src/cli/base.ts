import pc from 'picocolors';

import pkg from '../../package.json';
import { McpLandCommand } from './command';
import { InitCommand } from './commands/init';
import { LinkCommand } from './commands/link';
import { NewCommand } from './commands/new';
import { ServeCommand } from './commands/serve';

export type McpLandCliOptions = {
	name?: string;
	version?: string;
};

export class McpLandCli {
	private readonly commands = new Map<string, McpLandCommand>();
	private readonly options?: McpLandCliOptions;

	constructor(options?: McpLandCliOptions) {
		this.options = options;
	}

	addCommand(command: McpLandCommand) {
		this.commands.set(command.name, command);
		for (const alias of command.aliases()) this.commands.set(alias, command);
		return this;
	}

	getProgramName() {
		return this.options?.name ?? 'mcp';
	}

	getCommands(): McpLandCommand[] {
		const set = new Set<McpLandCommand>();
		for (const [, cmd] of this.commands) set.add(cmd);
		return Array.from(set.values());
	}

	printGlobalHelp(): void {
		const program = this.getProgramName();
		console.log(`Usage: ${program} <command> [options]`);
		console.log('');
		console.log('Global options:');
		console.log('  --version, -v        Show version number');
		console.log('  --help, -h           Show this help message');
		console.log('');
		console.log('Commands:');
		const commands = this.getCommands();
		for (const cmd of commands) {
			const line = cmd.description
				? `  ${cmd.name.padEnd(12)} ${cmd.description}`
				: `  ${cmd.name}`;
			console.log(line);
		}
		console.log('');
		console.log(
			`Run '${program} <command> --help' for more information on a specific command.`
		);
	}

	async run(argv: string[] = process.argv.slice(2)): Promise<number> {
		// Handle global --version flag
		if (argv.includes('--version') || argv.includes('-v')) {
			console.log(this.options?.version ?? '0.0.0');
			return 0;
		}

		const [cmdName, ...args] = argv;

		// Handle global --help flag (only when no command is specified)
		if (!cmdName && (argv.includes('--help') || argv.includes('-h'))) {
			this.printGlobalHelp();
			return 0;
		}

		const lookup = cmdName ?? '';
		const cmd = this.commands.get(lookup);
		if (!cmd) {
			// No command found, show help
			console.log(pc.red(`Command not found: ${lookup}`));
			this.printGlobalHelp();
			return 1;
		}
		try {
			return await cmd.run(args, this);
		} catch (err) {
			console.error(pc.red(`Command failed: ${String(err)}`));
			// If it's a help-related error, show command help
			if (
				String(err).includes('Unknown option') ||
				String(err).includes('requires a value') ||
				String(err).includes('missing')
			) {
				console.log('');
				cmd.printHelp();
			}
			return 1;
		}
	}
}

const cli = new McpLandCli({ name: 'mcp', version: pkg.version });

cli
	.addCommand(new InitCommand())
	.addCommand(new NewCommand())
	.addCommand(new ServeCommand())
	.addCommand(new LinkCommand());

export { cli };
