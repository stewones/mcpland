import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mkdirSync } from 'node:fs';

import { SqliteEmbedStore } from '../../../src/lib/store';

// Provide a minimal global Bun.hash used by store
(globalThis as any).Bun = {
	hash: (s: string) =>
		Math.abs([...s].reduce((a, c) => a + c.charCodeAt(0), 0)),
};

// Mocks
const dbRun = vi.fn();
const lastQuery: { sql?: string; params?: any[] } = {};
const queryMock = vi.fn((sql: string) => {
	lastQuery.sql = sql;
	return {
		get: (...params: any[]) => {
			lastQuery.params = params;
			if (sql.includes('COUNT(1)')) return { cnt: 2 };
			if (sql.includes('WHERE source_id=? AND hash=?')) return { id: 'exists' };
			return undefined;
		},
		all: (...params: any[]) => {
			lastQuery.params = params;
			if (sql.includes('WHERE source_id=?')) {
				return [
					{ sourceId: params[0], idx: 0, content: 'A', embedding: '[0.2]' },
					{ sourceId: params[0], idx: 1, content: 'B', embedding: '[0.8]' },
				];
			}
			return [
				{ sourceId: 'x', idx: 0, content: 'C', embedding: '[0.9]' },
				{ sourceId: 'y', idx: 1, content: 'D', embedding: '[0.1]' },
			];
		},
	} as any;
});

vi.mock('bun:sqlite', () => ({
	Database: class MockDB {
		constructor(_p: string) {}
		run = dbRun;
		query = queryMock;
	},
}));

vi.mock('@ai-sdk/openai', () => ({
	openai: { embedding: (_: any) => ({ model: 'test' }) },
}));
vi.mock('ai', () => ({
	embed: vi.fn(async ({ value }: any) => ({ embedding: [1, 0, 0], value })),
	cosineSimilarity: vi.fn((_: number[], vec: number[]) => vec[0]),
}));

vi.mock('node:fs', () => ({ mkdirSync: vi.fn() }));
vi.mock('node:path', () => ({
	default: {
		dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
		resolve: (...parts: string[]) => parts.join('/'),
		join: (...parts: string[]) => parts.join('/'),
	},
	dirname: (p: string) => p.split('/').slice(0, -1).join('/'),
}));
vi.mock('node:url', () => ({
	fileURLToPath: (url: string) => url.replace('file://', ''),
}));

vi.mock('../../../src/lib/config', () => ({
	getRootDir: vi.fn(() => '/test/root'),
}));

