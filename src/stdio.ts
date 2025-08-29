#!/usr/bin/env bun

import { SqliteEmbedStore, stdio } from 'mcpland/lib';

stdio();

process.on('SIGTERM', () => {
	console.warn('Shutting down MCPLand stdio');
	SqliteEmbedStore.shutdown();
});
