import { describe, it, expect } from 'vitest';
import { rateLimit } from './rate-limit';

describe('rateLimit', () => {
	it('allows requests within the limit', () => {
		const key = `test-allow-${Date.now()}`;
		expect(rateLimit(key, 3, 60000)).toBe(true);
		expect(rateLimit(key, 3, 60000)).toBe(true);
		expect(rateLimit(key, 3, 60000)).toBe(true);
	});

	it('blocks requests exceeding the limit', () => {
		const key = `test-block-${Date.now()}`;
		expect(rateLimit(key, 2, 60000)).toBe(true);
		expect(rateLimit(key, 2, 60000)).toBe(true);
		expect(rateLimit(key, 2, 60000)).toBe(false);
		expect(rateLimit(key, 2, 60000)).toBe(false);
	});

	it('resets after window expires', async () => {
		const key = `test-reset-${Date.now()}`;
		expect(rateLimit(key, 1, 50)).toBe(true);
		expect(rateLimit(key, 1, 50)).toBe(false);
		await new Promise(r => setTimeout(r, 60));
		expect(rateLimit(key, 1, 50)).toBe(true);
	});

	it('tracks different keys independently', () => {
		const key1 = `test-key1-${Date.now()}`;
		const key2 = `test-key2-${Date.now()}`;
		expect(rateLimit(key1, 1, 60000)).toBe(true);
		expect(rateLimit(key1, 1, 60000)).toBe(false);
		expect(rateLimit(key2, 1, 60000)).toBe(true);
	});
});
