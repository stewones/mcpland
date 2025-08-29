import pc from 'picocolors';

import { intro } from '@clack/prompts';

import { McpLandCommand } from '../command';

export class ServeCommand extends McpLandCommand {
	constructor() {
		super('serve', 'Start MCPLand SSE');
	}

	async run(_args: string[], _cli: any): Promise<number> {
		intro('Start SSE Server');
		console.log(pc.yellow('SSE server is not implemented yet.'));
		return 0;
	}
}
