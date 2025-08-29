import { resolve } from 'path';

import { fileURLToPath } from 'node:url';

import { createMcpClient, loadAvailableMcps, SqliteEmbedStore } from 'mcpland';

export async function stdio() {
	console.warn('Starting MCP stdio');

	process.on('SIGTERM', () => {
		console.warn('Shutting down MCPLand stdio');
		SqliteEmbedStore.shutdown();
	});

	await loadAvailableMcps();

	return createMcpClient()
		.then(({ tools }) => {
			console.warn(`MCP server running on stdio with ${tools.length} tools`);
			console.warn(JSON.stringify(tools, null, 2));
			return { tools };
		})
		.catch((error) => {
			console.error('Failed to start MCP server:', error);
			process.exit(1);
		});
}

function main() {
	const currentFilePath = resolve(fileURLToPath(import.meta.url));
	const mainScriptPath = resolve(process.argv[1]);

	console.warn('currentFilePath', currentFilePath);
	console.warn('mainScriptPath', mainScriptPath);

	const isExecutedDirectly = currentFilePath.includes(mainScriptPath);

	if (isExecutedDirectly) {
		console.warn('MCPLand is executed directly');
		return true;
	}
	console.warn('MCPLand is executed indirectly');
	return false;
}

if (main()) {
	stdio();
}
