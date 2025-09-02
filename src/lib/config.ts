import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { log } from './log';

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

	log.message(`rootDir: ${rootDir}`);
	log.step(`Loaded config from ${configPath}`);

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

	// When running from built dist code, we need to find the project root
	let searchDir = rootDir;

	// Go up directories until we find mcpland.json
	while (searchDir !== path.dirname(searchDir)) {
		const configPath = path.join(searchDir, 'mcpland.json');
		try {
			if (existsSync(configPath)) {
				return searchDir;
			}
		} catch {}
		searchDir = path.dirname(searchDir);
	}

	// Fallback to the old logic if mcpland.json is not found
	const configPath = path.resolve(rootDir, '..', '..', 'mcpland.json');
	const projectRoot = path.dirname(configPath);

	// If we're running from node_modules, go up to find the actual project root
	if (projectRoot.includes('node_modules')) {
		return projectRoot.replace('/node_modules/mcpland', '');
	}

	return projectRoot;
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

export function getExecutionMode(): 'dev' | 'prod' {
	const currentDir = process.cwd();

	// Check if we have a node_modules/mcpland in the current directory
	const nodeModulesMcpLandPath = path.join(
		currentDir,
		'node_modules',
		'mcpland'
	);

	// Check if we're running from within node_modules
	const runningFromNodeModules =
		__filename?.includes('node_modules') ||
		process.argv[1]?.includes('node_modules') ||
		import.meta.url?.includes('node_modules');

	// If we're running from node_modules or there's a node_modules/mcpland, we're in prod
	if (runningFromNodeModules || existsSync(nodeModulesMcpLandPath)) {
		return 'prod';
	}

	return 'dev';
}

export function getSseScriptPath(): string {
	const mode = getExecutionMode();
	const currentDir = process.cwd();

	if (mode === 'prod') {
		// Use the compiled version from node_modules
		return path.join(currentDir, 'node_modules', 'mcpland', 'sse.js');
	} else {
		// Use the source version for development
		const rootDir = getRootDir();
		return path.join(rootDir, 'src', 'sse.ts');
	}
}
