import { McpLandCommand } from '../command';

export class HelpCommand extends McpLandCommand {
	constructor() { super('help', 'Show help for commands'); }

	aliases(): string[] { return ['--help', '-h', 'help']; }

	async run(args: string[], cli: { getProgramName(): string; getCommands(): McpLandCommand[] }): Promise<number> {
		const program = cli.getProgramName();
		
		// Check if asking for help on a specific command
		if (args.length > 0 && !args[0].startsWith('-')) {
			const cmdName = args[0];
			const commands = cli.getCommands();
			const targetCmd = commands.find(cmd => cmd.name === cmdName || cmd.aliases().includes(cmdName));
			
			if (targetCmd) {
				targetCmd.printHelp();
				return 0;
			} else {
				console.log(`Unknown command: ${cmdName}`);
				console.log('');
			}
		}
		
		console.log(`Usage: ${program} <command> [options]`);
		console.log('');
		console.log('Commands:');
		const commands = cli.getCommands();
		for (const cmd of commands) {
			const line = cmd.description
				? `  ${cmd.name.padEnd(12)} ${cmd.description}`
				: `  ${cmd.name}`;
			console.log(line);
		}
		console.log('');
		console.log(`Run '${program} <command> --help' for more information on a specific command.`);
		return 0;
	}
}


