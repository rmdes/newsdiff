import { describe, it, expect } from 'vitest';
import { isMastodonConfigured, buildMastodonStatus } from './mastodon';

describe('isMastodonConfigured', () => {
	it('returns false when empty', () => {
		expect(isMastodonConfigured('', '')).toBe(false);
	});
	it('returns true when both set', () => {
		expect(isMastodonConfigured('https://mastodon.social', 'token')).toBe(true);
	});
});

describe('buildMastodonStatus', () => {
	it('builds root status', () => {
		const s = buildMastodonStatus({
			isRoot: true, articleUrl: 'https://example.com/article',
			articleTitle: 'Test Article', feedName: 'NYT'
		});
		expect(s).toContain('Test Article');
		expect(s).toContain('https://example.com/article');
	});
	it('builds reply status', () => {
		const s = buildMastodonStatus({
			isRoot: false, articleUrl: 'https://example.com/article',
			articleTitle: 'Test', feedName: 'NYT',
			titleChanged: true, contentChanged: true, charsAdded: 100, charsRemoved: 50
		});
		expect(s).toContain('Headline');
		expect(s).toContain('Content');
	});
});
