import { readdirSync } from 'node:fs';
import path from 'node:path';

import type { MCPLandTool } from 'mcpland/core';

import { isToolEnabled } from './config';

const tools: MCPLandTool[] = [];

const availableTools = readdirSync(path.join(__dirname, 'tools'));

for (const tool of availableTools) {
	const toolModule = await import(`./tools/${tool}`);
	if (toolModule.default) {
		const instance: MCPLandTool = toolModule.default;
		const name = instance['config']?.name;
		const description = instance['config']?.description;
		const sourceId = instance['config']?.sourceId;
		if (typeof name !== 'string' || name.trim().length === 0) {
			throw new Error(
				`Tool at "src/tools/${tool}" is missing required config.name`
			);
		}
		if (typeof description !== 'string' || description.trim().length === 0) {
			throw new Error(
				`Tool at "src/tools/${tool}" is missing required config.description`
			);
		}
		if (typeof sourceId !== 'string' || sourceId.trim().length === 0) {
			throw new Error(
				`Tool at "src/tools/${tool}" is missing required config.sourceId`
			);
		}
		console.warn('Loading tool', name);
		if (isToolEnabled(name)) {
			tools.push(instance);
		}
	}
}

export { tools };
