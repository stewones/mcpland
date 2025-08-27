import type { MCPLandTool } from './mcp';

export interface ToolRegistryEntry {
	tool: MCPLandTool;
}

export class ToolRegistry {
	private tools: Map<string, ToolRegistryEntry> = new Map();

	register(tool: MCPLandTool): void {
		console.warn('Registering tool:', tool);
		this.tools.set(tool['config'].name, {
			tool,
		});
	}

	async initializeAll(): Promise<void> {
		const promises: Promise<void>[] = [];

		for (const [name, entry] of this.tools) {
			console.warn(`Initializing tool: ${name}`);
			promises.push(entry.tool.init());
		}

		await Promise.all(promises);
	}

	getAll(): ToolRegistryEntry[] {
		return Array.from(this.tools.values());
	}

	get(name: string): ToolRegistryEntry | undefined {
		return this.tools.get(name);
	}
}