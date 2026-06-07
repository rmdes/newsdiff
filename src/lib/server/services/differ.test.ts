import { describe, it, expect } from 'vitest';
import { computeDiff, isBoring, isBoringTitleChange, evaluateChange, isPureAddition } from './differ';

describe('evaluateChange', () => {
	it('reports a real headline + body edit as a non-boring change with both diff sections', () => {
		const r = evaluateChange(
			'Drones hit St Petersburg', 'Russia says 100 drones downed.',
			'Drones target St Petersburg', 'Russia says 140 drones were downed over Leningrad.',
			{ siteName: 'BBC News' }
		);
		expect(r.titleChanged).toBe(true);
		expect(r.contentChanged).toBe(true);
		expect(r.isBoring).toBe(false);
		expect(r.diffHtml).toContain('diff-title');
		expect(r.diffHtml).toContain('diff-content');
	});

	it('suppresses a site-identity title change but keeps the real content change', () => {
		const r = evaluateChange(
			'A Node on the Web', 'old body text here that is the note content',
			'', 'new body text here that is the note content rewritten',
			{ siteName: 'A Node on the Web' }
		);
		expect(r.titleChanged).toBe(false);              // identity noise, not a headline edit
		expect(r.contentChanged).toBe(true);
		expect(r.diffHtml).not.toContain('diff-title');  // no "A Node on the Web" title diff shown
		expect(r.diffHtml).toContain('diff-content');
		expect(r.isBoring).toBe(false);                  // content genuinely changed
	});

	it('honors a feed opting out of title tracking entirely', () => {
		const r = evaluateChange(
			'Real Headline One', 'body one',
			'Real Headline Two', 'body two changed',
			{ ignoreTitleChanges: true }
		);
		expect(r.titleChanged).toBe(false);
		expect(r.diffHtml).not.toContain('diff-title');
		expect(r.contentChanged).toBe(true);
	});

	it('marks a pure timestamp/whitespace change as boring', () => {
		const r = evaluateChange(
			'Headline', 'Posted 3:10 PM. The body is identical.',
			'Headline', 'Posted 4:20 PM. The body is identical.',
			{}
		);
		expect(r.isBoring).toBe(true);
	});

	it('is boring when title noise rides along with boring content', () => {
		const r = evaluateChange(
			'A Node on the Web', 'Same content.',
			'', 'Same content.',
			{ siteName: 'A Node on the Web' }
		);
		expect(r.titleChanged).toBe(false);
		expect(r.isBoring).toBe(true);
	});

	it('marks a live-blog pure append as boring', () => {
		const r = evaluateChange(
			'', 'Entry one. Entry two.',
			'', 'Entry one. Entry two. Entry three.',
			{ isLiveBlog: true }
		);
		expect(r.isBoring).toBe(true);
	});

	it('marks a live-blog append-with-ticking-timers as boring', () => {
		const r = evaluateChange(
			'', 'DRS enabled 18m ago. Lights out 1h ago.',
			'', 'Crash 2m ago. DRS enabled 27m ago. Lights out 2h ago.',
			{ isLiveBlog: true }
		);
		expect(r.isBoring).toBe(true);
	});

	it('keeps a live-blog edit of a past entry visible (not boring)', () => {
		const r = evaluateChange(
			'', 'DRS enabled 18m ago. Lights out 1h ago.',
			'', 'DRS disabled 27m ago. Lights out 2h ago.',
			{ isLiveBlog: true }
		);
		expect(r.isBoring).toBe(false);
	});

	it('does NOT treat a regular-article addition as boring', () => {
		const r = evaluateChange(
			'', 'Para one.',
			'', 'Para one. Para two added later.',
			{}
		);
		expect(r.isBoring).toBe(false);
	});
});

