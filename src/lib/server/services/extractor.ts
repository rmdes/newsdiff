import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import { createHash } from 'node:crypto';

export interface ExtractedArticle {
	title: string;
	byline: string | null;
	content: string;
}

export function extractArticle(html: string, url: string): ExtractedArticle | null {
	const { document } = parseHTML(html);
	const base = document.createElement('base');
	base.setAttribute('href', url);
	document.head.appendChild(base);

	const reader = new Readability(document);
	const article = reader.parse();

	if (!article || !article.content) return null;

	// Use the cleaned HTML and convert to structured plain text
	const content = htmlToStructuredText(article.content);
	if (!content || content.length < 50) return null;

	return {
		title: article.title || '',
		byline: article.byline || null,
		content
	};
}

/**
 * Convert cleaned HTML to structured plain text.
 * Preserves paragraph breaks, strips images/nav/scripts.
 * Much better than raw textContent which loses all structure.
 */
function htmlToStructuredText(html: string): string {
	// Parse the cleaned HTML
	const { document } = parseHTML(`<div>${html}</div>`);
	const root = document.querySelector('div')!;

	// Remove elements that don't contribute meaningful text
	for (const el of root.querySelectorAll('script, style, nav, figure, figcaption, img, video, audio, iframe, svg, button, input, form, aside')) {
		el.remove();
	}

	// Walk block elements and extract text with structure
	const blocks: string[] = [];

	function processNode(node: any) {
		if (node.nodeType === 3) {
			// Text node
			return node.textContent || '';
		}

		if (node.nodeType !== 1) return '';

		const tag = node.tagName?.toLowerCase() || '';

		// Skip hidden elements
		if (tag === 'script' || tag === 'style') return '';

		// Block-level elements get their own paragraph
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

	// Join blocks with double newlines, then clean up
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
