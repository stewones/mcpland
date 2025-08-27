#!/usr/bin/env bun

import { rm } from 'node:fs/promises';
import path from 'node:path';

type PackageJSON = {
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
};

const rootDir = path.resolve(import.meta.dir, '..');
const distDir = path.join(rootDir, 'dist');

const args = new Set(Bun.argv.slice(2));
const shouldMinify = args.has('--minify') || process.env.NODE_ENV === 'production';

function log(step: string, message: string) {
	console.log(`[${step}] ${message}`);
}

async function generateTypes(): Promise<void> {
	log('types', 'Generating .d.ts with TypeScript (bun x tsc)');
	const bunBin = Bun.which('bun') ?? 'bun';
	const proc = Bun.spawn([bunBin, 'x', 'tsc', '-p', path.join(rootDir, 'tsconfig.json')], {
		stdout: 'inherit',
		stderr: 'inherit',
	});
	const code = await proc.exited;
	if (code !== 0) {
		throw new Error(`Type generation failed with exit code ${code}`);
	}
}

async function bundle(): Promise<void> {
	log('bundle', 'Bundling entrypoints with Bun');
	const pkgPath = path.join(rootDir, 'package.json');
	const pkg = (await Bun.file(pkgPath).json()) as PackageJSON;
	const externals = Array.from(
		new Set([
			...Object.keys(pkg.dependencies ?? {}),
			...Object.keys(pkg.peerDependencies ?? {}),
		])
	);

	const result = await Bun.build({
		entrypoints: [
			path.join(rootDir, 'src/index.ts'),
			path.join(rootDir, 'src/core/index.ts'),
			path.join(rootDir, 'src/tools/index.ts'),
			path.join(rootDir, 'src/lib/index.ts'),
		],
		outdir: distDir,
		target: 'node',
		minify: shouldMinify,
		sourcemap: 'external',
		external: externals,
		format: 'esm',
	});

	for (const logMsg of result.logs) {
		const loc = (logMsg as any).location as
			| { file?: string; line?: number; column?: number }
			| undefined;
		const where =
			loc && loc.file != null && loc.line != null && loc.column != null
				? `${loc.file}:${loc.line}:${loc.column}`
				: '';
		if (logMsg.level === 'error') {
			console.error(`[bun] error ${where} ${logMsg.message}`);
		} else if (logMsg.level === 'warning') {
			console.warn(`[bun] warn  ${where} ${logMsg.message}`);
		} else {
			console.log(`[bun] info  ${where} ${logMsg.message}`);
		}
	}

	if (!result.success) {
		throw new Error('Bundling failed');
	}

	log('bundle', `Wrote ${result.outputs.length} file(s) to ${distDir}`);
}

async function main() {
	log('clean', 'Removing dist directory');
	await rm(distDir, { recursive: true, force: true });

	await bundle();
	await generateTypes();

	log('done', 'Build completed successfully');
}

main().catch((err) => {
    console.error(err);
	process.exit(1);
});


