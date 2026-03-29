import { describe, it, expect } from 'vitest';
import { parseFeedItems, discoverHub } from './feed-parser';

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

const ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
	<title>Atom Test</title>
	<entry>
		<title>Atom Article</title>
		<link href="https://example.com/atom-1" />
		<updated>2024-06-15T12:00:00Z</updated>
	</entry>
</feed>`;

const JSON_FEED = JSON.stringify({
	version: 'https://jsonfeed.org/version/1.1',
	title: 'JSON Feed Test',
	items: [
		{
			id: '1',
			url: 'https://example.com/json-1',
			title: 'JSON Article One',
			date_published: '2024-03-15T10:00:00Z'
		},
		{
			id: '2',
			external_url: 'https://example.com/json-2',
			title: 'JSON Article Two'
		},
		{
			id: '3',
			title: 'No URL item'
		}
	]
});

describe('parseFeedItems', () => {
	it('extracts items from RSS feed', async () => {
		const items = await parseFeedItems(RSS_FEED);
		expect(items).toHaveLength(2);
		expect(items[0].title).toBe('Article One');
		expect(items[0].url).toBe('https://example.com/article-1');
		expect(items[0].publishedAt).toBeInstanceOf(Date);
		expect(items[1].title).toBe('Article Two');
		expect(items[1].publishedAt).toBeNull();
	});

	it('extracts items from Atom feed', async () => {
		const items = await parseFeedItems(ATOM_FEED);
		expect(items).toHaveLength(1);
		expect(items[0].title).toBe('Atom Article');
		expect(items[0].url).toBe('https://example.com/atom-1');
	});

	it('extracts items from JSON Feed', async () => {
		const items = await parseFeedItems(JSON_FEED);
		expect(items).toHaveLength(2);
		expect(items[0].title).toBe('JSON Article One');
		expect(items[0].url).toBe('https://example.com/json-1');
		expect(items[0].publishedAt).toBeInstanceOf(Date);
		expect(items[1].title).toBe('JSON Article Two');
		expect(items[1].url).toBe('https://example.com/json-2');
		expect(items[1].publishedAt).toBeNull();
	});

	it('skips JSON Feed items without URL', async () => {
		const items = await parseFeedItems(JSON_FEED);
		const titles = items.map(i => i.title);
		expect(titles).not.toContain('No URL item');
	});

	it('returns empty array for empty RSS feed', async () => {
		const xml = `<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>`;
		const items = await parseFeedItems(xml);
		expect(items).toHaveLength(0);
	});

	it('returns empty array for empty JSON Feed', async () => {
		const json = JSON.stringify({ version: 'https://jsonfeed.org/version/1', title: 'Empty', items: [] });
		const items = await parseFeedItems(json);
		expect(items).toHaveLength(0);
	});
});

describe('discoverHub', () => {
	it('discovers hub from JSON Feed hubs array', () => {
		const json = JSON.stringify({
			version: 'https://jsonfeed.org/version/1.1',
			title: 'Test',
			hubs: [{ type: 'WebSub', url: 'https://hub.example.com/hub' }],
			items: []
		});
		expect(discoverHub(json)).toBe('https://hub.example.com/hub');
	});

	it('discovers hub from RSS link rel="hub"', () => {
		const rss = `<?xml version="1.0"?>
		<rss version="2.0">
			<channel>
				<link rel="hub" href="https://pubsubhub.example.com" />
				<title>Test</title>
			</channel>
		</rss>`;
		expect(discoverHub(rss)).toBe('https://pubsubhub.example.com');
	});

	it('discovers hub from Atom link', () => {
		const atom = `<?xml version="1.0"?>
		<feed xmlns="http://www.w3.org/2005/Atom">
			<link href="https://websub.example.com/hub" rel="hub" />
			<title>Test</title>
		</feed>`;
		expect(discoverHub(atom)).toBe('https://websub.example.com/hub');
	});

	it('returns null when no hub found', () => {
		expect(discoverHub('<rss><channel><title>No hub</title></channel></rss>')).toBeNull();
		expect(discoverHub(JSON.stringify({ version: 'https://jsonfeed.org/version/1', items: [] }))).toBeNull();
	});
});
