#!/usr/bin/env bun
import { Target } from 'bun';
import dedent from 'dedent';

import { cp, rm } from 'node:fs/promises';
import path from 'node:path';

type PackageJSON = {
	dependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
};

const rootDir = path.resolve(import.meta.dir, '..');
const distDir = path.join(rootDir, 'dist');

const args = new Set(Bun.argv.slice(2));
const shouldMinify =
	args.has('--minify') || process.env.NODE_ENV === 'production';

function log(step: string, message: string) {
	console.log(`[${step}] ${message}`);
}

async function generateTypes(): Promise<void> {
	log('types', 'Generating .d.ts with TypeScript (bun x tsc)');
	const bunBin = Bun.which('bun') ?? 'bun';
	const proc = Bun.spawn(
		[bunBin, 'x', 'tsc', '-p', path.join(rootDir, 'tsconfig.json')],
		{
			stdout: 'inherit',
			stderr: 'inherit',
		}
	);
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

	const exec = [
		build([path.join(rootDir, 'src/index.ts')], externals, distDir),
		build([path.join(rootDir, 'src/bin.ts')], externals, distDir),
	];

	Promise.all(exec);
}

function build(
	entrypoints: string[],
	external: string[],
	outdir: string,
	format: 'esm' | 'cjs' | 'iife' = 'esm',
	target: Target = 'node'
) {
	return new Promise<void>(async (resolve, reject) => {
		await Bun.build({
			entrypoints,
			outdir,
			tsconfig: path.join(rootDir, 'tsconfig.json'),
			target,
			minify: shouldMinify,
			sourcemap: 'external',
			external,
			format,
			banner: dedent`
				/**
				 * @license
				 * Copyright Intenseloop LTDA All Rights Reserved.
				 *
				 * Use of this source code is governed by an MIT-style license that can be
				 * found in the LICENSE file at https://github.com/stewones/mcpland/blob/main/LICENSE
				 */
			`,
		})
			.then((result) => {
				log('bundle', `Wrote ${result.outputs.length} file(s) to ${distDir}`);
				resolve();
			})
			.catch((err) => {
				console.error(err);
				reject(err);
			});
	});
}

async function copyStaticFiles(): Promise<void> {
	log('copy', 'Copying static files to dist');

	const filesToCopy = ['README.md', 'LICENSE', 'package.json'];

	for (const fileName of filesToCopy) {
		const sourcePath = path.join(rootDir, fileName);
		const destPath = path.join(distDir, fileName);

		try {
			// Using Bun's native file API
			const file = Bun.file(sourcePath);
			await Bun.write(destPath, file);
			log('copy', `Copied ${fileName}`);
		} catch (error) {
			log(
				'copy',
				`Failed to copy ${fileName}: ${JSON.stringify(error, null, 2)}`
			);
		}
	}
}

async function fixTypesPlacement(): Promise<void> {
	log('fix', 'Fixing types placement');

	// move from dist/types/src to dist/types
	const srcTypesDir = path.join(distDir, 'types', 'src');
	const typesDir = path.join(distDir, 'types');

	await cp(srcTypesDir, typesDir, { recursive: true });
	await rm(srcTypesDir, { recursive: true, force: true });
}

async function fixPackageJson(): Promise<void> {
	log('fix', 'Fixing package.json');

	const pkgPath = path.join(distDir, 'package.json');
	const pkg = (await Bun.file(pkgPath).json()) as PackageJSON;

	//@ts-ignore
	pkg.bin = {
		mcp: './bin.js',
	};

	await Bun.write(pkgPath, JSON.stringify(pkg, null, 2));
}

async function removeUnusedTypes(): Promise<void> {
	await rm(path.join(distDir, 'types', 'mcps'), {
		recursive: true,
		force: true,
	});
}

async function main() {
	log('clean', 'Removing dist directory');
	await rm(distDir, { recursive: true, force: true });

	await bundle();
	await generateTypes();
	await copyStaticFiles();
	await fixPackageJson();
	await fixTypesPlacement();
	await removeUnusedTypes();

	log('done', 'Build completed successfully');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
