import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { createHash } from 'node:crypto';

export interface ExtractedArticle {
	title: string;
	byline: string | null;
	content: string;
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
 * Extract article using Defuddle (primary) with Readability fallback.
 */
export async function extractArticle(html: string, url: string): Promise<ExtractedArticle | null> {
	// Try Defuddle first
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

function extractWithReadability(html: string, url: string): ExtractedArticle | null {
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
