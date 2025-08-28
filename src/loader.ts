import { readdirSync } from 'node:fs';
import path from 'node:path';

import type { McpLand } from 'mcpland/core';
import { McpRegistry } from 'mcpland/core';

import {
	getRootDir,
	getSourceFolder,
	isMcpEnabled,
	isMcpToolEnabled,
} from './config';

const sourceFolder = getSourceFolder();
const rootDir = getRootDir();
const resolvedSourceDir = path.resolve(rootDir, sourceFolder);
const availableMcps = readdirSync(resolvedSourceDir);

// Calculate relative path from loader location to source directory
const loaderDir = __dirname;
const relativeSourcePath = path.relative(loaderDir, resolvedSourceDir);

for (const mcp of availableMcps) {
	const mcpModule = await import(`./${relativeSourcePath}/${mcp}`);
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
						`./${relativeSourcePath}/${mcp}/tools/${toolFolder}`
					);
					const maybeDefault = toolModule.default;

					if (maybeDefault) {
						try {
							const toolInstance =
								typeof maybeDefault === 'function'
									? new maybeDefault()
									: maybeDefault;
							// Cast to any to use extended registration signature with discovered tool id
							(instance as any).registerTool(toolInstance, toolFolder);
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
			} catch (_err) {
				console.error('Failed to load tools for MCP', name, _err);
			}
		}
	}
}

// Export the legacy mcps array for backward compatibility
export const mcps = McpRegistry.getAll().map(entry => entry.mcp);
