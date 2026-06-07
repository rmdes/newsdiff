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
			// Abbreviated relative times used by live blogs: "16m ago", "2h ago", "1d ago",
			// "3w ago", "30s ago", "2mo ago", "5y ago". The "ago"/"old" suffix is REQUIRED so
			// bare measurements (e.g. "a crowd of 16m") are never mistaken for a timestamp.
			.replace(/\b\d+\s*(?:mo|s|m|h|d|w|y)\s+(?:ago|old)\b/gi, '')
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

/**
 * Determines if a TITLE change is "boring" — identity/metadata noise rather than
 * a real headline edit, and therefore should not be shown or syndicated.
 *
 * Boring title changes include:
 *  - no real change (whitespace/case only)
 *  - the title being removed (titleless posts like notes/reposts -> empty)
 *  - the site/feed identity appearing on either side (renaming your site must not
 *    look like a headline edit on every article)
 *  - timestamp/date noise (delegated to isBoring)
 *
 * Real outlet headline edits (both sides non-empty, neither is the site identity)
 * are NOT boring — they are the whole point of the app.
 */
export function isBoringTitleChange(oldTitle: string, newTitle: string, siteName?: string): boolean {
	const norm = (s: string | null | undefined) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
	const oldN = norm(oldTitle);
	const newN = norm(newTitle);
	const siteN = norm(siteName);

	// No meaningful change.
	if (oldN === newN) return true;

	// Title removed — the post is genuinely titleless; not a headline edit.
	if (newN === '') return true;

	// Site/feed identity leaking into (or out of) the title field.
	if (siteN && (oldN === siteN || newN === siteN)) return true;

	// Timestamp / relative-time / date noise.
	return isBoring(oldTitle || '', newTitle || '');
}

/**
 * Per-feed noise policy. Extension point: add `boringTitlePatterns`,
 * `boringContentPatterns`, etc. here to let users define their own "boring"
 * elements per monitored site — evaluateChange() is the single place that
 * applies them, so the poller and WebSub handler stay in sync.
 */
export interface FeedPolicy {
	siteName?: string | null;
	/** When true, title changes on this feed are never treated as real edits. */
	ignoreTitleChanges?: boolean;
}

export interface ChangeEvaluation {
	titleChanged: boolean;
	contentChanged: boolean;
	diffHtml: string;
	charsAdded: number;
	charsRemoved: number;
	isBoring: boolean;
}

/**
 * Single source of truth for turning an old/new version into a diff record:
 * decides whether the title change is meaningful (vs identity/noise or opted
 * out per feed), builds the diff HTML, and computes whether the whole diff is
 * "boring" (and therefore must not be shown or syndicated).
 *
 * Both feed-poller and the WebSub push handler call this so their behavior
 * cannot drift.
 */
export function evaluateChange(
	oldTitle: string | null | undefined,
	oldContent: string,
	newTitle: string | null | undefined,
	newContent: string,
	policy: FeedPolicy = {}
): ChangeEvaluation {
	const oldT = oldTitle || '';
	const newT = newTitle || '';

	const titleRawChanged = oldT !== newT;
	const titleIsNoise =
		policy.ignoreTitleChanges === true || isBoringTitleChange(oldT, newT, policy.siteName ?? undefined);
	const titleChanged = titleRawChanged && !titleIsNoise;

	const contentChanged = oldContent !== newContent;

	const titleDiff = titleChanged
		? computeDiff(oldT, newT)
		: { html: '', charsAdded: 0, charsRemoved: 0 };
	const contentDiff = computeDiff(oldContent, newContent);

	const diffHtml = [
		titleChanged ? `<div class="diff-title">${titleDiff.html}</div>` : '',
		`<div class="diff-content">${contentDiff.html}</div>`
	]
		.filter(Boolean)
		.join('\n');

	// A diff is boring only if its content change is boring AND its title change
	// is absent/noise. Real headline edits or real body edits keep it interesting.
	const isBoringResult = isBoring(oldContent, newContent) && !titleChanged;

	return {
		titleChanged,
		contentChanged,
		diffHtml,
		charsAdded: titleDiff.charsAdded + contentDiff.charsAdded,
		charsRemoved: titleDiff.charsRemoved + contentDiff.charsRemoved,
		isBoring: isBoringResult
	};
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
