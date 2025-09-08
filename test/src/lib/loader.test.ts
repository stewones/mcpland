import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock config functions to control MCP behavior
const mockIsMcpEnabled = vi.fn();
const mockIsMcpToolEnabled = vi.fn();
const mockGetRootDir = vi.fn();
const mockGetSourceFolder = vi.fn();

// Mock file system operations
const mockReaddirSync = vi.fn();

// Mock MCP Registry
const mockRegister = vi.fn();

vi.mock('node:fs', () => ({
  readdirSync: mockReaddirSync,
}));

vi.mock('node:path', () => ({
  default: {
    resolve: (...parts: string[]) => parts.join('/'),
    join: (...parts: string[]) => parts.join('/'),
  },
}));

vi.mock('../../../src/lib/config', () => ({
  isMcpEnabled: mockIsMcpEnabled,
  isMcpToolEnabled: mockIsMcpToolEnabled,
  getRootDir: mockGetRootDir,
  getSourceFolder: mockGetSourceFolder,
}));

vi.mock('mcpland', () => ({
  McpRegistry: {
    register: mockRegister,
  },
}));

describe('loader behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    
    // Setup default mock implementations
    mockGetRootDir.mockReturnValue('/test/root');
    mockGetSourceFolder.mockReturnValue('src/mcps');
    mockIsMcpEnabled.mockReturnValue(true);
    mockIsMcpToolEnabled.mockReturnValue(true);
  });

  it('loads enabled MCPs discovered in src/mcps', async () => {
    // Mock file system to return Angular MCP
    mockReaddirSync.mockReturnValueOnce(['angular'])
                   .mockReturnValueOnce(['docs']); // Mock tools directory

    // Mock the Angular MCP module
    const mockMcp = {
      default: {
        spec: { name: 'angular' },
        registerTool: vi.fn(),
      },
    };
    
    const mockTool = {
      default: class MockTool {},
    };

    // Mock dynamic imports
    vi.doMock('/test/root/src/mcps/angular', () => mockMcp);
    vi.doMock('/test/root/src/mcps/angular/tools/docs', () => mockTool);
    
    const { loadAvailableMcps } = await import('../../../src/lib/loader');
    
    await loadAvailableMcps();

    // Verify MCP was registered
    expect(mockRegister).toHaveBeenCalledWith(mockMcp.default);
    expect(mockMcp.default.registerTool).toHaveBeenCalled();
  });

  it('skips MCPs disabled by config', async () => {
    mockReaddirSync.mockReturnValueOnce(['angular']);
    mockIsMcpEnabled.mockReturnValue(false); // Disable MCP
    
    const mockMcp = {
      default: {
        spec: { name: 'angular' },
        registerTool: vi.fn(),
      },
    };
    
    vi.doMock('/test/root/src/mcps/angular', () => mockMcp);
    
    const { loadAvailableMcps } = await import('../../../src/lib/loader');
    
    await loadAvailableMcps();

    // Verify MCP was not registered since it's disabled
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('handles MCP with missing or empty config.name', async () => {
    mockReaddirSync.mockReturnValueOnce(['bad-mcp']);
    
    const mockBadMcp = {
      default: {
        spec: { name: '' }, // Empty name
        registerTool: vi.fn(),
      },
    };
    
    vi.doMock('/test/root/src/mcps/bad-mcp', () => mockBadMcp);
    
    const { loadAvailableMcps } = await import('../../../src/lib/loader');
    
    // This should throw an error for missing config name
    await expect(loadAvailableMcps()).rejects.toThrow(
      'MCP at "src/mcps/bad-mcp" is missing required config.name'
    );
  });

  it('handles tool modules with missing default export', async () => {
    mockReaddirSync.mockReturnValueOnce(['angular'])
                   .mockReturnValueOnce(['docs']);

    const mockMcp = {
      default: {
        spec: { name: 'angular' },
        registerTool: vi.fn(),
      },
    };
    
    const mockTool = { default: null }; // null default export (falsy)

    vi.doMock('/test/root/src/mcps/angular', () => mockMcp);
    vi.doMock('/test/root/src/mcps/angular/tools/docs', () => mockTool);
    
    const mockLog = { 
      error: vi.fn(), 
      message: vi.fn(), 
      step: vi.fn(), 
      warn: vi.fn(),
      success: vi.fn(),
      info: vi.fn()
    };
    vi.doMock('../../../src/lib/log', () => ({ log: mockLog }));
    
    const { loadAvailableMcps } = await import('../../../src/lib/loader');
    
    await loadAvailableMcps();

    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load tools for MCP angular')
    );
  });

  it('handles tool registration errors', async () => {
    mockReaddirSync.mockReturnValueOnce(['angular'])
                   .mockReturnValueOnce(['docs']);

    const mockMcp = {
      default: {
        spec: { name: 'angular' },
        registerTool: vi.fn().mockImplementation(() => {
          throw new Error('Registration failed');
        }),
      },
    };
    
    const mockTool = {
      default: class MockTool {},
    };

    vi.doMock('/test/root/src/mcps/angular', () => mockMcp);
    vi.doMock('/test/root/src/mcps/angular/tools/docs', () => mockTool);
    
    const mockLog = { 
      error: vi.fn(), 
      message: vi.fn(), 
      step: vi.fn(), 
      warn: vi.fn(),
      success: vi.fn(),
      info: vi.fn()
    };
    vi.doMock('../../../src/lib/log', () => ({ log: mockLog }));
    
    const { loadAvailableMcps } = await import('../../../src/lib/loader');
    
    await loadAvailableMcps();

    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load tools for MCP angular')
    );
  });

  it('handles tool instantiation where default is already an instance', async () => {
    mockReaddirSync.mockReturnValueOnce(['angular'])
                   .mockReturnValueOnce(['docs']);

    const mockMcp = {
      default: {
        spec: { name: 'angular' },
        registerTool: vi.fn(),
      },
    };
    
    const mockToolInstance = { some: 'tool', instance: true };
    const mockTool = {
      default: mockToolInstance, // Not a function, already an instance
    };

    vi.doMock('/test/root/src/mcps/angular', () => mockMcp);
    vi.doMock('/test/root/src/mcps/angular/tools/docs', () => mockTool);
    
    const { loadAvailableMcps } = await import('../../../src/lib/loader');
    
    await loadAvailableMcps();

    expect(mockMcp.default.registerTool).toHaveBeenCalledWith('angular', mockToolInstance);
  });

  it('skips tools that are disabled by config', async () => {
    mockReaddirSync.mockReturnValueOnce(['angular'])
                   .mockReturnValueOnce(['docs', 'disabled-tool']);
    
    // Enable MCP but disable specific tool
    mockIsMcpEnabled.mockReturnValue(true);
    mockIsMcpToolEnabled.mockImplementation((mcpName: string, toolName: string) => {
      return toolName !== 'disabled-tool';
    });

    const mockMcp = {
      default: {
        spec: { name: 'angular' },
        registerTool: vi.fn(),
      },
    };
    
    const mockTool1 = { default: class MockTool {} };
    const mockTool2 = { default: class MockDisabledTool {} };

    vi.doMock('/test/root/src/mcps/angular', () => mockMcp);
    vi.doMock('/test/root/src/mcps/angular/tools/docs', () => mockTool1);
    vi.doMock('/test/root/src/mcps/angular/tools/disabled-tool', () => mockTool2);
    
    const { loadAvailableMcps } = await import('../../../src/lib/loader');
    
    await loadAvailableMcps();

    // Should register the enabled tool but skip the disabled one
    expect(mockMcp.default.registerTool).toHaveBeenCalledTimes(1);
  });

  it('filters out non-directory entries from tools scanning', async () => {
    mockReaddirSync.mockReturnValueOnce(['angular'])
                   .mockReturnValueOnce(['docs', 'readme.md', 'config.ts']); // Mix of dirs and files

    const mockMcp = {
      default: {
        spec: { name: 'angular' },
        registerTool: vi.fn(),
      },
    };
    
    const mockTool = { default: class MockTool {} };

    vi.doMock('/test/root/src/mcps/angular', () => mockMcp);
    vi.doMock('/test/root/src/mcps/angular/tools/docs', () => mockTool);
    
    const { loadAvailableMcps } = await import('../../../src/lib/loader');
    
    await loadAvailableMcps();

    // Should only process 'docs' directory, skipping .md and .ts files
    expect(mockMcp.default.registerTool).toHaveBeenCalledTimes(1);
  });
});
