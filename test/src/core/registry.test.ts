import { beforeEach, describe, expect, it, vi } from 'vitest';

import { McpRegistry } from '../../../src/core/registry';

describe('McpRegistry behavior', () => {
  beforeEach(() => {
    // Clear registry before each test
    McpRegistry.clear();
  });

  it('should register MCPs and retrieve them by name', () => {
    const a = { spec: { name: 'A' }, init: vi.fn(), getTools: vi.fn(() => []) } as any;
    const b = { spec: { name: 'B' }, init: vi.fn(), getTools: vi.fn(() => []) } as any;

    McpRegistry.register(a);
    McpRegistry.register(b);

    expect(McpRegistry.get('A')?.mcp).toBe(a);
    expect(McpRegistry.get('B')?.mcp).toBe(b);
    expect(McpRegistry.getAll().map((e) => e.mcp)).toEqual([a, b]);
  });

  it('should prevent duplicate MCP registration', () => {
    const mcp = { spec: { name: 'test' }, init: vi.fn(), getTools: vi.fn(() => []) } as any;
    
    McpRegistry.register(mcp);
    expect(() => McpRegistry.register(mcp)).toThrow("MCP 'test' is already registered");
  });

  it('should initialize all MCPs and track initialization status', async () => {
    const a = { spec: { name: 'A' }, init: vi.fn(), getTools: vi.fn(() => []) } as any;
    const b = { spec: { name: 'B' }, init: vi.fn(), getTools: vi.fn(() => []) } as any;

    McpRegistry.register(a);
    McpRegistry.register(b);

    // Before initialization
    expect(McpRegistry.getInitialized()).toHaveLength(0);
    expect(McpRegistry.getUninitialized()).toHaveLength(2);

    await McpRegistry.initializeAll();

    // After initialization
    expect(a.init).toHaveBeenCalledOnce();
    expect(b.init).toHaveBeenCalledOnce();
    expect(McpRegistry.getInitialized()).toHaveLength(2);
    expect(McpRegistry.getUninitialized()).toHaveLength(0);
    
    // Check initialization timestamps
    const entryA = McpRegistry.get('A');
    const entryB = McpRegistry.get('B');
    expect(entryA?.initialized).toBe(true);
    expect(entryB?.initialized).toBe(true);
    expect(entryA?.initializedAt).toBeInstanceOf(Date);
    expect(entryB?.initializedAt).toBeInstanceOf(Date);
  });

  it('should not re-initialize already initialized MCPs', async () => {
    const mcp = { spec: { name: 'test' }, init: vi.fn(), getTools: vi.fn(() => []) } as any;
    
    McpRegistry.register(mcp);
    await McpRegistry.initializeAll();
    expect(mcp.init).toHaveBeenCalledOnce();
    
    // Call initializeAll again
    await McpRegistry.initializeAll();
    expect(mcp.init).toHaveBeenCalledOnce(); // Still only called once
  });

  it('should provide utility methods for registry management', () => {
    const a = { spec: { name: 'A' }, init: vi.fn(), getTools: vi.fn(() => []) } as any;
    const b = { spec: { name: 'B' }, init: vi.fn(), getTools: vi.fn(() => []) } as any;

    expect(McpRegistry.size()).toBe(0);
    expect(McpRegistry.has('A')).toBe(false);

    McpRegistry.register(a);
    McpRegistry.register(b);

    expect(McpRegistry.size()).toBe(2);
    expect(McpRegistry.has('A')).toBe(true);
    expect(McpRegistry.has('B')).toBe(true);
    expect(McpRegistry.getNames()).toEqual(['A', 'B']);
  });

  it('should aggregate tools from all MCPs', () => {
    const toolsA = [{ name: 'tool1' }, { name: 'tool2' }];
    const toolsB = [{ name: 'tool3' }];
    
    const a = { spec: { name: 'A' }, init: vi.fn(), getTools: vi.fn(() => toolsA) } as any;
    const b = { spec: { name: 'B' }, init: vi.fn(), getTools: vi.fn(() => toolsB) } as any;

    McpRegistry.register(a);
    McpRegistry.register(b);

    const allTools = McpRegistry.getAllTools();
    expect(allTools).toHaveLength(3);
    expect(allTools).toEqual([...toolsA, ...toolsB]);
  });

  it('should unregister MCPs', () => {
    const mcp = { spec: { name: 'test' }, init: vi.fn(), getTools: vi.fn(() => []) } as any;
    
    McpRegistry.register(mcp);
    expect(McpRegistry.has('test')).toBe(true);
    
    const result = McpRegistry.unregister('test');
    expect(result).toBe(true);
    expect(McpRegistry.has('test')).toBe(false);
    
    // Unregistering non-existent MCP returns false
    expect(McpRegistry.unregister('non-existent')).toBe(false);
  });

  it('should clear all MCPs', () => {
    const a = { spec: { name: 'A' }, init: vi.fn(), getTools: vi.fn(() => []) } as any;
    const b = { spec: { name: 'B' }, init: vi.fn(), getTools: vi.fn(() => []) } as any;

    McpRegistry.register(a);
    McpRegistry.register(b);
    expect(McpRegistry.size()).toBe(2);

    McpRegistry.clear();
    expect(McpRegistry.size()).toBe(0);
    expect(McpRegistry.getAll()).toHaveLength(0);
  });

  it('should provide utility methods for getting summaries and statuses', async () => {
    const toolsA = [{ name: 'tool1', description: 'desc1' }];
    const a = { 
      spec: { name: 'A', description: 'MCP A' }, 
      init: vi.fn(), 
      getTools: vi.fn(() => toolsA) 
    } as any;
    const b = { 
      spec: { name: 'B', description: 'MCP B' }, 
      init: vi.fn(), 
      getTools: vi.fn(() => []) 
    } as any;

    McpRegistry.register(a);
    McpRegistry.register(b);

    // Test getSummary before initialization
    let summary = McpRegistry.getSummary();
    expect(summary).toEqual({
      totalMcps: 2,
      initialized: 0,
      uninitialized: 2,
      mcpNames: ['A', 'B'],
      tools: []
    });

    // Initialize only MCP A
    await a.init();
    const entryA = McpRegistry.get('A');
    if (entryA) {
      entryA.initialized = true;
      entryA.initializedAt = new Date();
    }

    // Test after partial initialization
    summary = McpRegistry.getSummary();
    expect(summary.initialized).toBe(1);
    expect(summary.uninitialized).toBe(1);
    expect(summary.tools).toHaveLength(1);
    expect(summary.tools[0]).toEqual({ name: 'tool1', description: 'desc1' });

    // Test getToolsByMcp
    const toolsByMcp = McpRegistry.getToolsByMcp('A');
    expect(toolsByMcp).not.toBeNull();
    expect(toolsByMcp?.mcpName).toBe('A');
    expect(toolsByMcp?.initialized).toBe(true);
    expect(toolsByMcp?.initializedAt).toBeInstanceOf(Date);
    expect(toolsByMcp?.tools).toEqual(toolsA);

    // Test non-existent MCP
    expect(McpRegistry.getToolsByMcp('NonExistent')).toBeNull();

    // Test isReady
    expect(McpRegistry.isReady('A')).toBe(true);
    expect(McpRegistry.isReady('B')).toBe(false);
    expect(McpRegistry.isReady('NonExistent')).toBe(false);

    // Test getStatuses
    const statuses = McpRegistry.getStatuses();
    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toMatchObject({
      name: 'A',
      description: 'MCP A',
      initialized: true,
      toolCount: 1
    });
    expect(statuses[1]).toMatchObject({
      name: 'B',
      description: 'MCP B',
      initialized: false,
      toolCount: 0
    });
  });
});