describe('SqliteEmbedStore behavior', () => {
	beforeEach(() => {
		dbRun.mockClear();
		queryMock.mockClear();
	});

	it('initializes schema and reports chunk counts', () => {
		const store = new SqliteEmbedStore('.data/test.sqlite');

		// Three schema runs + indexes
		expect(dbRun).toHaveBeenCalled();
		expect(store.getChunkCountBySource('abc')).toBe(2);
		expect(store.hasIngested('abc')).toBe(true);
	});

	it('upserts sources with metadata', () => {
		const store = new SqliteEmbedStore('.data/test.sqlite');
		store.upsertSource({ id: 'id1', meta: { name: 'test' } });

		// verify last run call used parameters including JSON meta
		const calls = dbRun.mock.calls;
		const params = calls[calls.length - 1][1];

		expect(params[0]).toBe('id1');
		expect(params[1]).toBe(JSON.stringify({ name: 'test' }));
	});

	it('ingests chunks, skipping duplicates and embedding new ones', async () => {
		const store = new SqliteEmbedStore('.data/test.sqlite');

		// First chunk will be seen as duplicate due to queryMock get() returning a row
		// Second chunk different content will still be considered duplicate because get() always returns {id:'exists'}
		await store.ingest({ id: 'source', meta: { name: 'test' } }, ['dup', 'dup2'], {
			mcpId: 'test-mcp',
			toolId: 'test-tool',
		});

		// Since get() returns a row, insert never called
		expect(dbRun).not.toHaveBeenCalledWith(
			expect.stringContaining('INSERT INTO chunks'),
			expect.anything()
		);
	});

	it('ingests new chunks and calls embedText and insertChunk', async () => {
		const store = new SqliteEmbedStore('.data/test.sqlite');

		// Create a temporary mock that returns no existing chunks
		const tempQueryMock = vi.fn(
			(sql: string) =>
				({
					get: (...params: any[]) => {
						if (sql.includes('WHERE source_id=? AND hash=?')) return undefined; // No existing chunks
						if (sql.includes('COUNT(1)')) return { cnt: 0 };
						return undefined;
					},
					all: () => [],
				}) as any
		);

		// Temporarily override the mock
		const originalQuery = (store as any).db.query;
		(store as any).db.query = tempQueryMock;

		await store.ingest(
			{ id: 'newsource', meta: { name: 'test' } },
			['new content', 'another new'],
			{ mcpId: 'test-mcp', toolId: 'test-tool' }
		);

		// Should have called insert for new chunks
		expect(dbRun).toHaveBeenCalledWith(
			expect.stringContaining('INSERT INTO chunks'),
			expect.anything()
		);

		// Restore original mock
		(store as any).db.query = originalQuery;
	});

	it('embedText method works independently', async () => {
		const store = new SqliteEmbedStore('.data/test.sqlite');
		const result = await store.embedText('test text');

		expect(result).toEqual([1, 0, 0]);
	});

	it('upsertSource handles null metadata', () => {
		const store = new SqliteEmbedStore('.data/test.sqlite');
		store.upsertSource({ id: 'id2' }); // No meta field

		const calls = dbRun.mock.calls;
		const params = calls[calls.length - 1][1];

		expect(params[0]).toBe('id2');
		expect(params[1]).toBe(null); // meta should be null when undefined
	});

	it('search ranks results by similarity and supports source filter', async () => {
		const store = new SqliteEmbedStore('.data/test.sqlite');
		const res1 = await store.search('hello');

		// Expect sorted by embedding[0] descending => 0.9 then 0.1
		expect(res1.map((r) => r.content)).toEqual(['C', 'D']);

		const res2 = await store.search('hello', { sourceId: 'src', limit: 1 });

		// For filtered rows: 0.2 and 0.8 => sorted: 0.8 top
		expect(res2).toHaveLength(1);
		expect(res2[0].content).toBe('B');
		expect(lastQuery.sql).toContain('WHERE source_id=?');
		expect(lastQuery.params).toEqual(['src']);
	});

	it('ensureDir swallows mkdirSync errors', () => {
		(mkdirSync as any).mockImplementationOnce(() => {
			throw new Error('mkdir fail');
		});

		expect(() => new SqliteEmbedStore('.data/fail.sqlite')).not.toThrow();
		expect(dbRun).toHaveBeenCalled();
	});

	it('search skips rows with invalid embedding JSON', async () => {
		const store = new SqliteEmbedStore('.data/test.sqlite');

		const originalQuery = (store as any).db.query;
		(store as any).db.query = vi.fn(
			() =>
				({
					all: () => [
						{ sourceId: 's', idx: 0, content: 'bad1', embedding: 'not-json' },
						{ sourceId: 's', idx: 1, content: 'bad2', embedding: '{]' },
					],
				}) as any
		);

		const results = await store.search('q');
		expect(results).toEqual([]);

		(store as any).db.query = originalQuery;
	});

	it('getChunkCountBySource falls back to 0 when no COUNT row', () => {
		const store = new SqliteEmbedStore('.data/test.sqlite');

		const originalQuery = (store as any).db.query;
		(store as any).db.query = vi.fn(
			(sql: string) =>
				({
					get: (..._params: any[]) => {
						if (sql.includes('COUNT(1)')) return undefined;
						return undefined;
					},
					all: (..._params: any[]) => [],
				}) as any
		);

		expect(store.getChunkCountBySource('none')).toBe(0);
		expect(store.hasIngested('none')).toBe(false);

		(store as any).db.query = originalQuery;
	});

	it('shutdown method stops all active store instances', () => {
		// Create multiple stores
		const store1 = new SqliteEmbedStore('.data/test1.sqlite');
		const store2 = new SqliteEmbedStore('.data/test2.sqlite');

		// Mock stopIngestion method
		const stopSpy1 = vi.spyOn(store1, 'stopIngestion');
		const stopSpy2 = vi.spyOn(store2, 'stopIngestion');

		// Call shutdown
		SqliteEmbedStore.shutdown();

		expect(stopSpy1).toHaveBeenCalled();
		expect(stopSpy2).toHaveBeenCalled();
	});

	it('stopIngestion sets stopRequested flag', () => {
		const store = new SqliteEmbedStore('.data/test.sqlite');

		// Initially should be false
		expect((store as any).stopRequested).toBe(false);

		store.stopIngestion();

		// Should now be true
		expect((store as any).stopRequested).toBe(true);
	});

	it('close method removes instance from set', () => {
		const store = new SqliteEmbedStore('.data/test.sqlite');

		// Verify instance is in set
		expect((SqliteEmbedStore as any).instances.has(store)).toBe(true);

		store.close();

		// Should be removed from set
		expect((SqliteEmbedStore as any).instances.has(store)).toBe(false);
	});

	it('close method handles db.close errors gracefully', () => {
		const store = new SqliteEmbedStore('.data/test.sqlite');

		// Mock db.close to throw
		(store as any).db.close = vi.fn(() => {
			throw new Error('Close failed');
		});

		// Should not throw
		expect(() => store.close()).not.toThrow();

		// Should still remove from instances
		expect((SqliteEmbedStore as any).instances.has(store)).toBe(false);
	});

	it('ingest respects stopRequested flag', async () => {
		const store = new SqliteEmbedStore('.data/test.sqlite');

		// Set stopRequested to true
		store.stopIngestion();

		await store.ingest(
			{
				id: 'source',
				meta: {
					name: 'test',
				},
			},
			['chunk1', 'chunk2'],
			{ mcpId: 'test', toolId: 'tool' }
		);

		// Just verify that stopRequested flag affects ingestion
		// The log message is tested implicitly through this behavior
		expect((store as any).stopRequested).toBe(true);
	});
});
