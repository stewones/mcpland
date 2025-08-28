export async function fetchWithRetry(
	url: string,
	{
		maxRetries = 5,
		baseDelayMs = 500,
	}: {
		maxRetries?: number;
		baseDelayMs?: number;
	} = {}
): Promise<Response> {
	let lastError: Error | undefined;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
			if (res.ok) return res;
			if (res.status >= 400 && res.status < 500) {
				throw new Error(`HTTP ${res.status} ${res.statusText}`);
			}
			lastError = new Error(`HTTP ${res.status} ${res.statusText}`);
		} catch (err) {
			lastError = err as Error;
		}
		if (attempt < maxRetries) {
			const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
			await new Promise((r) => setTimeout(r, delay));
		}
	}
	throw lastError ?? new Error('fetchWithRetry: unknown error');
}
