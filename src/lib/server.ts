import {
	loadAvailableMcps,
	loadConfig,
	McpRegistry,
	type McpServerConfig,
	type McpToolDefinition,
	SqliteEmbedStore,
} from 'mcpland';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequest,
	CallToolRequestSchema,
	ListToolsRequestSchema,
	ServerResult,
} from '@modelcontextprotocol/sdk/types.js';

export async function startMcpServer(
	config: McpServerConfig,
	tools: McpToolDefinition[]
) {
	const server = createMcpServer(config, tools);
	const transport = new StdioServerTransport();
	await server.connect(transport);
	return server;
}

export function createMcpServer(
	config: McpServerConfig,
	tools: McpToolDefinition[]
) {
	const server = new Server(
		{
			name: config.name,
			version: config.version ?? '0.0.0',
			description: config.description ?? `${config.name} MCP server`,
		},
		{ capabilities: { tools: {} } }
	);
	const allTools = tools.map(({ name, description, inputSchema }) => ({
		name,
		description,
		inputSchema,
	}));

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: allTools,
	}));

	server.setRequestHandler(
		CallToolRequestSchema,
		async (request: CallToolRequest): Promise<ServerResult> => {
			const { name, arguments: args } = request.params as {
				name: string;
				arguments: unknown;
			};

			const tool = tools.find((t) => t.name === name);

			if (!tool) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({ error: `Unknown tool: ${name}` }),
						},
					],
				};
			}
			try {
				return await tool.handler(args);
			} catch (err) {
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({
								error: 'Tool execution failed',
								details: err instanceof Error ? err.message : String(err),
							}),
						},
					],
				};
			}
		}
	);

	return server;
}

export async function createMcpClient(): Promise<{
	tools: McpToolDefinition[];
}> {
	console.warn('Creating MCP client');

	// Aggregate tool definitions from all MCPs
	const allToolDefs = McpRegistry.getAll().flatMap((entry) =>
		entry.mcp.getTools()
	);

	// Start the MCP server and complete the stdio handshake
	const cfg = loadConfig();
	startMcpServer(
		{
			name: cfg.name ?? 'McpLand',
			description: cfg.description ?? 'Aggregated MCP tools',
		},
		allToolDefs
	);

	// Initialize all MCPs and their tools using the registry
	McpRegistry.initializeAll().catch((err) =>
		console.error('MCP initialization failed:', err)
	);

	return {
		tools: allToolDefs,
	};
}

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
