import type { McpLandCli } from './base';

export abstract class McpLandCommand {
	readonly name: string;
	readonly description?: string;

	constructor(name: string, description?: string) {
		this.name = name;
		this.description = description;
	}

	aliases(): string[] {
		return [];
	}

	abstract run(args: string[], cli: McpLandCli): Promise<number>;
}


