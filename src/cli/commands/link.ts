import pc from 'picocolors';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { cancel, intro, isCancel, outro, text } from '@clack/prompts';

import { McpLandCommand } from '../command';

export class LinkCommand extends McpLandCommand {
	constructor() {
		super('link', 'Configure Cursor link');
		
		// Define options for this command
		this.defineOption({
			name: 'sse',
			type: 'boolean',
			description: 'Use SSE transport instead of stdio',
			default: false
		});
	}

	aliases(): string[] {
		return ['link:cursor', 'cursor'];
	}

	async run(args: string[], _cli: any): Promise<number> {
		const parsed = this.parseArgs(args);
		const useSSE = parsed.sse as boolean;
		const mode = useSSE ? 'SSE' : 'stdio';
		
		intro(`Add MCPLand to Cursor (${mode} mode)`);
		const root = process.cwd();

		const key = readEnvVar(root, 'OPENAI_API_KEY');
		if (!key) {
			console.error(pc.red('OPENAI_API_KEY not found in .env'));
			return 1;
		}

		let sseUrl = '';
		if (useSSE) {
			const urlInput = await text({
				message: 'Enter SSE server URL',
				placeholder: 'http://localhost:1337',
				initialValue: 'http://localhost:1337',
				validate: (v) => {
					if (!v || v.trim().length === 0) {
						return 'Please enter a valid URL';
					}
					try {
						new URL(v.trim());
						return undefined;
					} catch {
						return 'Please enter a valid URL (e.g., http://localhost:1337)';
					}
				},
			});

			if (isCancel(urlInput)) {
				cancel('Aborted');
				return 1;
			}

			sseUrl = String(urlInput).trim();
			// Ensure URL ends with /sse for the SSE endpoint
			if (!sseUrl.endsWith('/sse')) {
				sseUrl = sseUrl.replace(/\/+$/, '') + '/sse';
			}
		}

		const cursorDir = path.join(root, '.cursor');
		ensureDirSync(cursorDir);

		const cursorCfgPath = path.join(cursorDir, 'mcp.json');
		let cfg: any = {};

		try {
			if (existsSync(cursorCfgPath)) {
				cfg = JSON.parse(readFileSync(cursorCfgPath, 'utf-8')) ?? {};
			}
		} catch {}

		if (typeof cfg !== 'object' || Array.isArray(cfg)) cfg = {};

		cfg.mcpServers =
			cfg.mcpServers && typeof cfg.mcpServers === 'object'
				? cfg.mcpServers
				: {};

		if (useSSE) {
			// Configure for SSE transport
			cfg.mcpServers['MCPLand'] = {
				url: sseUrl
			};
		} else {
			// Configure for stdio transport
			const jsPath = path.join(root, 'node_modules', 'mcpland', 'index.js');

			cfg.mcpServers['MCPLand'] = {
				command: 'bun',
				args: [jsPath],
				env: { OPENAI_API_KEY: key },
			};
		}

		writeFileSync(cursorCfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
		
		if (useSSE) {
			outro(pc.green(`Updated ${path.relative(root, cursorCfgPath)} for SSE mode`));
			console.log(pc.cyan('Make sure to run `mcp serve --port=<port>` to start the SSE server'));
		} else {
			outro(pc.green(`Updated ${path.relative(root, cursorCfgPath)} for stdio mode`));
		}
		
		return 0;
	}
}

function ensureDirSync(dir: string) {
	try {
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	} catch {}
}

function readEnvVar(destRoot: string, key: string): string | undefined {
	const envPath = path.join(destRoot, '.env');
	try {
		if (!existsSync(envPath)) return undefined;
		const content = readFileSync(envPath, 'utf-8');
		const lines = content.split(/\r?\n/);
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;
			const idx = trimmed.indexOf('=');
			if (idx === -1) continue;
			const k = trimmed.substring(0, idx).trim();
			const v = trimmed.substring(idx + 1).trim();
			if (k === key) return v;
		}
	} catch {}
	return undefined;
}
