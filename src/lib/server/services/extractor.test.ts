import { describe, it, expect } from 'vitest';
import { extractArticle, normalizeText, computeHash } from './extractor';

describe('extractArticle', () => {
	it('extracts title and content from HTML', () => {
		const html = `<html><head><title>Test Article</title></head><body><article><h1>Test Article</h1><p>This is the first paragraph of a longer article that needs enough content for readability to consider it worth extracting. The article discusses important topics.</p><p>This is the second paragraph with more substantial content. It adds detail and context to the main points raised in the first paragraph above.</p><p>This is the third paragraph concluding the article with final thoughts and a summary of the key points discussed throughout.</p></article></body></html>`;
		const result = extractArticle(html, 'https://example.com/article');
		expect(result).not.toBeNull();
		expect(result!.title).toBe('Test Article');
		expect(result!.content).toContain('first paragraph');
	});
});

describe('normalizeText', () => {
	it('collapses whitespace', () => {
		expect(normalizeText('hello   world\n\nfoo')).toBe('hello world\nfoo');
	});
	it('trims', () => {
		expect(normalizeText('  hello  ')).toBe('hello');
	});
});

describe('computeHash', () => {
	it('returns consistent SHA-256 hex digest', () => {
		const hash1 = computeHash('hello world');
		const hash2 = computeHash('hello world');
		expect(hash1).toBe(hash2);
		expect(hash1).toHaveLength(64);
	});
	it('returns different hashes for different inputs', () => {
		expect(computeHash('hello')).not.toBe(computeHash('world'));
	});
});
