import { diffWords } from 'diff';

export interface DiffResult {
	html: string;
	charsAdded: number;
	charsRemoved: number;
}

export function computeDiff(oldText: string, newText: string): DiffResult {
	const changes = diffWords(oldText, newText);
	let charsAdded = 0;
	let charsRemoved = 0;

	const html = changes
		.map((part) => {
			const escaped = escapeHtml(part.value);
			if (part.added) {
				charsAdded += part.value.length;
				return `<ins>${escaped}</ins>`;
			}
			if (part.removed) {
				charsRemoved += part.value.length;
				return `<del>${escaped}</del>`;
			}
			return escaped;
		})
		.join('');

	return { html, charsAdded, charsRemoved };
}

export function isBoring(oldText: string, newText: string): boolean {
	const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
	return normalize(oldText) === normalize(newText);
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
