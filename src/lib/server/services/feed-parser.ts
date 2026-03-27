import Parser from 'rss-parser';

const USER_AGENT = 'NewsDiff/0.1 (+https://github.com/rmdes/newsdiff; RSS feed monitor)';

const parser = new Parser({
	headers: {
		'User-Agent': USER_AGENT,
		'Accept': 'application/feed+json, application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*;q=0.1'
	},
	timeout: 15000
});

export interface FeedItem {
	title: string;
	url: string;
	publishedAt: Date | null;
}

interface JsonFeed {
	version: string;
	title?: string;
	items?: Array<{
		id?: string;
		url?: string;
		external_url?: string;
		title?: string;
		date_published?: string;
		date_modified?: string;
	}>;
}

function isJsonFeed(data: any): data is JsonFeed {
	return typeof data === 'object' && typeof data.version === 'string' && data.version.includes('jsonfeed.org');
}

function parseJsonFeedItems(feed: JsonFeed): FeedItem[] {
	return (feed.items || [])
		.filter((item) => item.url || item.external_url)
		.map((item) => ({
			title: item.title || '(untitled)',
			url: (item.url || item.external_url)!,
			publishedAt: item.date_published ? new Date(item.date_published) : null
		}));
}

export async function parseFeedItems(content: string): Promise<FeedItem[]> {
	// Try JSON Feed first
	try {
		const json = JSON.parse(content);
		if (isJsonFeed(json)) {
			return parseJsonFeedItems(json);
		}
	} catch {
		// Not JSON — fall through to RSS/Atom
	}

	const feed = await parser.parseString(content);
	return (feed.items || [])
		.filter((item) => item.link)
		.map((item) => ({
			title: item.title || '(untitled)',
			url: item.link!,
			publishedAt: item.pubDate ? new Date(item.pubDate) : null
		}));
}

export async function fetchAndParseFeed(feedUrl: string): Promise<{ siteName: string; items: FeedItem[] }> {
	// Fetch raw content so we can detect JSON Feed vs RSS/Atom
	const response = await fetch(feedUrl, {
		headers: {
			'User-Agent': USER_AGENT,
			'Accept': 'application/feed+json, application/rss+xml, application/atom+xml, application/xml, text/xml, application/json, */*;q=0.1'
		},
		signal: AbortSignal.timeout(15000)
	});

	if (!response.ok) {
		throw new Error(`Feed fetch failed: ${response.status} ${response.statusText}`);
	}

	const text = await response.text();

	// Try JSON Feed
	try {
		const json = JSON.parse(text);
		if (isJsonFeed(json)) {
			return {
				siteName: json.title || '',
				items: parseJsonFeedItems(json)
			};
		}
	} catch {
		// Not JSON — parse as RSS/Atom
	}

	const feed = await parser.parseString(text);
	const items = (feed.items || [])
		.filter((item) => item.link)
		.map((item) => ({
			title: item.title || '(untitled)',
			url: item.link!,
			publishedAt: item.pubDate ? new Date(item.pubDate) : null
		}));
	return { siteName: feed.title || '', items };
}
