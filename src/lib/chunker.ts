export interface ChunkOptions {
	maxChars?: number;
	overlap?: number;
}

export function chunkText(text: string | undefined, opts: ChunkOptions = {}) {
	const maxChars = opts.maxChars ?? 1200;
	const overlap = opts.overlap ?? 200;
	if (!text) return [] as string[];

	// Normalize line endings
	const lines = text.replace(/\r\n?/g, '\n').split('\n');
	const chunks: string[] = [];
	let current = '';

	for (const line of lines) {
		// If single line is too large, split it hard
		if (line.length > maxChars) {
			if (current) {
				chunks.push(current.trim());
				current = '';
			}
			for (let i = 0; i < line.length; i += maxChars) {
				chunks.push(line.slice(i, i + maxChars));
			}
			continue;
		}

		if ((current + '\n' + line).length > maxChars) {
			// Push and start new with overlap
			const pushed = current.trim();
			if (pushed) chunks.push(pushed);
			if (overlap > 0 && pushed.length > 0) {
				current = pushed.slice(Math.max(0, pushed.length - overlap));
			} else {
				current = '';
			}
		}
		current = current ? current + '\n' + line : line;
	}
	if (current.trim()) chunks.push(current.trim());
	return chunks;
}
