import { readFileSync } from 'node:fs';
import path from 'node:path';

export type MCPLandConfig = {
	tools?: Record<string, { enabled?: boolean }>;
};

let cachedConfig: MCPLandConfig | null = null;

export function loadConfig(): MCPLandConfig {
	if (cachedConfig) return cachedConfig;
	const configPath = path.resolve(import.meta.dir, '..', 'mcpland.json');
	console.warn('Loading config from', configPath);
	try {
		const raw = readFileSync(configPath, 'utf-8');
		const parsed = JSON.parse(raw) as MCPLandConfig;
		cachedConfig = parsed ?? {};
		return cachedConfig;
	} catch (_err) {
		cachedConfig = {};
		return cachedConfig;
	}
}

export function isToolEnabled(
	toolName: string,
	config = loadConfig()
): boolean {
	const entry = config.tools?.[toolName];
	if (!entry || entry.enabled === undefined) return true;
	return Boolean(entry.enabled);
}
