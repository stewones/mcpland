import { resolve } from 'path';

import { fileURLToPath } from 'node:url';

import { createMcpClient, loadAvailableMcps, SqliteEmbedStore } from 'mcpland';

import { log } from './lib/log';

export async function stdio() {
	log.step('Starting MCP stdio');

	process.on('SIGTERM', () => {
		log.step('Shutting down MCPLand stdio');
		SqliteEmbedStore.shutdown();
	});

	await loadAvailableMcps();

	return createMcpClient()
		.then(({ tools }) => {
			log.step(`MCP server running on stdio with ${tools.length} tools`);
			log.step(JSON.stringify(tools, null, 2));
			return { tools };
		})
		.catch((error) => {
			log.error(
				`Failed to start MCP server: ${JSON.stringify(error, null, 2)}`
			);
			process.exit(1);
		});
}

function main() {
	const currentFilePath = resolve(fileURLToPath(import.meta.url));
	const mainScriptPath = resolve(process.argv[1]);

	const isExecutedDirectly = currentFilePath.includes(mainScriptPath);

	if (isExecutedDirectly) {
		return true;
	}

	return false;
}

if (main()) {
	stdio();
}
