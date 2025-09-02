import type { McpLandCli } from './base';

export interface CommandOption {
	name: string;
	description: string;
	type: 'string' | 'number' | 'boolean';
	required?: boolean;
	default?: string | number | boolean;
	alias?: string;
}

export interface ParsedArgs {
	_: string[]; // remaining positional args
	[key: string]: string | number | boolean | string[] | undefined;
}

export abstract class McpLandCommand {
	readonly name: string;
	readonly description?: string;
	private _options: CommandOption[] = [];

	constructor(name: string, description?: string) {
		this.name = name;
		this.description = description;
	}

	aliases(): string[] {
		return [];
	}

	// Define options for this command
	protected defineOption(option: CommandOption): this {
		this._options.push(option);
		return this;
	}

	// Get all defined options
	getOptions(): CommandOption[] {
		return [...this._options];
	}

	// Parse command line arguments based on defined options
	protected parseArgs(args: string[]): ParsedArgs {
		const result: ParsedArgs = { _: [] };
		
		// Set defaults
		for (const option of this._options) {
			if (option.default !== undefined) {
				result[option.name] = option.default;
			}
		}

		for (let i = 0; i < args.length; i++) {
			const arg = args[i];
			
			// Handle --help
			if (arg === '--help' || arg === '-h') {
				this.printHelp();
				process.exit(0);
			}

			// Handle long options like --port=1337 or --port 1337
			if (arg.startsWith('--')) {
				const [optName, optValue] = arg.substring(2).split('=', 2);
				const option = this._options.find(opt => opt.name === optName);
				
				if (!option) {
					throw new Error(`Unknown option: --${optName}`);
				}

				let value: string | number | boolean;
				
				if (option.type === 'boolean') {
					value = optValue !== 'false';
				} else if (optValue !== undefined) {
					// Value provided with = syntax
					value = option.type === 'number' ? parseInt(optValue, 10) : optValue;
				} else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
					// Value provided as next argument
					const nextArg = args[++i];
					value = option.type === 'number' ? parseInt(nextArg, 10) : nextArg;
				} else {
					throw new Error(`Option --${optName} requires a value`);
				}

				if (option.type === 'number' && isNaN(value as number)) {
					throw new Error(`Option --${optName} must be a number`);
				}

				result[option.name] = value;
			}
			// Handle short options like -p
			else if (arg.startsWith('-') && arg.length > 1 && !arg.startsWith('--')) {
				const shortName = arg.substring(1);
				const option = this._options.find(opt => opt.alias === shortName);
				
				if (!option) {
					throw new Error(`Unknown option: -${shortName}`);
				}

				let value: string | number | boolean;
				
				if (option.type === 'boolean') {
					value = true;
				} else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
					const nextArg = args[++i];
					value = option.type === 'number' ? parseInt(nextArg, 10) : nextArg;
				} else {
					throw new Error(`Option -${shortName} requires a value`);
				}

				if (option.type === 'number' && isNaN(value as number)) {
					throw new Error(`Option -${shortName} must be a number`);
				}

				result[option.name] = value;
			}
			// Positional argument
			else {
				result._.push(arg);
			}
		}

		// Check required options
		for (const option of this._options) {
			if (option.required && result[option.name] === undefined) {
				throw new Error(`Required option --${option.name} is missing`);
			}
		}

		return result;
	}

	// Generate and print help for this command
	printHelp(): void {
		console.log(`Usage: mcp ${this.name} [options]`);
		console.log('');
		if (this.description) {
			console.log(this.description);
			console.log('');
		}
		
		if (this._options.length > 0) {
			console.log('Options:');
			for (const option of this._options) {
				const flags = [`--${option.name}`];
				if (option.alias) {
					flags.push(`-${option.alias}`);
				}
				
				let flagStr = flags.join(', ');
				if (option.type !== 'boolean') {
					flagStr += ` <${option.type}>`;
				}
				
				let desc = option.description;
				if (option.default !== undefined) {
					desc += ` (default: ${option.default})`;
				}
				if (option.required) {
					desc += ' (required)';
				}
				
				console.log(`  ${flagStr.padEnd(20)} ${desc}`);
			}
			console.log('');
		}
		
		console.log('  --help, -h           Show this help message');
	}

	abstract run(args: string[], cli: McpLandCli): Promise<number>;
}


