import figlet from 'figlet';
import pc from 'picocolors';

import { existsSync } from 'node:fs';

import { intro, log } from '@clack/prompts';

import { getExecutionMode, getSseScriptPath } from '../../lib/config';
import { McpLandCommand } from '../command';

export class ServeCommand extends McpLandCommand {
	constructor() {
		super('serve', 'Start MCPLand SSE server');

		// Define options for this command
		this.defineOption({
			name: 'port',
			alias: 'p',
			type: 'number',
			description: 'Port to run the SSE server on',
			default: 1337,
		});
	}

	async run(args: string[], _cli: any = {}): Promise<number> {
		const banner = figlet.textSync('MCPLAND', { font: 'Sub-Zero' });
		log.step(pc.greenBright(banner));

		intro('Start SSE Server');

		try {
			const parsed = this.parseArgs(args);
			const port = parsed.port as number;

			// Validate port
			if (isNaN(port) || port < 1 || port > 65535) {
				log.error(
					pc.red('Invalid port number. Port must be between 1 and 65535.')
				);
				return 1;
			}

			const mode = getExecutionMode();
			const sseScriptPath = getSseScriptPath();

			log.step(pc.cyan(`Running in ${mode} mode`));
			log.message(`Source: ${sseScriptPath}`);
			log.message(`Port: ${port}`);

			// Check if the script exists
			if (!existsSync(sseScriptPath)) {
				log.error(pc.red(`SSE script not found at: ${sseScriptPath}`));
				if (mode === 'prod') {
					log.error(
						pc.red(
							'Make sure mcpland is installed as a dependency (npm install mcpland)'
						)
					);
				}
				return 1;
			}

			// Spawn the SSE server as a separate process using Bun
			const bunBin = Bun.which('bun') ?? 'bun';
			const sseProcess = Bun.spawn([bunBin, sseScriptPath], {
				stdout: 'pipe',
				stderr: 'pipe',
				env: {
					...process.env,
					// Pass the port to the SSE server via environment variable
					MCPLAND_SSE_PORT: port.toString(),
				},
			});

			// Stream stdout to console
			const decoder = new TextDecoder();
			const reader = sseProcess.stdout.getReader();

			// Handle stdout streaming
			(async () => {
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;

						const text = decoder.decode(value, { stream: true });
						process.stdout.write(text);
					}
				} catch (error) {
					log.error(
						pc.red(`Error reading stdout: ${JSON.stringify(error, null, 2)}`)
					);
				}
			})();

			// Stream stderr to console
			const errorReader = sseProcess.stderr.getReader();
			(async () => {
				try {
					while (true) {
						const { done, value } = await errorReader.read();
						if (done) break;

						const text = decoder.decode(value, { stream: true });
						process.stderr.write(text);
					}
				} catch (error) {
					log.error(
						pc.red(`Error reading stderr: ${JSON.stringify(error, null, 2)}`)
					);
				}
			})();

			// Handle process termination
			const handleExit = () => {
				log.step(pc.yellow('\nShutting down SSE server...'));
				sseProcess.kill();
				process.exit(0);
			};

			process.on('SIGINT', handleExit);
			process.on('SIGTERM', handleExit);

			// Wait for the process to exit
			const exitCode = await sseProcess.exited;
			return exitCode;
		} catch (error) {
			log.error(
				pc.red(`Failed to start SSE server: ${JSON.stringify(error, null, 2)}`)
			);
			return 1;
		}
	}
}
