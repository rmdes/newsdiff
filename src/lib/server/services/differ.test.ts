import { describe, it, expect } from 'vitest';
import { computeDiff, isBoring } from './differ';

describe('computeDiff', () => {
	it('detects word-level changes', () => {
		const result = computeDiff('The quick brown fox', 'The slow brown fox');
		expect(result.html).toContain('<del>');
		expect(result.html).toContain('<ins>');
		expect(result.charsAdded).toBeGreaterThan(0);
		expect(result.charsRemoved).toBeGreaterThan(0);
	});
	it('returns empty diff for identical text', () => {
		const result = computeDiff('same text', 'same text');
		expect(result.html).not.toContain('<ins>');
		expect(result.html).not.toContain('<del>');
		expect(result.charsAdded).toBe(0);
		expect(result.charsRemoved).toBe(0);
	});
	it('handles additions', () => {
		const result = computeDiff('hello', 'hello world');
		expect(result.html).toContain('<ins>');
		expect(result.charsAdded).toBeGreaterThan(0);
	});
	it('handles deletions', () => {
		const result = computeDiff('hello world', 'hello');
		expect(result.html).toContain('<del>');
		expect(result.charsRemoved).toBeGreaterThan(0);
	});
});

describe('isBoring', () => {
	it('returns true for whitespace-only changes', () => {
		expect(isBoring('hello  world', 'hello world')).toBe(true);
	});
	it('returns false for substantive changes', () => {
		expect(isBoring('The quick brown fox', 'The slow brown fox')).toBe(false);
	});
	it('returns true for identical content', () => {
		expect(isBoring('same', 'same')).toBe(true);
	});
});
