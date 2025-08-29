import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('config module behavior', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('loads and caches MCPLand config', async () => {
    const readSpy = vi.fn(() => JSON.stringify({ registry: { foo: { enabled: false, tools: { bar: { enabled: true } } } } }));
    
    vi.doMock('node:fs', () => ({ readFileSync: readSpy }));
    vi.doMock('node:path', () => ({ default: { resolve: () => '/fake/mcpland.json', dirname: () => '/fake' } }));

    const mod1 = await import('../../../src/lib/config');
    const cfg1 = mod1.loadConfig();
    const cfg2 = mod1.loadConfig();

    expect(cfg1).toEqual({ registry: { foo: { enabled: false, tools: { bar: { enabled: true } } } } });
    expect(cfg2).toBe(cfg1); // cached
    expect(readSpy).toHaveBeenCalledTimes(1);
  });

  it('handles null JSON parse result', async () => {
    const readSpy = vi.fn(() => 'null');
    
    vi.doMock('node:fs', () => ({ readFileSync: readSpy }));
    vi.doMock('node:path', () => ({ default: { resolve: () => '/fake/mcpland.json', dirname: () => '/fake' } }));

    const mod = await import('../../../src/lib/config');
    const cfg = mod.loadConfig();

    expect(cfg).toEqual({});
  });

  it('falls back to empty object on error', async () => {
    vi.doMock('node:path', () => ({ default: { resolve: () => '/fake/mcpland.json', dirname: () => '/fake' } }));
    vi.doMock('node:fs', () => ({ readFileSync: () => { throw new Error('nope'); } }));

    const mod = await import('../../../src/lib/config');

    expect(mod.loadConfig()).toEqual({});
  });

  it('mcp and tool enabled defaults to true and respects explicit flags', async () => {
    const { isMcpEnabled, isMcpToolEnabled } = await import('../../../src/lib/config');

    const cfg = { registry: { a: { enabled: false, tools: { x: { enabled: false }, y: { enabled: true }, z: {} as any } }, b: { enabled: true }, c: {} as any } } as any;

    expect(isMcpEnabled('missing', cfg)).toBe(true);
    expect(isMcpEnabled('a', cfg)).toBe(false);
    expect(isMcpEnabled('b', cfg)).toBe(true);
    expect(isMcpEnabled('c', cfg)).toBe(true);

    expect(isMcpToolEnabled('missing', 'anything', cfg)).toBe(true);
    expect(isMcpToolEnabled('a', 'x', cfg)).toBe(false);
    expect(isMcpToolEnabled('a', 'y', cfg)).toBe(true);
    expect(isMcpToolEnabled('a', 'z', cfg)).toBe(true);
  });

  it('getSourceFolder returns configured value or default', async () => {
    const { getSourceFolder } = await import('../../../src/lib/config');

    expect(getSourceFolder({})).toBe('src/mcps');
    expect(getSourceFolder({ source: 'custom' })).toBe('custom');
    expect(getSourceFolder({ source: '' })).toBe('src/mcps');
    expect(getSourceFolder({ source: '  ' })).toBe('src/mcps');
  });

  it('getRootDir returns directory of mcpland.json', async () => {
    vi.doMock('node:path', () => ({ 
      default: { 
        resolve: () => '/fake/mcpland.json', 
        dirname: (path: string) => path === '/fake/mcpland.json' ? '/fake' : '' 
      } 
    }));

    const { getRootDir } = await import('../../../src/lib/config');
    expect(getRootDir()).toBe('/fake');
  });
});
