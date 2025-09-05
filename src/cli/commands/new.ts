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

import { cancel, intro, isCancel, log, outro, text } from '@clack/prompts';

import { getRootDir, getSourceFolder, GITHUB_URL } from '../../lib/config';
import { McpLandCommand } from '../command';

type NewAnswers = {
	mcpName: string;
	mcpDescription: string;
	toolName: string;
	toolDescription: string;
};

export class NewCommand extends McpLandCommand {
	private visitedDirs: Set<string> = new Set();
	constructor() {
		super('new', 'Create a new MCP');
	}

	parseGithubUrl(url: string): { owner: string; repo: string } {
		const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
		if (!match) throw new Error(`Invalid GitHub URL: ${url}`);
		return { owner: match[1], repo: match[2] };
	}

	async fetchRepoTree(
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

	applyReplacements(
		content: string,
		replacements: Record<string, string>
	): string {
		let result = content;
		for (const [placeholder, value] of Object.entries(replacements)) {
			const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
			result = result.replace(regex, value);
		}
		return result;
	}

	async copyBaseTemplateFromGitHub(
		destDir: string,
		replacements: Record<string, string>
	) {
		const { owner, repo } = this.parseGithubUrl(GITHUB_URL);
		const ref = 'main';
		const tree = await this.fetchRepoTree(owner, repo, ref);
		const prefix = `src/mcps/_/`;
		const files = tree.filter(
			(e) => e.type === 'blob' && e.path.startsWith(prefix)
		);
		if (!files.length)
			throw new Error(`Base template '_' not found in GitHub repo`);

		for (const f of files) {
			const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${f.path}`;
			const res = await fetch(rawUrl, {
				headers: { 'User-Agent': 'mcpland-cli' },
			});
			if (!res.ok) {
				const text = await res.text().catch(() => '');
				throw new Error(`HTTP ${res.status} for ${rawUrl}: ${text}`);
			}
			const textContent = await res.text();
			const replaced = this.applyReplacements(textContent, replacements);
			const rel = f.path.substring(prefix.length);
			let outPath = path.join(destDir, rel);
			if (outPath.endsWith('.example')) outPath = outPath.slice(0, -8);
			this.ensureDirSync(path.dirname(outPath));
			writeFileSync(outPath, replaced, 'utf-8');
		}
	}

	printHelp(): void {
		console.log('Usage: mcp add [name]');
		console.log('');
		if (this.description) {
			console.log(this.description);
			console.log('');
		}

		console.log('Arguments:');
		console.log('  name                 Name of the new MCP');
		console.log('');

		console.log('  --help, -h           Show this help message');
	}

	validateMcpName(name: string): string | undefined {
		if (!name || name.trim().length === 0) {
			return 'Please enter a MCP name';
		}

		const trimmed = name.trim();

		// Check for valid identifier (letters, numbers, hyphens, underscores)
		if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(trimmed)) {
			return 'MCP name must start with a letter and contain only letters, numbers, hyphens, and underscores';
		}

		if (trimmed.length > 50) {
			return 'MCP name must be 50 characters or less';
		}

		return undefined;
	}

	ensureDirSync(dir: string) {
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
	}

	toPascalCase(str: string): string {
		return str
			.split(/[-_\s]+/)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join('');
	}

	checkMcpExists(mcpName: string): boolean {
		const rootDir = getRootDir();
		const sourceFolder = getSourceFolder();
		const mcpPath = path.join(rootDir, sourceFolder, mcpName);
		return existsSync(mcpPath);
	}

	getTemplatePath(): string {
		const rootDir = getRootDir();
		const sourceFolder = getSourceFolder();
		return path.join(rootDir, sourceFolder, '_');
	}

	copyFileWithReplacements(
		sourcePath: string,
		destPath: string,
		replacements: Record<string, string>
	) {
		let content = readFileSync(sourcePath, 'utf-8');

		// Replace all placeholders
		for (const [placeholder, value] of Object.entries(replacements)) {
			const regex = new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g');
			content = content.replace(regex, value);
		}

		// Remove .example extension from destination path
		const finalDestPath = destPath.slice(0, -8);

		this.ensureDirSync(path.dirname(finalDestPath));
		writeFileSync(finalDestPath, content, 'utf-8');
	}

	copyDirectoryRecursive(
		sourceDir: string,
		destDir: string,
		replacements: Record<string, string>
	) {
		this.visitedDirs.add(sourceDir);

		if (!existsSync(sourceDir)) {
			throw new Error(`Template directory not found: ${sourceDir}`);
		}

		const entries = readdirSync(sourceDir);

		for (const entry of entries) {
			const sourcePath = path.join(sourceDir, entry);
			const destPath = path.join(destDir, entry);
			const stat = statSync(sourcePath);

			if (stat.isDirectory()) {
				// Recursively copy directories
				this.ensureDirSync(destPath);
				this.copyDirectoryRecursive(sourcePath, destPath, replacements);
			} else if (stat.isFile()) {
				// Copy and process files
				this.copyFileWithReplacements(sourcePath, destPath, replacements);
			}
		}
	}

	async run(args: string[]): Promise<number> {
		// Reset visited directories for each run invocation
		this.visitedDirs.clear();
		const banner = figlet.textSync('MCPLAND', { font: 'Sub-Zero' });
		log.step(pc.greenBright(banner));

		intro(this.description);

		const parsed = this.parseArgs(args);
		let mcpName = parsed._[0] as string;

		// Get MCP name if not provided
		if (!mcpName) {
			const mcpNameInput = await text({
				message: 'MCP name',
				placeholder: 'my-awesome-mcp',
				validate: this.validateMcpName,
			});

			if (isCancel(mcpNameInput)) {
				cancel('Aborted');
				return 1;
			}

			mcpName = mcpNameInput as string;
		} else {
			// Validate provided name
			const validation = this.validateMcpName(mcpName);
			if (validation) {
				log.error(pc.red(validation));
				return 1;
			}
		}

		mcpName = mcpName.trim();

		// Check if MCP already exists
		if (this.checkMcpExists(mcpName)) {
			log.error(
				pc.red(`MCP "${mcpName}" already exists. Choose a different name.`)
			);
			return 1;
		}

		// Get MCP description
		const mcpDescription = await text({
			message: 'MCP description',
			placeholder: `${mcpName} MCP for enhanced functionality`,
			validate: (v) =>
				!v || v.trim().length === 0 ? 'Please enter a description' : undefined,
		});

		if (isCancel(mcpDescription)) {
			cancel('Aborted');
			return 1;
		}

		// Get tool name
		const toolName = await text({
			message: 'Initial tool name',
			placeholder: 'docs',
			initialValue: '',
			validate: (v) => {
				if (!v || v.trim().length === 0) return 'Please enter a tool name';
				if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(v.trim())) {
					return 'Tool name must start with a letter and contain only letters, numbers, hyphens, and underscores';
				}
				return undefined;
			},
		});

		if (isCancel(toolName)) {
			cancel('Aborted');
			return 1;
		}

		// Get tool description
		const toolDescription = await text({
			message: 'Tool description',
			placeholder: `${toolName} tool for ${mcpName}`,
			validate: (v) =>
				!v || v.trim().length === 0
					? 'Please enter a tool description'
					: undefined,
		});

		if (isCancel(toolDescription)) {
			cancel('Aborted');
			return 1;
		}

		const answers: NewAnswers = {
			mcpName: mcpName.trim(),
			mcpDescription: (mcpDescription as string).trim(),
			toolName: (toolName as string).trim(),
			toolDescription: (toolDescription as string).trim(),
		};

		try {
			// Prepare replacements
			const mcpClassName = this.toPascalCase(answers.mcpName);
			const toolClassName = this.toPascalCase(answers.toolName);

			const replacements = {
				MCP_NAME: answers.mcpName,
				MCP_DESCRIPTION: answers.mcpDescription,
				MCP_CLASS_NAME: mcpClassName,
				TOOL_NAME: answers.toolName,
				TOOL_DESCRIPTION: answers.toolDescription,
				TOOL_CLASS_NAME: toolClassName,
			};

			// Get paths
			const rootDir = getRootDir();
			const sourceFolder = getSourceFolder();
			const destPath = path.join(rootDir, sourceFolder, answers.mcpName);

			// Copy template from GitHub (no local fallback)
			log.step(pc.cyan('Creating MCP from template...'));
			await this.copyBaseTemplateFromGitHub(destPath, replacements);
			log.step(pc.green('✓ Pulled base template from GitHub'));

			// Rename the example tool directory to the actual tool name
			const exampleToolPath = path.join(destPath, 'tools', 'example');
			const exampleToolIndexPath = path.join(exampleToolPath, 'index.ts');
			const actualToolPath = path.join(destPath, 'tools', answers.toolName);

			// Read the tool file content (it was already processed and saved as index.ts)
			const toolContent = readFileSync(exampleToolIndexPath, 'utf-8');

			// Create new tool directory and file
			this.ensureDirSync(actualToolPath);
			writeFileSync(
				path.join(actualToolPath, 'index.ts'),
				toolContent,
				'utf-8'
			);

			// Remove example directory (simple approach - remove files then directory)
			const exampleFiles = readdirSync(exampleToolPath);
			for (const file of exampleFiles) {
				const fs = await import('node:fs');
				fs.unlinkSync(path.join(exampleToolPath, file));
			}
			const fs = await import('node:fs');
			fs.rmdirSync(exampleToolPath);

			this.logSuccess(answers.mcpName, answers.toolName);
			this.logNextSteps(destPath);

			/* c8 ignore next */
			outro('MCP created successfully! 🎉');
			return 0;
		} catch (error) {
			/* c8 ignore next 5 */
			log.error(
				pc.red(
					`Failed to create MCP: ${error instanceof Error ? error.message : String(error)}`
				)
			);
			return 1;
		}
	}

	/* c8 ignore next 4 */
	logSuccess(mcpName: string, toolName: string) {
		log.step(pc.green(`✓ Created MCP "${mcpName}" successfully`));
		log.step(pc.green(`✓ Created tool "${toolName}" successfully`));
	}

	/* c8 ignore next 11 */
	logNextSteps(destPath: string) {
		log.message(pc.cyan('\nNext steps:'));
		log.message(
			`• Edit ${path.relative(process.cwd(), destPath)} to customize your MCP`
		);
		log.message(
			`• Add more tools in ${path.relative(process.cwd(), path.join(destPath, 'tools'))}`
		);
		log.message(`• Update mcpland.json (optional)`);
		log.message(`• Run 'mcp serve' to test your MCP`);
	}
}
