import figlet from 'figlet';
import pc from 'picocolors';

import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import path from 'node:path';

import {
	cancel,
	intro,
	isCancel,
	log,
	multiselect,
	outro,
	spinner,
	text,
} from '@clack/prompts';

import { GITHUB_URL } from '../../lib/config';
import { McpLandCommand } from '../command';

type InitAnswers = {
	projectName?: string;
	sourceDir: string;
	selectedMcps: string[];
};

type AvailableMcp = { name: string; tools: string[] };

type McpLandJson = {
	name?: string;
	description?: string;
	source?: string;
	registry?: Record<
		string,
		{ enabled?: boolean; tools?: Record<string, { enabled?: boolean }> }
	>;
};

export class InitCommand extends McpLandCommand {
	constructor() {
		super('init', 'Initialize an MCP project');
	}

	async run(_args?: string[], _cli?: any): Promise<number> {
		const banner = figlet.textSync('MCPLAND', { font: 'Sub-Zero' });
		log.step(pc.greenBright(banner));

		intro('Intialize Model Context Protocol');

		const hasPkgJson = existsSync(path.resolve(process.cwd(), 'package.json'));

		let projectName: string | undefined;
		if (!hasPkgJson) {
			projectName = (await text({
				message: 'Project name',
				placeholder: 'my-mcp-project',
				validate: (v) =>
					!v || v.trim().length === 0
						? 'Please enter a project name'
						: undefined,
			})) as string;
			if (isCancel(projectName)) {
				cancel('Aborted');
				return 1;
			}
		}

		let sourceDir = (await text({
			message: 'Source directory',
			placeholder: 'src/mcps',
			initialValue: 'src/mcps',
			validate: (v) =>
				!v || v.trim().length === 0 ? 'Please enter a folder name' : undefined,
		})) as string;
		if (isCancel(sourceDir)) {
			cancel('Aborted');
			return 1;
		}

		const openaiKeyInput = (await text({
			message: 'Enter your OpenAI API key',
			placeholder: 'sk-...',
			validate: (v) =>
				!v || v.trim().length === 0 ? 'Please enter OPENAI_API_KEY' : undefined,
		})) as string;
		if (isCancel(openaiKeyInput)) {
			cancel('Aborted');
			return 1;
		}
		const openaiKey = String(openaiKeyInput).trim();

		let available: AvailableMcp[] = [];
		try {
			available = await listAvailableMcpsFromGitHub();
		} catch (err) {
			log.step(
				pc.yellow('Failed to list MCPs from GitHub; selection will be empty.')
			);
		}

		if (!available.length) {
			log.step('No MCPs found to select from. Skipping selection.');
		}

		let selectedMcps: string[] = [];
		if (available.length) {
			const options = available.map((m) => ({
				value: m.name,
				label: m.name,
				hint: m.tools.length ? `tools: ${m.tools.join(', ')}` : 'no tools',
			}));
			const picked = (await multiselect({
				message: 'Press space to select MCPs to include',
				required: false,
				options,
			})) as string[];
			if (isCancel(picked)) {
				cancel('Aborted');
				return 1;
			}
			selectedMcps = picked;
		}

		const answers: InitAnswers = { projectName, sourceDir, selectedMcps };

		let targetRoot = process.cwd();
		let createdNewProject = false;

		if (!hasPkgJson) {
			const projName = answers.projectName!.trim();
			const projPath = path.resolve(process.cwd(), projName);
			if (existsSync(projPath)) {
				log.error(
					pc.yellow(
						`Folder "${projName}" already exists. Aborting to avoid overwrite.`
					)
				);
				return 1;
			}
			ensureDirSync(projPath);
			const pkgJson = {
				name: projName,
				private: true,
				type: 'module',
				dependencies: { mcpland: 'latest' },
			};
			writeFileSync(
				path.join(projPath, 'package.json'),
				JSON.stringify(pkgJson, null, 2) + '\n',
				'utf-8'
			);
			targetRoot = projPath;
			createdNewProject = true;
			log.step(pc.green(`Created project at ${projPath}`));
		} else {
			try {
				const pkgPath = path.join(targetRoot, 'package.json');
				const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as any;
				pkg.dependencies = pkg.dependencies || {};
				if (pkg.dependencies['mcpland'] !== 'latest') {
					pkg.dependencies['mcpland'] = 'latest';
					writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
					log.step(
						pc.cyan('Updated package.json: added mcpland@latest dependency')
					);
				}
			} catch (err) {
				log.error(
					pc.red(
						`Failed to update existing package.json: ${JSON.stringify(err, null, 2)}`
					)
				);
			}
		}

		const resolvedSourceDir = path.join(targetRoot, answers.sourceDir);
		ensureDirSync(resolvedSourceDir);

		if (answers.selectedMcps.length) {
			for (const mcp of answers.selectedMcps) {
				const destDir = path.join(resolvedSourceDir, mcp);
				if (existsSync(destDir)) {
					log.step(
						pc.yellow(
							`Skipping ${mcp} — already exists at ${path.relative(targetRoot, destDir)}`
						)
					);
					continue;
				}
				try {
					await copyMcpFromGitHub(mcp, destDir);
					log.step(pc.green(`Added ${mcp}`));
				} catch (err) {
					log.step(pc.yellow(`Failed to fetch ${mcp}: ${String(err)}`));
				}
			}
		}

		await writeConfigJson(targetRoot, answers.sourceDir, answers.selectedMcps);
		log.step(
			pc.green(`Wrote mcpland.json with ${answers.selectedMcps.length} MCP(s)`)
		);

		ensureGitignoreDefaults(targetRoot);
		upsertEnvVar(targetRoot, 'OPENAI_API_KEY', openaiKey);

		try {
			const bunBin = Bun.which('bun') ?? 'bun';
			const s = spinner();
			s.start(pc.yellow('Installing dependencies'));

			const proc = Bun.spawn([bunBin, 'install'], {
				cwd: targetRoot,
				stdout: 'pipe',
				stderr: 'pipe',
			});

			const code = await proc.exited;

			if (code !== 0) {
				s.stop('Failed to install dependencies');
				log.error(pc.red('bun install exited with a non-zero code'));
			} else {
				s.stop(pc.green('Dependencies installed successfully'));
			}
		} catch (err) {
			log.error(
				pc.red(
					`Failed to run bun install automatically. Please run it manually. ${JSON.stringify(err, null, 2)}`
				)
			);
		}

		if (createdNewProject) {
			log.step(
				pc.cyan(`Next: cd ${path.relative(process.cwd(), targetRoot) || '.'}`)
			);
		}

		log.step(pc.cyan('Run `mcp link cursor` to add to Cursor'));
		log.step(pc.cyan('Run `mcp serve` to serve SSE requests'));

		outro('Initialization complete 🎉');
		return 0;
	}
}

