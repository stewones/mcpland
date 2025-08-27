import { describe, expect, it, vi } from 'vitest';

import { ToolRegistry } from 'mcpland/core';

describe('ToolRegistry behavior', () => {
  const mkTool = (name: string) => ({
    config: { name },
    init: vi.fn(async () => {}),
    getTools: vi.fn(() => []),
  }) as any;

  it('registers tools and retrieves them', async () => {
    const registry = new ToolRegistry();
    const a = mkTool('A');
    const b = mkTool('B');

    registry.register(a);
    registry.register(b);

    expect(registry.get('A')?.tool).toBe(a);
    expect(registry.get('B')?.tool).toBe(b);
    expect(registry.getAll().map((e) => e.tool)).toEqual([a, b]);
  });

  it('initializes all registered tools in parallel', async () => {
    const registry = new ToolRegistry();
    const a = mkTool('A');
    const b = mkTool('B');

    registry.register(a);
    registry.register(b);

    await registry.initializeAll();
    
    expect(a.init).toHaveBeenCalled();
    expect(b.init).toHaveBeenCalled();
  });
});
