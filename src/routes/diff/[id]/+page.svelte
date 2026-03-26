<script lang="ts">
	let { data } = $props();
	const { diff, prevDiffId, nextDiffId } = data;

	let canShare = $state(false);
	let shareStatus = $state('');

	$effect(() => {
		canShare = typeof navigator !== 'undefined' && !!navigator.share;
	});

	async function shareDiff() {
		shareStatus = 'Preparing...';
		try {
			// Fetch the image to include as a file
			const imageUrl = `/api/diff/${diff.id}/image.png`;
			const response = await fetch(imageUrl);
			const blob = await response.blob();
			const file = new File([blob], `diff-${diff.id}.png`, { type: 'image/png' });

			const title = diff.newVersion.title || diff.oldVersion.title || 'Article changed';
			const changeDesc = [
				diff.titleChanged ? 'headline' : '',
				diff.contentChanged ? 'content' : ''
			].filter(Boolean).join(' & ');

			await navigator.share({
				title: `${title} — ${changeDesc} changed`,
				text: `${changeDesc.charAt(0).toUpperCase() + changeDesc.slice(1)} changed in "${title}" (${diff.article.feed.name})`,
				url: window.location.href,
				files: [file]
			});
			shareStatus = '';
		} catch (err: any) {
			if (err.name === 'AbortError') {
				shareStatus = '';
				return;
			}
			// Fallback: try sharing without the file (some browsers don't support file sharing)
			try {
				const title = diff.newVersion.title || diff.oldVersion.title || 'Article changed';
				await navigator.share({
					title,
					url: window.location.href
				});
				shareStatus = '';
			} catch {
				shareStatus = '';
			}
		}
	}
</script>

<svelte:head>
	<title>Diff: {diff.newVersion.title || 'Untitled'} — NewsDiff</title>
	<meta property="og:title" content="Article changed: {diff.newVersion.title}" />
	<meta property="og:image" content="/api/diff/{diff.id}/image.png" />
	<meta property="og:image:width" content="800" />
	<meta property="og:image:height" content="418" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<article class="diff-view">
	<header>
		<a href="/feed/{diff.article.feed.id}" class="feed-link">{diff.article.feed.name}</a>
		<h1>{diff.newVersion.title || diff.oldVersion.title || 'Untitled'}</h1>
		<div class="meta">
			<a href={diff.article.url} target="_blank" rel="noopener">Original article</a>
			<span>Version {diff.oldVersion.versionNumber} → {diff.newVersion.versionNumber}</span>
			<time>{new Date(diff.createdAt).toLocaleString()}</time>
		</div>
		<div class="badges">
			{#if diff.titleChanged}<span class="badge badge-title">Headline changed</span>{/if}
			{#if diff.contentChanged}<span class="badge badge-content">Content changed</span>{/if}
			{#if diff.isBoring}<span class="badge badge-boring">Boring</span>{/if}
		</div>
		<div class="actions">
			{#if canShare}
				<button class="btn btn-share" onclick={shareDiff}>
					{shareStatus || 'Share'}
				</button>
			{/if}
			<a href="/api/diff/{diff.id}/image.png" download="diff-{diff.id}.png" class="btn btn-export">Download image</a>
			<button class="btn btn-copy" onclick={() => {
				navigator.clipboard.writeText(window.location.href);
				const el = document.querySelector('.btn-copy');
				if (el) { el.textContent = 'Copied!'; setTimeout(() => el.textContent = 'Copy link', 2000); }
			}}>Copy link</button>
		</div>
	</header>

	<section class="diff-section">
		<h2>Changes</h2>
		<div class="diff-body">{@html diff.diffHtml}</div>
	</section>

	<nav class="diff-nav">
		{#if prevDiffId}<a href="/diff/{prevDiffId}">← Previous diff</a>{:else}<span></span>{/if}
		<a href="/article/{diff.article.id}">All versions</a>
		{#if nextDiffId}<a href="/diff/{nextDiffId}">Next diff →</a>{:else}<span></span>{/if}
	</nav>
</article>

<style>
	.diff-view { max-width: 720px; }
	header { margin-bottom: 2rem; }
	.feed-link { font-size: 0.8rem; color: var(--color-muted); text-decoration: none; }
	.feed-link:hover { color: var(--color-primary); }
	h1 { font-size: 1.5rem; margin: 0.5rem 0; }
	.meta { display: flex; gap: 1rem; font-size: 0.85rem; color: var(--color-muted); flex-wrap: wrap; }
	.meta a { color: var(--color-primary); }
	.badges { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
	.badge { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 1rem; font-weight: 600; }
	.badge-title { background: var(--color-del-bg); color: var(--color-del-text); }
	.badge-content { background: var(--color-ins-bg); color: var(--color-ins-text); }
	.badge-boring { background: #e2e8f0; color: #475569; }
	.diff-section { margin-bottom: 2rem; }
	.diff-section h2 { font-size: 1rem; color: var(--color-muted); margin-bottom: 0.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.25rem; }
	.diff-body { line-height: 1.8; white-space: pre-wrap; word-wrap: break-word; }
	.diff-nav { display: flex; justify-content: space-between; padding-top: 1.5rem; border-top: 1px solid var(--color-border); }
	.diff-nav a { color: var(--color-primary); text-decoration: none; }
	.actions { display: flex; gap: 0.5rem; margin-top: 1rem; }
	.btn { display: inline-flex; align-items: center; padding: 0.4rem 0.75rem; border-radius: 0.25rem; font-size: 0.85rem; cursor: pointer; text-decoration: none; border: 1px solid var(--color-border); background: white; color: var(--color-text); }
	.btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
	.btn-share { background: var(--color-primary); color: white; border-color: var(--color-primary); }
	.btn-share:hover { background: #1d4ed8; color: white; }
	.btn-export { background: white; }
	.btn-export:hover { background: #f0f4ff; }
</style>