function ensureDirSync(dir: string) {
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
}

function toolHasContextUrl(toolDir: string): boolean {
	const candidates = [
		path.join(toolDir, 'index.ts'),
		path.join(toolDir, 'index.js'),
	];

	for (const file of candidates) {
		try {
			const s = statSync(file);
			if (s.isFile()) {
				const content = readFileSync(file, 'utf-8');
				if (/contextUrl\s*:/.test(content) || /contextFile\s*:/.test(content))
					return true;
			}
		} catch {}
	}

	try {
		for (const entry of readdirSync(toolDir)) {
			const p = path.join(toolDir, entry);
			try {
				const st = statSync(p);
				if (st.isFile()) {
					const content = readFileSync(p, 'utf-8');
					if (/contextUrl\s*:/.test(content) || /contextFile\s*:/.test(content))
						return true;
				}
			} catch {}
		}
	} catch {}

	return false;
}

function parseGithubUrl(url: string): { owner: string; repo: string } {
	const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
	if (!match) throw new Error(`Invalid GitHub URL: ${url}`);

	return { owner: match[1], repo: match[2] };
}

async function fetchRepoTree(
	owner: string,
	repo: string,
	ref = 'main'
): Promise<Array<{ path: string; type: 'blob' | 'tree' }>> {
	const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
	const res = await fetch(url, { headers: { 'User-Agent': 'mcpland-cli' } });

	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new Error(
			`GitHub API error ${res.status} ${res.statusText}: ${text}`
		);
	}

	const json: any = await res.json();
	const tree: any[] = Array.isArray(json?.tree) ? json.tree : [];

	return tree.map((e) => ({
		path: String(e.path),
		type: e.type as 'blob' | 'tree',
	}));
}

