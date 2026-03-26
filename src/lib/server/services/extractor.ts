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

	if (!article || !article.textContent) return null;

	return {
		title: article.title || '',
		byline: article.byline || null,
		content: normalizeText(article.textContent)
	};
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
