import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the angular tool
const mockAngularTool = {
  config: { name: 'angular', description: 'd', sourceId: 's1' },
  getTools: vi.fn(() => []),
  init: vi.fn(),
  fetchContext: vi.fn(),
};

// Mock tool without config
const mockToolNoConfig = {
  getTools: vi.fn(() => []),
  init: vi.fn(),
  fetchContext: vi.fn(),
};

// Mock tool with config but no name
const mockToolNoName = {
  config: { enabled: true },
  getTools: vi.fn(() => []),
  init: vi.fn(),
  fetchContext: vi.fn(),
};

// Mock the dynamic import of tools
vi.mock('../../src/tools/angular', () => ({
  default: mockAngularTool,
}));

vi.mock('../../src/tools/noconfig', () => ({
  default: mockToolNoConfig,
}));

vi.mock('../../src/tools/noname', () => ({
  default: mockToolNoName,
}));

// Mock fs to control what tools are discovered
vi.mock('node:fs', () => ({
  readdirSync: vi.fn(() => ['angular'])
}));

// Mock path.join to return the expected directory
vi.mock('node:path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')),
  }
}));

describe('loader behavior', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('loads enabled tools discovered in src/tools', async () => {
    vi.doMock('../../src/config', () => ({ isToolEnabled: () => true }));
    
    const mod = await import('../../src/loader');

    // includes Angular tool instance when enabled
    const names = (mod.tools as any[]).map((t) => t.config?.name).filter(Boolean);
    expect(names).toContain('angular');
  });

  it('skips tools disabled by config', async () => {
    vi.doMock('../../src/config', () => ({ isToolEnabled: () => false }));

    const mod = await import('../../src/loader');

    expect(mod.tools).toEqual([]);
  });

  it('throws when a tool has missing or empty config.name', async () => {
    // Create a tool with empty config.name to enforce strict naming
    const toolWithoutName = {
      config: { enabled: true, name: '' },
      getTools: vi.fn(() => []),
      init: vi.fn(),
      fetchContext: vi.fn(),
    };

    // Mock to return a tool without a valid name
    vi.doMock('../../src/tools/angular', () => ({
      default: toolWithoutName,
    }));

    vi.doMock('../../src/config', () => ({ isToolEnabled: () => true }));

    // Clear module cache and attempt to load, expecting failure
    vi.resetModules();
    await expect(import('../../src/loader')).rejects.toThrow(
      /missing required config\.name/
    );
  });

  it('throws when a tool has missing or empty config.description', async () => {
    const toolWithoutDescription = {
      config: { enabled: true, name: 'angular', description: '', sourceId: 's1' },
      getTools: vi.fn(() => []),
      init: vi.fn(),
      fetchContext: vi.fn(),
    };

    vi.doMock('../../src/tools/angular', () => ({
      default: toolWithoutDescription,
    }));

    vi.doMock('../../src/config', () => ({ isToolEnabled: () => true }));

    vi.resetModules();
    await expect(import('../../src/loader')).rejects.toThrow(
      /missing required config\.description/
    );
  });

  it('throws when a tool has missing or empty config.sourceId', async () => {
    const toolWithoutSourceId = {
      config: { enabled: true, name: 'angular', description: 'd', sourceId: '' },
      getTools: vi.fn(() => []),
      init: vi.fn(),
      fetchContext: vi.fn(),
    };

    vi.doMock('../../src/tools/angular', () => ({
      default: toolWithoutSourceId,
    }));

    vi.doMock('../../src/config', () => ({ isToolEnabled: () => true }));

    vi.resetModules();
    await expect(import('../../src/loader')).rejects.toThrow(
      /missing required config\.sourceId/
    );
  });
});
