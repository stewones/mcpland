import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the CLI to avoid actually running it
const mockRun = vi.fn(async () => 0);
vi.mock('../../src/cli/base', () => ({
	cli: {
		run: mockRun
	}
}));

describe('bin entry point', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('imports and runs the CLI when executed as main script', async () => {
		// Import the bin file to execute it
		await import('../../src/bin');
		
		// Verify that cli.run() was called
		expect(mockRun).toHaveBeenCalledOnce();
	});
});
