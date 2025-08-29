import pc from 'picocolors';

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { intro, outro } from '@clack/prompts';

import { McpLandCommand } from '../command';

export class LinkCommand extends McpLandCommand {
	constructor() {
		super('link', 'Configure Cursor stdio link');
	}

	aliases(): string[] {
		return ['link:cursor', 'cursor'];
	}

	async run(_args: string[], _cli: any): Promise<number> {
		intro('Add MCPLand to Cursor');
		const root = process.cwd();

		const key = readEnvVar(root, 'OPENAI_API_KEY');
		if (!key) {
			console.error(pc.red('OPENAI_API_KEY not found in .env'));
			return 1;
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

		const jsPath = path.join(root, 'node_modules', 'mcpland', 'index.js');

		const stdioPath = jsPath;

		cfg.mcpServers['MCPLand'] = {
			command: 'bun',
			args: [stdioPath],
			env: { OPENAI_API_KEY: key },
		};

		writeFileSync(cursorCfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
		outro(pc.green(`Updated ${path.relative(root, cursorCfgPath)}`));
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