describe('isBoringTitleChange', () => {
	it('treats title removal (-> empty) as boring noise', () => {
		// Titleless posts (notes/reposts) correctly extract an empty title.
		expect(isBoringTitleChange('A Node on the Web', '')).toBe(true);
	});

	it('treats a change to/from the site identity as boring noise', () => {
		// Renaming the site/feed identity must not look like a real headline edit.
		expect(isBoringTitleChange('A Node on the Web', 'A New Identity', 'A Node on the Web')).toBe(true);
		expect(isBoringTitleChange('Old Site Name', 'New Site Name', 'New Site Name')).toBe(true);
	});

	it('treats identical titles as boring', () => {
		expect(isBoringTitleChange('Same Headline', 'Same Headline')).toBe(true);
	});

	it('treats timestamp-only title noise as boring', () => {
		expect(isBoringTitleChange('Breaking news 3:10 PM', 'Breaking news 4:20 PM')).toBe(true);
	});

	it('does NOT suppress a real headline edit', () => {
		// The whole point of the app — genuine headline changes must still count.
		expect(isBoringTitleChange('Trump says X', 'Trump says Y', 'A Node on the Web')).toBe(false);
	});

	it('does NOT treat two distinct real headlines as boring', () => {
		// neither side is the site identity, both non-empty -> real change
		expect(isBoringTitleChange('Drones hit St Petersburg', 'Drones target St Petersburg')).toBe(false);
	});
});

describe('computeDiff', () => {
	it('detects word-level changes', () => {
		const result = computeDiff('The quick brown fox', 'The slow brown fox');
		expect(result.html).toContain('<del>');
		expect(result.html).toContain('<ins>');
		expect(result.charsAdded).toBeGreaterThan(0);
		expect(result.charsRemoved).toBeGreaterThan(0);
	});
	it('returns empty diff for identical text', () => {
		const result = computeDiff('same text', 'same text');
		expect(result.html).not.toContain('<ins>');
		expect(result.html).not.toContain('<del>');
		expect(result.charsAdded).toBe(0);
		expect(result.charsRemoved).toBe(0);
	});
	it('handles additions', () => {
		const result = computeDiff('hello', 'hello world');
		expect(result.html).toContain('<ins>');
		expect(result.charsAdded).toBeGreaterThan(0);
	});
	it('handles deletions', () => {
		const result = computeDiff('hello world', 'hello');
		expect(result.html).toContain('<del>');
		expect(result.charsRemoved).toBeGreaterThan(0);
	});
});

