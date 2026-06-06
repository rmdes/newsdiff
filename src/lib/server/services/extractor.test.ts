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

	// --- microformats2 (IndieWeb) extraction ---
	// rmendes.net publishes h-entry markup. The post body lives in .e-content and the
	// referenced target lives in .u-bookmark-of / .u-repost-of / .u-in-reply-to (h-cite).
	// Page chrome (AI-usage widget, permalink, post date) sits in the entry wrapper but
	// OUTSIDE the marked mf2 properties — it must never leak into extracted content.

	const CHROME = `
		<time class="dt-published" datetime="2026-05-19">19 May 2026</time>
		<details><summary>AI: Text None</summary>
			<p><a href="/ai/">Learn more about AI usage on this site</a></p>
		</details>
		<a class="u-url" href="#">Permalink</a>`;

	it('extracts a bookmark with empty commentary as the bookmarked URL, not page chrome', async () => {
		const html = `<html><body><article class="h-entry">
			<h1 class="p-name">Plume — Micropub for browsers</h1>
			${CHROME}
			<div class="e-content"></div>
			<aside class="reply-context"><div class="u-bookmark-of h-cite">
				<a class="p-name u-url" href="https://rmdes.github.io/plume/">Plume — Micropub for browsers</a>
			</div></aside>
		</article></body></html>`;
		const result = await extractArticle(html, 'https://rmendes.net/bookmarks/2026/05/19/plume-micropub-for-browsers/');
		expect(result).not.toBeNull();
		expect(result!.title).toBe('Plume — Micropub for browsers');
		expect(result!.content).toContain('https://rmdes.github.io/plume/');
		expect(result!.content).not.toContain('Learn more about AI usage');
		expect(result!.content).not.toContain('Permalink');
	});

	it('extracts a titleless repost: commentary + reposted URL, with no chrome and no author-name title', async () => {
		const html = `<html><body><article class="h-entry">
			<span class="p-author h-card hidden"><a class="p-name u-url" href="https://rmendes.net">Ricardo Mendes</a></span>
			${CHROME}
			<div class="e-content"><p>interesting read…</p></div>
			<aside class="reply-context"><div class="u-repost-of h-cite">
				<a class="u-url" href="https://simonwillison.net/2026/Apr/30/zig-anti-ai/">Zig anti-AI</a>
			</div></aside>
		</article></body></html>`;
		const result = await extractArticle(html, 'https://rmendes.net/reposts/2026/05/01/009d7/');
		expect(result).not.toBeNull();
		expect(result!.title).not.toBe('Ricardo Mendes');
		expect(result!.title).toBe('');
		expect(result!.content).toContain('interesting read…');
		expect(result!.content).toContain('https://simonwillison.net/2026/Apr/30/zig-anti-ai/');
		expect(result!.content).not.toContain('Learn more about AI usage');
	});

	it('extracts a titleless note body from e-content, excluding wrapper chrome', async () => {
		const noteText = 'En France, pour que Justice se fasse, il ne suffit pas de porter plainte, ni de se ruiner avec des coûts exorbitants pour simplement accéder à la justice.';
		const html = `<html><body><article class="h-entry">
			<span class="p-author h-card hidden"><a class="p-name u-url" href="https://rmendes.net">Ricardo Mendes</a></span>
			${CHROME}
			<div class="e-content"><p>${noteText}</p></div>
		</article></body></html>`;
		const result = await extractArticle(html, 'https://rmendes.net/notes/2026/03/29/x/');
		expect(result).not.toBeNull();
		expect(result!.title).toBe('');
		expect(result!.content).toContain('accéder à la justice');
		expect(result!.content).not.toContain('Learn more about AI usage');
		expect(result!.content).not.toContain('Permalink');
		expect(result!.content).not.toContain('19 May 2026');
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
