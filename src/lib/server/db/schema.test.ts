import { describe, it, expect } from 'vitest';
import { feeds, articles, versions, diffs, socialPosts } from './schema';

describe('database schema', () => {
	it('feeds table has required columns', () => {
		expect(feeds.id).toBeDefined();
		expect(feeds.name).toBeDefined();
		expect(feeds.url).toBeDefined();
		expect(feeds.siteName).toBeDefined();
		expect(feeds.checkInterval).toBeDefined();
		expect(feeds.isActive).toBeDefined();
		expect(feeds.createdAt).toBeDefined();
	});

	it('articles table has required columns', () => {
		expect(articles.id).toBeDefined();
		expect(articles.feedId).toBeDefined();
		expect(articles.url).toBeDefined();
		expect(articles.firstSeenAt).toBeDefined();
		expect(articles.lastCheckedAt).toBeDefined();
		expect(articles.lastChangedAt).toBeDefined();
		expect(articles.checkCount).toBeDefined();
	});

	it('versions table has required columns', () => {
		expect(versions.id).toBeDefined();
		expect(versions.articleId).toBeDefined();
		expect(versions.title).toBeDefined();
		expect(versions.byline).toBeDefined();
		expect(versions.contentText).toBeDefined();
		expect(versions.contentHash).toBeDefined();
		expect(versions.versionNumber).toBeDefined();
		expect(versions.createdAt).toBeDefined();
	});

	it('diffs table has required columns', () => {
		expect(diffs.id).toBeDefined();
		expect(diffs.articleId).toBeDefined();
		expect(diffs.oldVersionId).toBeDefined();
		expect(diffs.newVersionId).toBeDefined();
		expect(diffs.titleChanged).toBeDefined();
		expect(diffs.contentChanged).toBeDefined();
		expect(diffs.diffHtml).toBeDefined();
		expect(diffs.charsAdded).toBeDefined();
		expect(diffs.charsRemoved).toBeDefined();
		expect(diffs.isBoring).toBeDefined();
		expect(diffs.createdAt).toBeDefined();
	});

	it('socialPosts table has required columns', () => {
		expect(socialPosts.id).toBeDefined();
		expect(socialPosts.diffId).toBeDefined();
		expect(socialPosts.platform).toBeDefined();
		expect(socialPosts.postUri).toBeDefined();
		expect(socialPosts.threadRootUri).toBeDefined();
		expect(socialPosts.imagePath).toBeDefined();
		expect(socialPosts.postedAt).toBeDefined();
		expect(socialPosts.error).toBeDefined();
	});
});
