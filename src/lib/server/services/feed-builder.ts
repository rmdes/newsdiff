export interface FeedEntry {
	id: string;
	title: string;
	link: string;
	updated: string;
	summary: string;
}

export interface FeedOptions {
	id: string;
	title: string;
	link: string;
	updated: string;
	entries: FeedEntry[];
	hubUrl?: string;
}

const escape = (s: string) => s
	.replace(/&/g, '&amp;')
	.replace(/</g, '&lt;')
	.replace(/>/g, '&gt;')
	.replace(/"/g, '&quot;');

export function buildAtomFeed(opts: FeedOptions): string {
	const hub = opts.hubUrl
		? `\n  <link href="${escape(opts.hubUrl)}" rel="hub" />`
		: '';

	const entries = opts.entries.map(e => `  <entry>
    <id>${escape(e.id)}</id>
    <title>${escape(e.title)}</title>
    <link href="${escape(e.link)}" rel="alternate" />
    <updated>${e.updated}</updated>
    <summary type="html">${escape(e.summary)}</summary>
  </entry>`).join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${escape(opts.id)}</id>
  <title>${escape(opts.title)}</title>
  <link href="${escape(opts.link)}" rel="alternate" />
  <link href="${escape(opts.id)}" rel="self" type="application/atom+xml" />${hub}
  <updated>${opts.updated}</updated>
  <generator>NewsDiff</generator>
${entries}
</feed>`;
}

export function buildRssFeed(opts: FeedOptions): string {
	const hub = opts.hubUrl
		? `\n    <atom:link href="${escape(opts.hubUrl)}" rel="hub" />`
		: '';

	const selfLink = `\n    <atom:link href="${escape(opts.id)}" rel="self" type="application/rss+xml" />`;

	const items = opts.entries.map(e => `    <item>
      <guid isPermaLink="true">${escape(e.id)}</guid>
      <title>${escape(e.title)}</title>
      <link>${escape(e.link)}</link>
      <pubDate>${new Date(e.updated).toUTCString()}</pubDate>
      <description>${escape(e.summary)}</description>
    </item>`).join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(opts.title)}</title>
    <link>${escape(opts.link)}</link>
    <description>${escape(opts.title)}</description>
    <lastBuildDate>${opts.updated ? new Date(opts.updated).toUTCString() : new Date().toUTCString()}</lastBuildDate>
    <generator>NewsDiff</generator>${selfLink}${hub}
${items}
  </channel>
</rss>`;
}
