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
});
