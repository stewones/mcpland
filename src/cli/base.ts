import pc from 'picocolors';

import pkg from '../../package.json';
import { McpLandCommand } from './command';
import { HelpCommand } from './commands/help';
import { InitCommand } from './commands/init';
import { LinkCommand } from './commands/link';
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

	async run(argv: string[] = process.argv.slice(2)): Promise<number> {
		const [cmdName, ...args] = argv;
		const lookup = cmdName ?? '';
		const cmd = this.commands.get(lookup);
		if (!cmd) {
			// run the help command instead
			await this.commands.get('help')?.run(args, this);
			return 1;
		}
		try {
			return await cmd.run(args, this);
		} catch (err) {
			console.error(pc.red(`Command failed: ${String(err)}`));
			return 1;
		}
	}
}

const cli = new McpLandCli({ name: 'mcp', version: pkg.version });

cli
	.addCommand(new HelpCommand())
	.addCommand(new InitCommand())
	.addCommand(new ServeCommand())
	.addCommand(new LinkCommand());

export { cli };
