<script>
	let { data } = $props();
	const { botHandle, botActorUrl } = data;
</script>

<svelte:head>
	<title>About — NewsDiff</title>
	<meta name="description" content="NewsDiff tracks how news articles change after publication, making the editorial process visible." />
</svelte:head>

<article class="about">
	<h1>About NewsDiff</h1>

	<p class="lede">News doesn't end when it's published. Articles are quietly edited — headlines softened, paragraphs rewritten, context added or removed. NewsDiff makes that process visible.</p>

	<section>
		<h2>Why this exists</h2>
		<p>The newsroom is never really closed. Stories evolve as situations develop, sources respond, and editorial judgment shifts. Sometimes changes reflect genuine corrections. Sometimes they reflect something else — political pressure, legal threats, or simply a different editorial wind.</p>
		<p>Whatever the reason, the public deserves to see how the record changes. NewsDiff monitors RSS feeds from news outlets, extracts article content, and tracks every edit. When something changes, it shows you exactly what — word by word.</p>
	</section>

	<section>
		<h2>How it works</h2>
		<ol>
			<li><strong>Monitor</strong> — RSS feeds are polled regularly. New articles are fetched and their content extracted automatically.</li>
			<li><strong>Compare</strong> — Each time an article is checked, its content is compared against the previous version using word-level diffing.</li>
			<li><strong>Display</strong> — Changes are shown inline: <del>removed text</del> and <ins>added text</ins>, just like track changes in a document.</li>
			<li><strong>Share</strong> — Every diff can be exported as an image or shared directly to social media. The bot also posts to the fediverse automatically.</li>
		</ol>
	</section>

	<section>
		<h2>Standing on the shoulders of</h2>
		<p>This project draws inspiration from three pioneering news diff trackers:</p>
		<ul>
			<li><strong>NewsDiffs</strong> (2012) — Built at a Knight-Mozilla hackathon by Eric Price, Greg Price, and Jennifer 8. Lee. The original vision: full article body diffing with a web UI. It tracked NYT, CNN, BBC, Politico, and the Washington Post. The code is Python 2 and hasn't run in years, but the idea was right.</li>
			<li><strong>diffengine</strong> (~2017) — Ed Summers took a different approach: monitor any RSS feed, use Mozilla's Readability to extract content automatically (no per-site parsers), and submit every version to the Internet Archive. The key insight that per-site HTML parsing is a losing game.</li>
			<li><strong>NYTdiff</strong> (~2020) — Focused on the NYT's metadata (headlines, abstracts, kickers) and pioneered the social-first approach: generate visual diff images and post them as threaded replies on social media, building a chronological edit history for each article.</li>
		</ul>
		<p>All three projects are now effectively abandoned — broken by API changes, platform shifts, and the steady rot of unmaintained dependencies. NewsDiff carries their ideas forward with modern technology.</p>
	</section>

	<section>
		<h2>The open newsroom</h2>
		<p>There's a tension at the heart of online news. Digital publishing means articles can be improved — errors corrected, context added, clarity sharpened. That's genuinely good. But it also means the record can be quietly altered, and unless someone is watching, no one notices.</p>
		<p>Transparency doesn't mean suspicion. Most edits are routine. But the ability to see what changed, and when, is a small piece of accountability infrastructure that should exist. Not as a gotcha, but as a record.</p>
		<p>Consider it a glass newsroom.</p>
	</section>

	<section>
		<h2>Credits</h2>
		<p>NewsDiff is open source software built on the work of others.</p>
		<dl class="credits">
			<dt>Inspiration</dt>
			<dd><a href="https://github.com/ecprice/newsdiffs" target="_blank" rel="noopener">NewsDiffs</a> by Eric Price, Greg Price &amp; Jennifer 8. Lee</dd>
			<dd><a href="https://github.com/DocNow/diffengine" target="_blank" rel="noopener">diffengine</a> by Ed Summers</dd>
			<dd><a href="https://github.com/j-norwood-young/NYTdiff" target="_blank" rel="noopener">NYTdiff</a> by Jason Norwood-Young</dd>

			<dt>Core technologies</dt>
			<dd><a href="https://svelte.dev/docs/kit" target="_blank" rel="noopener">SvelteKit</a> — web framework</dd>
			<dd><a href="https://orm.drizzle.team" target="_blank" rel="noopener">Drizzle ORM</a> — database</dd>
			<dd><a href="https://docs.bullmq.io" target="_blank" rel="noopener">BullMQ</a> — job queue</dd>
			<dd><a href="https://github.com/mozilla/readability" target="_blank" rel="noopener">@mozilla/readability</a> — content extraction</dd>
			<dd><a href="https://github.com/kpdecker/jsdiff" target="_blank" rel="noopener">jsdiff</a> — diff computation</dd>

			<dt>Federation</dt>
			<dd><a href="https://botkit.fedify.dev" target="_blank" rel="noopener">Botkit</a> by Fedify — ActivityPub bot framework</dd>
			<dd><a href="https://github.com/bluesky-social/atproto" target="_blank" rel="noopener">@atproto/api</a> — Bluesky integration</dd>

			<dt>Image generation</dt>
			<dd><a href="https://github.com/vercel/satori" target="_blank" rel="noopener">Satori</a> by Vercel — HTML to SVG</dd>
			<dd><a href="https://sharp.pixelplumbing.com" target="_blank" rel="noopener">sharp</a> — image processing</dd>

			<dt>Hosting</dt>
			<dd><a href="https://cloudron.io" target="_blank" rel="noopener">Cloudron</a> — self-hosted app platform</dd>
		</dl>
	</section>

	<section class="follow">
		<h2>Follow the diffs</h2>
		<p>The bot posts every non-trivial diff to the fediverse. Follow it from any Mastodon, Pleroma, or Misskey instance:</p>
		{#if botHandle}
			<p class="handle"><a href={botActorUrl} rel="me">{botHandle}</a></p>
		{/if}
	</section>
</article>

<style>
	.about { max-width: 640px; }
	.lede { font-size: 1.15rem; line-height: 1.7; color: var(--color-text); margin-bottom: 2rem; }
	section { margin-bottom: 2.5rem; }
	h1 { font-size: 1.75rem; margin-bottom: 1rem; }
	h2 { font-size: 1.1rem; margin-bottom: 0.75rem; color: var(--color-text); }
	p { margin-bottom: 0.75rem; line-height: 1.7; color: #333; }
	ol, ul { margin-bottom: 0.75rem; padding-left: 1.5rem; line-height: 1.7; color: #333; }
	li { margin-bottom: 0.5rem; }
	del { background: var(--color-del-bg); color: var(--color-del-text); padding: 0.1em 0.2em; border-radius: 2px; }
	ins { background: var(--color-ins-bg); color: var(--color-ins-text); text-decoration: none; padding: 0.1em 0.2em; border-radius: 2px; }
	.follow { text-align: center; padding: 2rem; background: white; border: 1px solid var(--color-border); border-radius: 0.5rem; }
	.handle { font-size: 1.25rem; font-weight: 600; }
	.handle a { color: var(--color-primary); text-decoration: none; }
	.handle a:hover { text-decoration: underline; }
	.credits { margin-bottom: 0.75rem; }
	.credits dt { font-weight: 600; font-size: 0.85rem; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.03em; margin-top: 1rem; margin-bottom: 0.25rem; }
	.credits dt:first-child { margin-top: 0; }
	.credits dd { margin-left: 0; margin-bottom: 0.25rem; line-height: 1.6; }
	.credits a { color: var(--color-primary); text-decoration: none; }
	.credits a:hover { text-decoration: underline; }
</style>
