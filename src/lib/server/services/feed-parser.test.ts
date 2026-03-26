import { describe, it, expect } from 'vitest';
import { parseFeedItems } from './feed-parser';

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
	<channel>
		<title>Test Feed</title>
		<link>https://example.com</link>
		<item>
			<title>Article One</title>
			<link>https://example.com/article-1</link>
			<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
		</item>
		<item>
			<title>Article Two</title>
			<link>https://example.com/article-2</link>
		</item>
	</channel>
</rss>`;

describe('parseFeedItems', () => {
	it('extracts items from RSS feed XML', async () => {
		const items = await parseFeedItems(RSS_FEED);
		expect(items).toHaveLength(2);
		expect(items[0].title).toBe('Article One');
		expect(items[0].url).toBe('https://example.com/article-1');
		expect(items[1].title).toBe('Article Two');
	});
	it('returns empty array for empty feed', async () => {
		const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>`;
		const items = await parseFeedItems(xml);
		expect(items).toHaveLength(0);
	});
});
