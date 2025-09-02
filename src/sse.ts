import Elysia, { Context } from 'elysia';
import figlet from 'figlet';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

import { loadAvailableMcps, loadConfig, McpRegistry } from 'mcpland';

import { log } from '@clack/prompts';
import { cors } from '@elysiajs/cors';

import pkg from '../package.json';

const sse = new Elysia({
	name: 'MCPLand SSE Server',
})
	.use(cors())
	.get('/', () => figlet.textSync('MCPLAND', { font: 'Sub-Zero' }))
	.get('/sse', async ({ set }) => {
		// Set SSE headers
		set.headers['Content-Type'] = 'text/event-stream';
		set.headers['Cache-Control'] = 'no-cache';
		set.headers['Connection'] = 'keep-alive';
		set.headers['Access-Control-Allow-Origin'] = '*';
		set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
		set.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';

		const stream = new ReadableStream({
			start(controller) {
				// Send connection establishment message
				const connectMessage = {
					jsonrpc: '2.0',
					method: 'notifications/message',
					params: {
						uri: '/sse',
						method: 'POST',
					},
				};

				controller.enqueue(
					`event: endpoint\ndata: ${JSON.stringify(connectMessage)}\n\n`
				);
			},
		});

		return stream;
	})
	.post('/sse', async ({ body, set }: Context) => {
		try {
			// Set CORS headers
			set.headers['Access-Control-Allow-Origin'] = '*';
			set.headers['Access-Control-Allow-Headers'] = 'Content-Type';
			set.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';

			// Parse MCP message
			const message = body as any;

			// Handle MCP protocol messages
			if (message.method === 'initialize') {
				const config = loadConfig();
				return {
					jsonrpc: '2.0',
					id: message.id,
					result: {
						protocolVersion: '2024-11-05',
						capabilities: {
							tools: {},
						},
						serverInfo: {
							name: config.name || 'MCPLand SSE',
							version: pkg.version,
						},
					},
				};
			}

			if (message.method === 'tools/list') {
				// Return the available tools for this server
				const tools = McpRegistry.getAllTools().map(
					({ name, description, inputSchema }) => ({
						name,
						description,
						inputSchema,
					})
				);

				return {
					jsonrpc: '2.0',
					id: message.id,
					result: {
						tools,
					},
				};
			}

			if (message.method === 'prompts/list') {
				return {
					jsonrpc: '2.0',
					id: message.id,
					result: {
						prompts: [],
					},
				};
			}

			if (message.method === 'resources/list') {
				return {
					jsonrpc: '2.0',
					id: message.id,
					result: {
						resources: [],
					},
				};
			}

			if (message.method === 'tools/call') {
				const { name, arguments: args } = message.params;

				const allTools = McpRegistry.getAllTools();
				const tool = allTools.find((t) => t.name === name);

				if (!tool) {
					return {
						jsonrpc: '2.0',
						id: message.id,
						error: {
							code: -32601,
							message: `Unknown tool: ${name}`,
						},
					};
				}

				try {
					const result = await tool.handler(args);
					return {
						jsonrpc: '2.0',
						id: message.id,
						result,
					};
				} catch (error) {
					return {
						jsonrpc: '2.0',
						id: message.id,
						error: {
							code: -32603,
							message:
								error instanceof Error ? error.message : 'Internal error',
						},
					};
				}
			}

			// Handle other MCP methods as needed
			return {
				jsonrpc: '2.0',
				id: message.id,
				error: {
					code: -32601,
					message: 'Method not found',
				},
			};
		} catch (error) {
			return {
				jsonrpc: '2.0',
				id: (body as any)?.id,
				error: {
					code: -32603,
					message: error instanceof Error ? error.message : 'Internal error',
				},
			};
		}
	});

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
	// Initialize MCPs before starting the server
	(async () => {
		try {
			// Read port from environment variable, default to 1337
			const port = parseInt(process.env.MCPLAND_SSE_PORT || '1337', 10);

			// Validate port
			if (isNaN(port) || port < 1 || port > 65535) {
				log.error(
					'Invalid port number from environment variable. Using default port 1337.'
				);
				process.exit(1);
			}

			log.step('Loading available MCPs for SSE server...');
			await loadAvailableMcps();

			// Initialize all registered MCPs
			await McpRegistry.initializeAll();

			const tools = McpRegistry.getAllTools();

			sse.listen(port, () => {
				log.success(
					`Server running at http://localhost:${port} with ${tools.length} tools`
				);
				log.message('Press Ctrl+C to stop the server');
			});
		} catch (error) {
			log.error(
				`Failed to start SSE server: ${JSON.stringify(error, null, 2)}`
			);
			process.exit(1);
		}
	})();
}

export { sse };
