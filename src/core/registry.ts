import type { McpLand, McpToolDefinition } from 'mcpland';

export interface McpRegistryEntry {
	mcp: McpLand;
	initialized: boolean;
	initializedAt?: Date;
}

export class McpRegistry {
	private static mcps: Map<string, McpRegistryEntry> = new Map();

	// Private constructor to prevent instantiation
	private constructor() {}

	static register(mcp: McpLand): void {
		if (McpRegistry.mcps.has(mcp.spec.name)) {
			throw new Error(`MCP '${mcp.spec.name}' is already registered`);
		}
		McpRegistry.mcps.set(mcp.spec.name, { mcp, initialized: false });
	}

	static async initializeAll(): Promise<void> {
		const promises = Array.from(McpRegistry.mcps.values()).map(
			async (entry) => {
				if (!entry.initialized) {
					await entry.mcp.init();
					entry.initialized = true;
					entry.initializedAt = new Date();
				}
			}
		);
		await Promise.all(promises);
	}

	static getAll(): McpRegistryEntry[] {
		return Array.from(McpRegistry.mcps.values());
	}

	static get(name: string): McpRegistryEntry | undefined {
		return McpRegistry.mcps.get(name);
	}

	static has(name: string): boolean {
		return McpRegistry.mcps.has(name);
	}

	static size(): number {
		return McpRegistry.mcps.size;
	}

	static getNames(): string[] {
		return Array.from(McpRegistry.mcps.keys());
	}

	static getInitialized(): McpRegistryEntry[] {
		return Array.from(McpRegistry.mcps.values()).filter(
			(entry) => entry.initialized
		);
	}

	static getUninitialized(): McpRegistryEntry[] {
		return Array.from(McpRegistry.mcps.values()).filter(
			(entry) => !entry.initialized
		);
	}

	static getAllTools(): McpToolDefinition[] {
		return McpRegistry.getAll().flatMap((entry) => entry.mcp.getTools());
	}

	static clear(): void {
		McpRegistry.mcps.clear();
	}

	static unregister(name: string): boolean {
		return McpRegistry.mcps.delete(name);
	}

	/**
	 * Get a summary of all registered MCPs
	 */
	static getSummary() {
		return {
			totalMcps: McpRegistry.size(),
			initialized: McpRegistry.getInitialized().length,
			uninitialized: McpRegistry.getUninitialized().length,
			mcpNames: McpRegistry.getNames(),
			tools: McpRegistry.getInitialized()
				.flatMap((entry) => entry.mcp.getTools())
				.map((tool) => ({
					name: tool.name,
					description: tool.description,
				})),
		};
	}

	/**
	 * Find all tools by a specific MCP
	 */
	static getToolsByMcp(mcpName: string) {
		const entry = McpRegistry.get(mcpName);

		if (!entry) {
			return null;
		}

		return {
			mcpName,
			initialized: entry.initialized,
			initializedAt: entry.initializedAt,
			tools: entry.mcp.getTools(),
		};
	}

	/**
	 * Check if an MCP is available and initialized
	 */
	static isReady(mcpName: string): boolean {
		const entry = McpRegistry.get(mcpName);

		return entry?.initialized ?? false;
	}

	/**
	 * Get initialization status of all MCPs
	 */
	static getStatuses() {
		return McpRegistry.getAll().map((entry) => ({
			name: entry.mcp.spec.name,
			description: entry.mcp.spec.description,
			initialized: entry.initialized,
			initializedAt: entry.initializedAt,
			toolCount: entry.mcp.getTools().length,
		}));
	}
}
