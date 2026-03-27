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

	it('returns true for relative time changes ("8 HRS ago" -> "9 HRS ago")', () => {
		const old = 'Article title\n\nSome description.\n\n8 HRS ago\n\n2 mins read';
		const new_ = 'Article title\n\nSome description.\n\n9 HRS ago\n\n2 mins read';
		expect(isBoring(old, new_)).toBe(true);
	});

	it('returns true for "3 hours ago" -> "4 hours ago"', () => {
		const old = 'Great article content here.\n\nPublished 3 hours ago';
		const new_ = 'Great article content here.\n\nPublished 4 hours ago';
		expect(isBoring(old, new_)).toBe(true);
	});

	it('returns true for small numeric-only changes in large text', () => {
		const body = 'A'.repeat(500);
		expect(isBoring(`${body}\n\n123 views`, `${body}\n\n456 views`)).toBe(true);
	});

	it('returns false for real content changes even if small', () => {
		expect(isBoring('The president said hello', 'The president said goodbye')).toBe(false);
	});

	it('returns true for date-only changes', () => {
		const old = 'Article content.\n\nMar 24\n\n2 mins read';
		const new_ = 'Article content.\n\nMar 25\n\n2 mins read';
		expect(isBoring(old, new_)).toBe(true);
	});

	it('returns true for appended "Updated HH:MM" timestamp', () => {
		const old = 'Published on 27/03/2026 - 12:39 GMT+1 Ukraine and Saudi Arabia agreed on defence cooperation.';
		const new_ = 'Published on 27/03/2026 - 12:39 GMT+1 • Updated 15:10 Ukraine and Saudi Arabia agreed on defence cooperation.';
		expect(isBoring(old, new_)).toBe(true);
	});

	it('returns true for "Updated March 27, 2026" appended', () => {
		const old = 'Some article content here.\n\nPublished March 27, 2026';
		const new_ = 'Some article content here.\n\nPublished March 27, 2026\n\nUpdated March 27, 2026 at 3:10 PM';
		expect(isBoring(old, new_)).toBe(true);
	});

	it('returns true for "Last modified: DATE" changes', () => {
		const old = 'Article text.\n\nLast modified: 2026-03-26';
		const new_ = 'Article text.\n\nLast modified: 2026-03-27';
		expect(isBoring(old, new_)).toBe(true);
	});

	it('returns true for "Updated TIME" replacing "Published TIME"', () => {
		const old = 'Content.\n\nPublished 12:39';
		const new_ = 'Content.\n\nUpdated 15:10';
		expect(isBoring(old, new_)).toBe(true);
	});
});
