import { McpLand } from 'mcpland/core';

class AngularMCP extends McpLand {
	static name = 'angular';
	static description = 'Angular MCP';

	constructor() {
		super({ name: AngularMCP.name, description: AngularMCP.description });
		// Tools are discovered and registered automatically
		// use the mcpland.json to enable/disable tools
	}
}

export default new AngularMCP();
