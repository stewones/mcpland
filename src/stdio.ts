import { McpToolDefinition, ToolRegistry } from 'mcpland/core';
import { startMcpServer } from 'mcpland/lib';

import { tools } from './loader';

export async function createMCPClient(): Promise<{
	tools: McpToolDefinition[];
}> {
	/**
	 * Initialize tool registry and register all tools
	 */
	const registry = new ToolRegistry();
	for (const tool of tools) {
		registry.register(tool);
	}

	// Kick off ingestion and other heavy work in the background
	await registry
		.initializeAll()
		.catch((err) => console.error('Tool initialization failed:', err));

	// Build tool definitions immediately so the server can advertise them
	const allToolDefs = registry
		.getAll()
		.flatMap((entry) => entry.tool.getTools());

	// Start the MCP server first to complete the stdio handshake quickly
	await startMcpServer(
		{
			name: 'MCPLand',
			description: 'Aggregated MCP tools for development',
		},
		allToolDefs
	);

	return {
		tools: allToolDefs,
	};
}

export async function main() {
	return createMCPClient()
		.then(({ tools }) => {
			console.warn(
				'Initialized MCP clients for tools:',
				JSON.stringify(tools, null, 2)
			);
			console.warn('MCP server running on stdio');
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
