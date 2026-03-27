export interface AtomEntry {
	id: string;
	title: string;
	link: string;
	updated: string;
	summary: string;
}

export function buildAtomFeed(opts: {
	id: string;
	title: string;
	link: string;
	updated: string;
	entries: AtomEntry[];
}): string {
	const escape = (s: string) => s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

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
  <link href="${escape(opts.id)}" rel="self" type="application/atom+xml" />
  <updated>${opts.updated}</updated>
  <generator>NewsDiff</generator>
${entries}
</feed>`;
}
