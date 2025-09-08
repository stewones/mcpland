#!/usr/bin/env bun

import { writeFileSync } from 'node:fs';
import path from 'node:path';

async function runCoverage(): Promise<string> {
	const proc = Bun.spawn(['bun', 'run', 'test:coverage'], {
		stdout: 'pipe',
		stderr: 'inherit',
	});

	const output = await new Response(proc.stdout).text();
	await proc.exited;
	return output;
}

function trimToActualReport(fullOutput: string): string {
	const lines = fullOutput.split(/\r?\n/);
	const marker = '% Coverage report from v8';
	const idx = lines.findIndex((line) => line.trimStart().startsWith(marker));
	if (idx === -1) return fullOutput; // fallback: nothing to trim
	const trimmed = lines.slice(idx).join('\n').split(marker).join('\n').trim();
	return trimmed.endsWith('\n') ? trimmed : trimmed + '\n';
}

const root = process.cwd();
const coverageTxtPath = path.resolve(root, 'coverage.txt');

const output = await runCoverage();
const trimmed = trimToActualReport(output);
writeFileSync(coverageTxtPath, trimmed, 'utf8');
console.log(`Coverage text report written to ${coverageTxtPath}`);
