import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('config module behavior', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('loads and caches MCPLand config', async () => {
    const readSpy = vi.fn(() => JSON.stringify({ tools: { foo: { enabled: false } } }));
    
    vi.doMock('node:fs', () => ({ readFileSync: readSpy }));
    vi.doMock('node:path', () => ({ default: { resolve: () => '/fake/mcpland.json' } }));

    const mod1 = await import('../../src/config');
    const cfg1 = mod1.loadConfig();
    const cfg2 = mod1.loadConfig();

    expect(cfg1).toEqual({ tools: { foo: { enabled: false } } });
    expect(cfg2).toBe(cfg1); // cached
    expect(readSpy).toHaveBeenCalledTimes(1);
  });

  it('handles null JSON parse result', async () => {
    const readSpy = vi.fn(() => 'null');
    
    vi.doMock('node:fs', () => ({ readFileSync: readSpy }));
    vi.doMock('node:path', () => ({ default: { resolve: () => '/fake/mcpland.json' } }));

    const mod = await import('../../src/config');
    const cfg = mod.loadConfig();

    expect(cfg).toEqual({});
  });

  it('falls back to empty object on error', async () => {
    vi.doMock('node:path', () => ({ default: { resolve: () => '/fake/mcpland.json' } }));
    vi.doMock('node:fs', () => ({ readFileSync: () => { throw new Error('nope'); } }));

    const mod = await import('../../src/config');

    expect(mod.loadConfig()).toEqual({});
  });

  it('tool enabled defaults to true and respects explicit flags', async () => {
    const { isToolEnabled } = await import('../../src/config');

    const cfg = { tools: { a: { enabled: false }, b: { enabled: true }, c: {} as any } } as any;

    expect(isToolEnabled('missing', cfg)).toBe(true);
    expect(isToolEnabled('a', cfg)).toBe(false);
    expect(isToolEnabled('b', cfg)).toBe(true);
    expect(isToolEnabled('c', cfg)).toBe(true);
  });
});
