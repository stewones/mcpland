import { readdirSync } from 'node:fs';
import path from 'node:path';

import { type McpLand, McpRegistry } from 'mcpland';

import {
	getRootDir,
	getSourceFolder,
	isMcpEnabled,
	isMcpToolEnabled,
} from './config';
import { log } from './log';

export async function loadAvailableMcps() {
	const sourceFolder = getSourceFolder();
	log.message(`sourceFolder: ${sourceFolder}`);

	const rootDir = getRootDir();
	log.message(`rootDir: ${rootDir}`);

	const resolvedSourceDir = path.resolve(rootDir, sourceFolder);

	log.message(`resolvedSourceDir: ${resolvedSourceDir}`);

	const availableMcps = readdirSync(resolvedSourceDir).filter(
		(file) => !file.includes('DS_Store') && !file.startsWith('_')
	);

	log.message(`Loading available MCPs for: ${availableMcps}`);

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

								instance.registerTool(toolInstance);
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
					log.error(`Failed to load tools for MCP ${name}: ${JSON.stringify(err, null, 2)}`);
				}
			}
		}
	}
}
