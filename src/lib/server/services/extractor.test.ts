import { describe, it, expect } from 'vitest';
import { extractArticle, normalizeText, computeHash } from './extractor';

describe('extractArticle', () => {
	it('extracts title and structured content from HTML', async () => {
		const html = `<html><head><title>Test Article</title></head><body><article><h1>Test Article</h1><p>This is the first paragraph of a longer article that needs enough content for readability to consider it worth extracting. The article discusses important topics.</p><p>This is the second paragraph with more substantial content. It adds detail and context to the main points raised in the first paragraph above.</p><p>This is the third paragraph concluding the article with final thoughts and a summary of the key points discussed throughout.</p></article></body></html>`;
		const result = await extractArticle(html, 'https://example.com/article');
		expect(result).not.toBeNull();
		expect(result!.title).toBe('Test Article');
		expect(result!.content).toContain('first paragraph');
		expect(result!.content).toContain('\n\n');
		expect(result!.content).not.toContain('\n\n\n');
	});

	it('strips images and nav elements from content', async () => {
		const html = `<html><head><title>Test</title></head><body><article><h1>Test</h1><p>Real paragraph one with enough text to pass the minimum length requirement for readability extraction to work properly and not get rejected.</p><img src="photo.jpg" /><nav><a href="/">Home</a></nav><p>Real paragraph two with additional substantial content that adds meaningful context to the article being extracted here.</p><p>Third paragraph with even more content to ensure readability considers this a valid article worth extracting from the page.</p></article></body></html>`;
		const result = await extractArticle(html, 'https://example.com/article');
		expect(result).not.toBeNull();
		expect(result!.content).not.toContain('photo.jpg');
		expect(result!.content).not.toContain('Home');
		expect(result!.content).toContain('Real paragraph one');
		expect(result!.content).toContain('Real paragraph two');
	});

	it('rejects feed listing content', async () => {
		const html = `<html><head><title>News</title></head><body><article>
			<h2>Article One</h2><p>Teaser text.</p><p>5 MINS ago</p><p>2 mins read</p>
			<h2>Article Two</h2><p>Another teaser.</p><p>1 HR ago</p><p>3 mins read</p>
			<h2>Article Three</h2><p>More teaser.</p><p>2 HRS ago</p><p>2 mins read</p>
			<h2>Article Four</h2><p>Yet another teaser.</p><p>3 HRS ago</p><p>2 mins read</p>
			<h2>Article Five</h2><p>Last teaser.</p><p>4 HRS ago</p><p>1 mins read</p>
		</article></body></html>`;
		const result = await extractArticle(html, 'https://example.com/feed');
		expect(result).toBeNull();
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