async function copyMcpFromGitHub(mcpName: string, destDir: string) {
	const { owner, repo } = parseGithubUrl(GITHUB_URL);

	const ref = 'main';
	const tree = await fetchRepoTree(owner, repo, ref);
	const prefix = `src/mcps/${mcpName}/`;
	const files = tree.filter(
		(e) => e.type === 'blob' && e.path.startsWith(prefix)
	);

	if (!files.length)
		throw new Error(`MCP '${mcpName}' not found in GitHub repo`);

	for (const f of files) {
		const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${f.path}`;
		const res = await fetch(rawUrl, {
			headers: { 'User-Agent': 'mcpland-cli' },
		});

		if (!res.ok) {
			const text = await res.text().catch(() => '');
			throw new Error(`HTTP ${res.status} for ${rawUrl}: ${text}`);
		}

		const ab = await res.arrayBuffer();
		const buf = Buffer.from(ab);
		const rel = f.path.substring(prefix.length);
		const outPath = path.join(destDir, rel);

		ensureDirSync(path.dirname(outPath));
		writeFileSync(outPath, buf);
	}
}

async function listAvailableMcpsFromGitHub(): Promise<AvailableMcp[]> {
	const { owner, repo } = parseGithubUrl(GITHUB_URL);
	const ref = 'main';
	const tree = await fetchRepoTree(owner, repo, ref);
	const mcpToTools = new Map<string, Set<string>>();
	for (const entry of tree) {
		if (entry.type !== 'tree') continue;
		const parts = entry.path.split('/');
		if (parts.length >= 3 && parts[0] === 'src' && parts[1] === 'mcps') {
			const mcp = parts[2];
			if (!mcpToTools.has(mcp)) mcpToTools.set(mcp, new Set());
			if (parts.length >= 5 && parts[3] === 'tools') {
				const tool = parts[4];
				if (tool) mcpToTools.get(mcp)!.add(tool);
			}
		}
	}
	return Array.from(mcpToTools.entries()).map(([name, tools]) => ({
		name,
		tools: Array.from(tools),
	}));
}

function buildRegistry(
	destRoot: string,
	sourceDir: string,
	selected: string[]
) {
	const registry: NonNullable<McpLandJson['registry']> = {};
	const resolvedSourceDir = path.join(destRoot, sourceDir);
	for (const mcp of selected) {
		const mcpDir = path.join(resolvedSourceDir, mcp);
		const toolsDir = path.join(mcpDir, 'tools');
		let tools: string[] = [];
		try {
			tools = readdirSync(toolsDir).filter((t) => {
				try {
					return statSync(path.join(toolsDir, t)).isDirectory();
				} catch {
					return false;
				}
			});
		} catch {}

		const toolEntries: Record<string, { enabled?: boolean }> = {};
		for (const tool of tools) {
			const toolDir = path.join(toolsDir, tool);
			const hasCtx = toolHasContextUrl(toolDir);
			toolEntries[tool] = { enabled: hasCtx ? false : true };
		}

		registry[mcp] = {
			enabled: true,
			tools: toolEntries,
		};
	}
	return registry;
}

async function fetchConfigFromGitHub(): Promise<McpLandJson | null> {
	const { owner, repo } = parseGithubUrl(GITHUB_URL);
	const ref = 'main';
	const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/mcpland.json`;
	const res = await fetch(rawUrl, { headers: { 'User-Agent': 'mcpland-cli' } });
	if (!res.ok) return null;
	const text = await res.text();
	try {
		return JSON.parse(text) as McpLandJson;
	} catch {
		return null;
	}
}

async function writeConfigJson(
	destRoot: string,
	sourceDir: string,
	selected: string[]
) {
	const destCfgPath = path.join(destRoot, 'mcpland.json');
	let cfg: McpLandJson = {};

	if (existsSync(destCfgPath)) {
		try {
			cfg = JSON.parse(readFileSync(destCfgPath, 'utf-8')) as McpLandJson;
		} catch {
			cfg = {};
		}
	} else {
		try {
			const remote = await fetchConfigFromGitHub();
			if (remote) cfg = remote;
		} catch {
			cfg = {};
		}
	}

	cfg.source = sourceDir;
	cfg.registry = buildRegistry(destRoot, sourceDir, selected);

	writeFileSync(destCfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf-8');
}

function ensureGitignoreHasEntry(
	destRoot: string,
	entry: string,
	label?: string
) {
	const gitignorePath = path.join(destRoot, '.gitignore');
	let content = '';
	try {
		if (existsSync(gitignorePath))
			content = readFileSync(gitignorePath, 'utf-8');
	} catch {}

	const lines = content.split(/\r?\n/);
	const has = lines.some((line) => {
		const currentLine = line.trim();
		return currentLine === entry || currentLine === `/${entry}`;
	});
	if (!has) {
		const needsNewLine = content.length > 0 && !content.endsWith('\n');
		const updatedFile =
			(needsNewLine ? content + '\n' : content) + `${entry}\n`;
		writeFileSync(gitignorePath, updatedFile, 'utf-8');
		log.step(pc.green(`Updated .gitignore to include ${label ?? entry}`));
	}
}

function ensureGitignoreDefaults(destRoot: string) {
	ensureGitignoreHasEntry(destRoot, '.cursor', '.cursor');
	ensureGitignoreHasEntry(destRoot, '.env', '.env');
}

function upsertEnvVar(destRoot: string, key: string, value: string) {
	const envPath = path.join(destRoot, '.env');
	let content = '';
	try {
		if (existsSync(envPath)) content = readFileSync(envPath, 'utf-8');
	} catch {}

	const lines = content.split(/\r?\n/).filter(Boolean);
	const keyEq = `${key}=`;
	let found = false;
	const next = lines.map((line) => {
		if (line.trim().startsWith('#')) return line;
		if (line.startsWith(keyEq)) {
			found = true;
			return `${key}=${value}`;
		}
		return line;
	});
	if (!found) next.push(`${key}=${value}`);
	const out = next.join('\n') + '\n';
	writeFileSync(envPath, out, 'utf-8');
	log.step(pc.green(`Updated .env to include ${key}`));
}
