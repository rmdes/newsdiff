import { describe, it, expect } from 'vitest';
import { buildBlueskyPost, isBlueskyConfigured } from './bluesky';

describe('isBlueskyConfigured', () => {
	it('returns false when env vars are empty', () => {
		expect(isBlueskyConfigured('', '')).toBe(false);
	});
	it('returns true when both are set', () => {
		expect(isBlueskyConfigured('user.bsky.social', 'pass')).toBe(true);
	});
});

describe('buildBlueskyPost', () => {
	it('builds a root post with article link', () => {
		const post = buildBlueskyPost({
			isRoot: true, articleUrl: 'https://example.com/article',
			articleTitle: 'Test Article', feedName: 'NYT'
		});
		expect(post.text).toContain('Test Article');
		expect(post.text).toContain('example.com');
	});
	it('builds a reply post describing changes', () => {
		const post = buildBlueskyPost({
			isRoot: false, articleUrl: 'https://example.com/article',
			articleTitle: 'Test', feedName: 'NYT',
			titleChanged: true, contentChanged: false, charsAdded: 50, charsRemoved: 20
		});
		expect(post.text).toContain('Headline changed');
	});
});
