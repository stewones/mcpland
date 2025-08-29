import { cosineSimilarity, embed } from 'ai';
import { Database } from 'bun:sqlite';

import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path, { dirname } from 'node:path';

import { openai } from '@ai-sdk/openai';

import { getRootDir } from './config';

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const DB_PATH = '.data/context.sqlite';

export type Source = {
	id: string; // Stable ID for the source (e.g., 'angular-llm-context')
	meta?: Record<string, any>;
};

export type SearchResult = {
	content: string;
	score: number;
	sourceId: string;
	idx: number;
};

function ensureDir(filePath: string) {
	try {
		mkdirSync(dirname(filePath), { recursive: true });
	} catch {}
}

export class SqliteEmbedStore {
	private db: Database;
	private static instances: Set<SqliteEmbedStore> = new Set();
	private stopRequested = false;

	constructor(dbPath: string) {
		const rootDir = getRootDir();
		const absoluteDbPath = path.resolve(rootDir, dbPath);

		ensureDir(absoluteDbPath);
		this.db = new Database(absoluteDbPath);

		SqliteEmbedStore.instances.add(this);

		console.warn('MCPLand Embedding Store', absoluteDbPath);
		this.init();
	}

	public static shutdown() {
		for (const instance of SqliteEmbedStore.instances) {
			instance.stopIngestion();
		}
	}

	public stopIngestion() {
		this.stopRequested = true;
	}

	public close() {
		try {
			this.db.close();
		} catch {}
		SqliteEmbedStore.instances.delete(this);
	}

	private init() {
		this.db.run(`
			CREATE TABLE IF NOT EXISTS sources (
				id TEXT PRIMARY KEY,
				meta TEXT,
				updated_at INTEGER NOT NULL
			);
		`);
		this.db.run(`
			CREATE TABLE IF NOT EXISTS chunks (
				id TEXT PRIMARY KEY,
				source_id TEXT NOT NULL,
				idx INTEGER NOT NULL,
				content TEXT NOT NULL,
				hash TEXT NOT NULL,
				embedding TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				FOREIGN KEY(source_id) REFERENCES sources(id)
			);
		`);
		this.db.run(
			`CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id);`
		);
		this.db.run(`CREATE INDEX IF NOT EXISTS idx_chunks_hash ON chunks(hash);`);
	}

	getChunkCountBySource(sourceId: string): number {
		const row = this.db
			.query(`SELECT COUNT(1) as cnt FROM chunks WHERE source_id=?`)
			.get(sourceId) as { cnt?: number } | undefined;
		return Number(row?.cnt ?? 0);
	}

	hasIngested(sourceId: string): boolean {
		return this.getChunkCountBySource(sourceId) > 0;
	}

	upsertSource(source: Source) {
		const metaStr = source.meta ? JSON.stringify(source.meta) : null;
		this.db.run(
			`INSERT INTO sources (id, meta, updated_at)
			 VALUES (?, ?, ?)
			 ON CONFLICT(id) DO UPDATE SET meta=excluded.meta, updated_at=excluded.updated_at`,
			[source.id, metaStr, Date.now()]
		);
	}

	private hasChunkByHash(sourceId: string, hash: string) {
		const row = this.db
			.query(`SELECT id FROM chunks WHERE source_id=? AND hash=? LIMIT 1`)
			.get(sourceId, String(hash));
		return !!row;
	}

	private insertChunk(
		sourceId: string,
		idx: number,
		content: string,
		hash: string,
		embedding: number[]
	) {
		this.db.run(
			`INSERT INTO chunks (id, source_id, idx, content, hash, embedding, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			[
				randomUUID(),
				sourceId,
				idx,
				content,
				String(hash),
				JSON.stringify(embedding),
				Date.now(),
			]
		);
	}

	async embedText(text: string): Promise<number[]> {
		const { embedding } = await embed({
			model: openai.embedding(EMBEDDING_MODEL),
			value: text,
		});
		return embedding;
	}

	async ingest(source: Source, chunks: string[]) {
		this.upsertSource(source);

		console.warn('Ingesting chunks', chunks.length);

		let idx = 0;
		for (const content of chunks) {
			if (this.stopRequested) {
				console.warn('Ingestion cancelled - stopping at chunk', idx);
				break;
			}
			const hash = Bun.hash(content);
			if (this.hasChunkByHash(source.id, String(hash))) {
				//console.warn('Skipping chunk', idx);
				idx++;
				continue; // Skip if chunk already exists
			}
			console.warn('Embedding chunk', idx);
			const vector = await this.embedText(content);
			console.warn('Inserting chunk', idx);
			this.insertChunk(source.id, idx, content, String(hash), vector);
			console.warn('Inserted chunk', idx);
			idx++;
		}
	}

	async search(
		query: string,
		opts?: { limit?: number; sourceId?: string }
	): Promise<SearchResult[]> {
		const { embedding } = await embed({
			model: openai.embedding(EMBEDDING_MODEL),
			value: query,
		});

		const rows = opts?.sourceId
			? this.db
					.query(
						`SELECT source_id as sourceId, idx, content, embedding FROM chunks WHERE source_id=?`
					)
					.all(opts.sourceId)
			: this.db
					.query(
						`SELECT source_id as sourceId, idx, content, embedding FROM chunks`
					)
					.all();

		const scored: SearchResult[] = [];
		for (const row of rows as any[]) {
			try {
				const vec = JSON.parse(row.embedding) as number[];
				const score = cosineSimilarity(embedding, vec);
				scored.push({
					content: row.content,
					score,
					sourceId: row.sourceId,
					idx: row.idx,
				});
			} catch {}
		}

		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, opts?.limit ?? 20);
	}
}
