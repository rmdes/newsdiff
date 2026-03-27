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

/**
 * Determines if a diff is "boring" — not worth showing to users.
 * Boring diffs include: whitespace-only, timestamp/time-ago changes,
 * tiny numeric changes, and other noise patterns.
 */
export function isBoring(oldText: string, newText: string): boolean {
	// Whitespace-only changes
	const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
	if (normalize(oldText) === normalize(newText)) return true;

	// Strip timestamps, relative times, and update/publish metadata before comparing
	const stripTime = (s: string) =>
		s
			// Relative times: "8 HRS ago", "3 hours ago", "2 mins ago", "5 minutes read", etc.
			.replace(/\d+\s*(hrs?|hours?|mins?|minutes?|secs?|seconds?|days?|weeks?|months?)\s*(ago|read|old)?/gi, '')
			// Absolute times: "12:34", "12:34 PM", "3:10 PM"
			.replace(/\b\d{1,2}:\d{2}\s*(AM|PM)?\b/gi, '')
			// ISO dates: "2026-03-24"
			.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
			// European/US dates: "24/03/2026", "03/24/2026"
			.replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '')
			// "Mar 24", "March 24, 2026"
			.replace(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2}(?:,?\s*\d{4})?\b/gi, '')
			// "24 March 2026"
			.replace(/\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*(?:\s+\d{4})?\b/gi, '')
			// "Updated ...", "Published ...", "Posted ...", "Modified ...", "Last modified: ..."
			// followed by optional date/time text (greedy up to next sentence or newline)
			.replace(/[•·\-–—]?\s*(?:updated|published|posted|modified|last\s+modified)\s*:?\s*[^\n.]*/gi, '')
			// Timezone offsets: "GMT+1", "UTC-5", "EST"
			.replace(/\b(?:GMT|UTC|EST|CST|MST|PST|CET|CEST|BST|IST|JST|KST|AEST|AEDT)[+-]?\d*\b/gi, '');

	if (normalize(stripTime(oldText)) === normalize(stripTime(newText))) return true;

	// Very small changes in large text are likely noise
	const changes = diffWords(oldText, newText);
	const added = changes.filter(c => c.added);
	const removed = changes.filter(c => c.removed);
	const totalChanged = added.reduce((s, c) => s + c.value.length, 0)
		+ removed.reduce((s, c) => s + c.value.length, 0);
	const totalLength = Math.max(oldText.length, newText.length);

	// If total changed chars are tiny relative to the document, check if it's just numbers
	if (totalChanged <= 10 && totalLength > 200) {
		const allChangedText = [...added, ...removed].map(c => c.value).join('');
		// Only numbers, whitespace, and punctuation changed
		if (/^[\d\s.,;:!?/\-–—]+$/.test(allChangedText)) return true;
	}

	return false;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}
