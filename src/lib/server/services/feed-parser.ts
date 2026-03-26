import Parser from 'rss-parser';

const parser = new Parser();

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
