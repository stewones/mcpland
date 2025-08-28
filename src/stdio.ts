// trigger MCP registration
import './loader';

import { McpRegistry, McpToolDefinition } from 'mcpland/core';
import { startMcpServer } from 'mcpland/lib';

import { loadConfig } from './config';

export async function createMcpClient(): Promise<{
	tools: McpToolDefinition[];
}> {
	// Initialize all MCPs and their tools using the registry
	await McpRegistry.initializeAll().catch((err) =>
		console.error('MCP initialization failed:', err)
	);

	// Aggregate tool definitions from all MCPs
	const allToolDefs = McpRegistry.getAll().flatMap((entry) => entry.mcp.getTools());

	// Start the MCP server first to complete the stdio handshake quickly
	const cfg = loadConfig();
	await startMcpServer(
		{
			name: cfg.name ?? 'McpLand',
			description: cfg.description ?? 'Aggregated MCP tools',
		},
		allToolDefs
	);

	return {
		tools: allToolDefs,
	};
}

export async function main() {
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

if (import.meta.main) {
	main();
}
