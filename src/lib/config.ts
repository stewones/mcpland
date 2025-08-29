import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const GITHUB_URL = 'https://github.com/stewones/mcpland';

export type McpLandConfig = {
	name?: string;
	description?: string;
	source?: string;
	registry?: Record<
		string,
		{
			enabled?: boolean;
			tools?: Record<string, { enabled?: boolean }>;
		}
	>;
};

let cachedConfig: McpLandConfig | null = null;

export function loadConfig(): McpLandConfig {
	if (cachedConfig) return cachedConfig;

	const rootDir = getRootDir();
	const configPath = path.resolve(rootDir, 'mcpland.json');

	console.warn('moduleDir', rootDir);

	console.warn(`Loaded config from ${configPath}`);

	try {
		const raw = readFileSync(configPath, 'utf-8');
		const parsed = JSON.parse(raw) as McpLandConfig;
		cachedConfig = parsed ?? {};
		return cachedConfig;
	} catch {
		cachedConfig = {};
		return cachedConfig;
	}
}

export function getSourceFolder(config = loadConfig()): string {
	const value = config.source;
	if (typeof value !== 'string' || value.trim().length === 0) return 'src/mcps';
	return value;
}

export function getRootDir(): string {
	const rootDir = path.dirname(fileURLToPath(import.meta.url));
	const configPath = path.resolve(rootDir, '..', '..', 'mcpland.json');
	return path.dirname(configPath).replace('/node_modules', '');
}

export function isMcpEnabled(mcpName: string, config = loadConfig()): boolean {
	const entry = config.registry?.[mcpName];
	if (!entry || entry.enabled === undefined) return true;
	return Boolean(entry.enabled);
}

export function isMcpToolEnabled(
	mcpName: string,
	toolName: string,
	config = loadConfig()
): boolean {
	const mcpEntry = config.registry?.[mcpName];
	if (!mcpEntry) return true;
	const toolEntry = mcpEntry.tools?.[toolName];
	if (!toolEntry || toolEntry.enabled === undefined) return true;
	return Boolean(toolEntry.enabled);
}
