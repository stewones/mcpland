import { McpLandCommand } from '../command';

export class HelpCommand extends McpLandCommand {
	constructor() { super('help', 'Show help for commands'); }

	aliases(): string[] { return ['--help', '-h', 'help', '']; }

	async run(_args: string[], cli: { getProgramName(): string; getCommands(): McpLandCommand[] }): Promise<number> {
		const program = cli.getProgramName();
		console.log(`Usage: ${program} <command>`);
		console.log('');
		console.log('Commands:');
		const commands = cli.getCommands();
		for (const cmd of commands) {
			const line = cmd.description
				? `  ${cmd.name.padEnd(12)} ${cmd.description}`
				: `  ${cmd.name}`;
			console.log(line);
		}
		return 0;
	}
}