describe('isBoring', () => {
	it('returns true for whitespace-only changes', () => {
		expect(isBoring('hello  world', 'hello world')).toBe(true);
	});

	it('returns false for substantive changes', () => {
		expect(isBoring('The quick brown fox', 'The slow brown fox')).toBe(false);
	});

	it('returns true for identical content', () => {
		expect(isBoring('same', 'same')).toBe(true);
	});

	it('returns true for relative time changes ("8 HRS ago" -> "9 HRS ago")', () => {
		const old = 'Article title\n\nSome description.\n\n8 HRS ago\n\n2 mins read';
		const new_ = 'Article title\n\nSome description.\n\n9 HRS ago\n\n2 mins read';
		expect(isBoring(old, new_)).toBe(true);
	});

	it('returns true for "3 hours ago" -> "4 hours ago"', () => {
		const old = 'Great article content here.\n\nPublished 3 hours ago';
		const new_ = 'Great article content here.\n\nPublished 4 hours ago';
		expect(isBoring(old, new_)).toBe(true);
	});

	// Live blogs (e.g. Guardian) stamp every entry with abbreviated relative times
	// that tick on each poll. Only the "ago"/"old" form is stripped so real
	// measurements (a bare "16m") are never mistaken for a timestamp.
	it('returns true for abbreviated minutes "16m ago" -> "25m ago"', () => {
		// Neutral wording (no "posted"/"updated") so this exercises the abbreviation
		// stripping itself, not the boilerplate-keyword rule.
		const old = 'Key events\n\nThe standings shifted 16m ago in dramatic fashion.';
		const new_ = 'Key events\n\nThe standings shifted 25m ago in dramatic fashion.';
		expect(isBoring(old, new_)).toBe(true);
	});

	it('returns true for abbreviated hours "2h ago" -> "3h ago"', () => {
		expect(isBoring('Race report filed 2h ago.', 'Race report filed 3h ago.')).toBe(true);
	});

	it('returns true for abbreviated days "1d ago" -> "2d ago"', () => {
		expect(isBoring('The qualifying session ran 1d ago at Monaco.', 'The qualifying session ran 2d ago at Monaco.')).toBe(true);
	});

	it('returns true when several live-blog timers tick but no entry is added', () => {
		const body = 'Antonelli leads the race.';
		const old = `${body}\n\n18m ago\n\nDRS enabled.\n\n1h ago\n\nLights out.`;
		const new_ = `${body}\n\n27m ago\n\nDRS enabled.\n\n2h ago\n\nLights out.`;
		expect(isBoring(old, new_)).toBe(true);
	});

	it('does NOT strip a bare abbreviated number without an "ago" suffix', () => {
		// "16m" here is a measurement/figure, not a timestamp — a real edit.
		expect(isBoring('A crowd of 16m gathered.', 'A crowd of 25m gathered.')).toBe(false);
	});

	it('returns false when a live-blog poll adds real new commentary', () => {
		const old = 'Key events\n\n18m ago\n\nLights out and away we go.';
		const new_ = 'Key events\n\n27m ago\n\nLights out and away we go.\n\n5m ago\n\nAntonelli takes the lead with a stunning overtake into the chicane.';
		expect(isBoring(old, new_)).toBe(false);
	});

	it('returns true for small numeric-only changes in large text', () => {
		const body = 'A'.repeat(500);
		expect(isBoring(`${body}\n\n123 views`, `${body}\n\n456 views`)).toBe(true);
	});

	it('returns false for real content changes even if small', () => {
		expect(isBoring('The president said hello', 'The president said goodbye')).toBe(false);
	});

	it('returns true for date-only changes', () => {
		const old = 'Article content.\n\nMar 24\n\n2 mins read';
		const new_ = 'Article content.\n\nMar 25\n\n2 mins read';
		expect(isBoring(old, new_)).toBe(true);
	});

	it('returns true for appended "Updated HH:MM" timestamp', () => {
		const old = 'Published on 27/03/2026 - 12:39 GMT+1 Ukraine and Saudi Arabia agreed on defence cooperation.';
		const new_ = 'Published on 27/03/2026 - 12:39 GMT+1 • Updated 15:10 Ukraine and Saudi Arabia agreed on defence cooperation.';
		expect(isBoring(old, new_)).toBe(true);
	});

	it('returns true for "Updated March 27, 2026" appended', () => {
		const old = 'Some article content here.\n\nPublished March 27, 2026';
		const new_ = 'Some article content here.\n\nPublished March 27, 2026\n\nUpdated March 27, 2026 at 3:10 PM';
		expect(isBoring(old, new_)).toBe(true);
	});

	it('returns true for "Last modified: DATE" changes', () => {
		const old = 'Article text.\n\nLast modified: 2026-03-26';
		const new_ = 'Article text.\n\nLast modified: 2026-03-27';
		expect(isBoring(old, new_)).toBe(true);
	});

	it('returns true for "Updated TIME" replacing "Published TIME"', () => {
		const old = 'Content.\n\nPublished 12:39';
		const new_ = 'Content.\n\nUpdated 15:10';
		expect(isBoring(old, new_)).toBe(true);
	});
});

describe('isPureAddition', () => {
	it('true for a pure append', () => {
		expect(isPureAddition('Entry one. Entry two.', 'Entry one. Entry two. Entry three.')).toBe(true);
	});
	it('true for a pure prepend (reverse-chron live blog)', () => {
		expect(isPureAddition('Entry one. Entry two.', 'Entry zero. Entry one. Entry two.')).toBe(true);
	});
	it('false when an existing entry is edited', () => {
		expect(isPureAddition('DRS enabled. Lights out.', 'DRS disabled. Lights out.')).toBe(false);
	});
	it('false when an existing entry is deleted', () => {
		expect(isPureAddition('Entry one. Entry two. Entry three.', 'Entry one. Entry three.')).toBe(false);
	});
	it('true for identical or empty-old', () => {
		expect(isPureAddition('same', 'same')).toBe(true);
		expect(isPureAddition('', 'brand new content')).toBe(true);
	});
	it('true for a prepend even when older entries’ timers ticked', () => {
		const old = 'DRS enabled 18m ago. Lights out 1h ago.';
		const new_ = 'Crash at turn 1 2m ago. DRS enabled 27m ago. Lights out 2h ago.';
		expect(isPureAddition(old, new_)).toBe(true);
	});
	it('false for an edit even when timers also ticked', () => {
		const old = 'DRS enabled 18m ago. Lights out 1h ago.';
		const new_ = 'DRS disabled 27m ago. Lights out 2h ago.';
		expect(isPureAddition(old, new_)).toBe(false);
	});
});
