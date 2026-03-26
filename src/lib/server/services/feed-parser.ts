import Parser from 'rss-parser';

const USER_AGENT = 'NewsDiff/0.1 (+https://github.com/newsdiff; RSS feed monitor)';

const parser = new Parser({
	headers: {
		'User-Agent': USER_AGENT,
		'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.1'
	},
	timeout: 15000
});

export interface FeedItem {
	title: string;
	url: string;
	publishedAt: Date | null;
}

export async function parseFeedItems(xml: string): Promise<FeedItem[]> {
	const feed = await parser.parseString(xml);
	return (feed.items || [])
		.filter((item) => item.link)
		.map((item) => ({
			title: item.title || '(untitled)',
			url: item.link!,
			publishedAt: item.pubDate ? new Date(item.pubDate) : null
		}));
}

export async function fetchAndParseFeed(feedUrl: string): Promise<{ siteName: string; items: FeedItem[] }> {
	const feed = await parser.parseURL(feedUrl);
	const items = (feed.items || [])
		.filter((item) => item.link)
		.map((item) => ({
			title: item.title || '(untitled)',
			url: item.link!,
			publishedAt: item.pubDate ? new Date(item.pubDate) : null
		}));
	return { siteName: feed.title || '', items };
}
