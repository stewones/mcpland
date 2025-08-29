import { readdirSync } from 'node:fs';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type McpLand, McpRegistry } from 'mcpland';

import {
	getRootDir,
	getSourceFolder,
	isMcpEnabled,
	isMcpToolEnabled,
} from './config';

export async function loadAvailableMcps() {
	const sourceFolder = getSourceFolder();
	console.warn('sourceFolder', sourceFolder);

	const rootDir = getRootDir();
	console.warn('rootDir', rootDir);

	const resolvedSourceDir = path.resolve(rootDir, sourceFolder);

	console.warn('resolvedSourceDir', resolvedSourceDir);

	const availableMcps = readdirSync(resolvedSourceDir);

	console.warn('Loading available MCPs for', availableMcps);

	for (const mcp of availableMcps) {
		const mcpModule = await import(`${resolvedSourceDir}/${mcp}`);
		if (mcpModule.default) {
			const instance: McpLand = mcpModule.default;
			const name = instance['spec']?.name;

			if (typeof name !== 'string' || name.trim().length === 0) {
				throw new Error(
					`MCP at "${sourceFolder}/${mcp}" is missing required config.name`
				);
			}

			if (isMcpEnabled(name)) {
				try {
					const toolsDir = path.join(resolvedSourceDir, mcp, 'tools');
					const availableTools = readdirSync(toolsDir).filter(
						(it) => !it.endsWith('.ts') && !it.endsWith('.js')
					);

					for (const toolFolder of availableTools) {
						if (!isMcpToolEnabled(name, toolFolder)) continue;
						const toolModule = await import(
							`${resolvedSourceDir}/${mcp}/tools/${toolFolder}`
						);
						const maybeDefault = toolModule.default;

						if (maybeDefault) {
							try {
								const toolInstance =
									typeof maybeDefault === 'function'
										? new maybeDefault()
										: maybeDefault;

								instance.registerTool(toolInstance, toolFolder);
							} catch (err) {
								throw new Error(
									`Failed to register tool ${name}/${toolFolder}: ${JSON.stringify(err, null, 2)}`
								);
							}
						} else {
							throw new Error(
								`Tool ${name}/${toolFolder} is missing a default export`
							);
						}
					}

					McpRegistry.register(instance);
				} catch (err) {
					console.error('Failed to load tools for MCP', name, err);
				}
			}
		}
	}
}

export function main() {
	const currentFilePath = resolve(fileURLToPath(import.meta.url));
	const mainScriptPath = resolve(process.argv[1]);

	const isExecutedDirectly = currentFilePath.includes(mainScriptPath);

	if (isExecutedDirectly) {
		return true;
	}

	return false;
}
