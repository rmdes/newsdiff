import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { mf2 } from 'microformats-parser';
import { createHash } from 'node:crypto';

export interface ExtractedArticle {
	title: string;
	byline: string | null;
	content: string;
	isLiveBlog: boolean;
}

type ExtractedContent = Omit<ExtractedArticle, 'isLiveBlog'>;

/** Detect a live blog generically: schema.org LiveBlogPosting, or a /live/ URL path. */
export function detectLiveBlog(html: string, url: string): boolean {
	if (html.includes('"LiveBlogPosting"')) return true;
	try {
		if (new URL(url).pathname.split('/').includes('live')) return true;
	} catch {
		// invalid URL — ignore
	}
	return false;
}

/** Reference properties whose target (URL) is part of the post's content. */
const REFERENCE_PROPERTIES = ['bookmark-of', 'repost-of', 'in-reply-to', 'like-of'] as const;

/** Extract the text of an mf2 property value (string, {value}, or h-* object). */
function propertyText(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object' && typeof (value as { value?: unknown }).value === 'string') {
		return (value as { value: string }).value;
	}
	return '';
}

/** Extract the canonical URL from an mf2 reference (h-cite object or bare URL string). */
function referenceUrl(reference: unknown): string {
	if (typeof reference === 'string') return reference;
	if (reference && typeof reference === 'object') {
		const url = (reference as { properties?: { url?: unknown[] } }).properties?.url?.[0];
		if (typeof url === 'string') return url;
	}
	return '';
}

/**
 * Extract content from microformats2 (IndieWeb h-entry) markup.
 *
 * This is the primary path for sites that publish mf2 (e.g. Indiekit/Eleventy
 * IndieWeb sites). It reads the post's MARKED properties — title (p-name),
 * body (e-content) and referenced target (u-bookmark-of / u-repost-of /
 * u-in-reply-to / u-like-of) — which structurally excludes page chrome
 * (navigation, AI-usage widgets, permalinks, dates) that readability-style
 * extractors otherwise scrape into the content of short posts.
 *
 * Returns null when the page has no usable h-entry, so the caller falls back
 * to Defuddle/Readability for non-mf2 sites (e.g. real news outlets).
 */
function extractFromMicroformats(html: string, url: string): ExtractedContent | null {
	let parsed;
	try {
		parsed = mf2(html, { baseUrl: url });
	} catch {
		return null;
	}

	const entries = parsed.items.filter((item) => item.type?.includes('h-entry'));
	if (entries.length === 0) return null;

	// Prefer the entry whose own URL matches the page; otherwise take the first.
	const stripSlash = (u: string) => u.replace(/\/+$/, '');
	const entry =
		entries.find((e) =>
			(e.properties.url as unknown[] | undefined)?.some(
				(u) => typeof u === 'string' && stripSlash(u) === stripSlash(url)
			)
		) ?? entries[0];

	const props = entry.properties as Record<string, unknown[]>;

	const title = propertyText(props.name?.[0]).replace(/\s+/g, ' ').trim();
	const byline = propertyText(props.author?.[0]).trim() || null;

	const parts: string[] = [];
	const body = propertyText(props.content?.[0]).trim();
	if (body) parts.push(body);

	for (const key of REFERENCE_PROPERTIES) {
		const refs = props[key];
		if (!Array.isArray(refs)) continue;
		for (const ref of refs) {
			const refUrl = referenceUrl(ref);
			if (refUrl) parts.push(refUrl);
		}
	}

	const content = parts
		.join('\n\n')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{3,}/g, '\n\n')
		.trim();

	// No body and no reference target — nothing meaningful; let the caller fall back.
	if (!content) return null;

	return { title, byline, content };
}

/**
 * Detect content that looks like a feed listing rather than an article.
 * Patterns: repeating "X ago" + "N mins read" lines, many short headline-like lines.
 */
function looksLikeFeedListing(text: string): boolean {
	const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
	if (lines.length < 5) return false;

	const timeAgoLines = lines.filter(l =>
		/^\d+\s*(mins?|hrs?|hours?|days?|weeks?|months?)\s*(ago)?$/i.test(l) ||
		/^\d+\s*mins?\s*read$/i.test(l) ||
		/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}$/i.test(l)
	);

	// 3+ time/read lines is a strong signal of a feed listing
	if (timeAgoLines.length >= 3) return true;

	const noiseRatio = timeAgoLines.length / lines.length;
	return noiseRatio > 0.1;
}

/**
 * Extract article content. Tries microformats2 (h-entry) first for IndieWeb
 * sites, then Defuddle, then Readability for plain news pages.
 */
export async function extractArticle(html: string, url: string): Promise<ExtractedArticle | null> {
	const content = await extractContent(html, url);
	if (!content) return null;
	return { ...content, isLiveBlog: detectLiveBlog(html, url) };
}

async function extractContent(html: string, url: string): Promise<ExtractedContent | null> {
	// Microformats2 first: IndieWeb sites mark the real post content explicitly,
	// so reading mf2 properties avoids scraping page chrome into short posts.
	const mf2Result = extractFromMicroformats(html, url);
	if (mf2Result) return mf2Result;

	// Try Defuddle next (for non-mf2 sites)
	try {
		const { Defuddle } = await import('defuddle/node');
		const result = await Defuddle(html, url);

		if (result?.content) {
			const content = htmlToStructuredText(result.content);
			if (content && content.length >= 50 && !looksLikeFeedListing(content)) {
				return {
					title: result.title || '',
					byline: result.author || null,
					content
				};
			}
		}
	} catch (err: any) {
		// Defuddle failed — fall through to Readability
	}

	// Fallback: Readability
	return extractWithReadability(html, url);
}

function extractWithReadability(html: string, url: string): ExtractedContent | null {
	const dom = new JSDOM(html, { url });
	const reader = new Readability(dom.window.document);
	const article = reader.parse();

	if (!article || !article.content) return null;

	const content = htmlToStructuredText(article.content);
	if (!content || content.length < 50) return null;

	// Reject feed listings even from Readability
	if (looksLikeFeedListing(content)) return null;

	return {
		title: article.title || '',
		byline: article.byline || null,
		content
	};
}

/**
 * Convert cleaned HTML to structured plain text.
 * Preserves paragraph breaks, strips images/nav/scripts.
 */
function htmlToStructuredText(html: string): string {
	const dom = new JSDOM(`<div>${html}</div>`);
	const root = dom.window.document.querySelector('div')!;

	for (const el of root.querySelectorAll('script, style, nav, figure, figcaption, img, video, audio, iframe, svg, button, input, form, aside')) {
		el.remove();
	}

	const blocks: string[] = [];

	function processNode(node: any) {
		if (node.nodeType === 3) {
			return node.textContent || '';
		}

		if (node.nodeType !== 1) return '';

		const tag = node.tagName?.toLowerCase() || '';

		if (tag === 'script' || tag === 'style') return '';

		const isBlock = [
			'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
			'li', 'blockquote', 'pre', 'tr', 'dt', 'dd',
			'section', 'article', 'header', 'footer'
		].includes(tag);

		let text = '';
		for (const child of node.childNodes) {
			text += processNode(child);
		}

		text = text.replace(/[ \t]+/g, ' ').trim();

		if (!text) return '';

		if (isBlock) {
			blocks.push(text);
			return '';
		}

		return text + ' ';
	}

	processNode(root);

	return blocks
		.filter(b => b.length > 0)
		.join('\n\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

export function normalizeText(text: string): string {
	return text
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{2,}/g, '\n')
		.replace(/^ +| +$/gm, '')
		.trim();
}

export function computeHash(text: string): string {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}
