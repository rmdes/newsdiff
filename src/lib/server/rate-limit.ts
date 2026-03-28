const windows = new Map<string, { count: number; resetAt: number }>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
	const now = Date.now();
	if (now - lastCleanup < CLEANUP_INTERVAL) return;
	lastCleanup = now;
	for (const [key, entry] of windows) {
		if (entry.resetAt <= now) windows.delete(key);
	}
}

/**
 * Simple in-memory sliding window rate limiter.
 * Returns true if the request should be allowed, false if rate-limited.
 */
export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
	cleanup();

	const now = Date.now();
	const entry = windows.get(key);

	if (!entry || entry.resetAt <= now) {
		windows.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}

	if (entry.count >= maxRequests) {
		return false;
	}

	entry.count++;
	return true;
}
