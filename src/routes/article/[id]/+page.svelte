<script lang="ts">
	let { data } = $props();
	const { article } = data;
</script>

<svelte:head><title>{article.versions[0]?.title || 'Article'} — NewsDiff</title></svelte:head>

<h1>{article.versions[0]?.title || 'Untitled Article'}</h1>
<div class="meta">
	<a href={article.url} target="_blank" rel="noopener">{article.url}</a>
	<span>{article.feed.name}</span>
	<span>{article.versions.length} version{article.versions.length !== 1 ? 's' : ''}</span>
	<a href="/article/{article.id}/feed.xml" class="feed-link">Atom feed</a>
</div>

{#if article.diffs.length > 0}
	<h2>Changes</h2>
	<div class="diff-list">
		{#each article.diffs as diff}
			<a href="/diff/{diff.id}" class="diff-card">
				<time>{new Date(diff.createdAt).toLocaleString()}</time>
				<span>v{diff.oldVersion.versionNumber} → v{diff.newVersion.versionNumber}</span>
				<div class="badges">
					{#if diff.titleChanged}<span class="badge badge-title">Headline</span>{/if}
					{#if diff.contentChanged}<span class="badge badge-content">Content</span>{/if}
					{#if diff.isBoring}<span class="badge badge-boring">Boring</span>{/if}
				</div>
				<span class="stats">+{diff.charsAdded} / -{diff.charsRemoved}</span>
			</a>
		{/each}
	</div>
{:else}
	<p class="empty">No changes detected yet.</p>
{/if}

<style>
	.meta { display: flex; gap: 1rem; font-size: 0.85rem; color: var(--color-muted); margin-bottom: 2rem; flex-wrap: wrap; }
	.meta a { color: var(--color-primary); word-break: break-all; }
	.feed-link { word-break: normal; }
	h2 { font-size: 1.1rem; margin-bottom: 1rem; }
	.diff-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.diff-card { display: flex; align-items: center; gap: 1rem; padding: 0.75rem; border: 1px solid var(--color-border); border-radius: 0.25rem; text-decoration: none; color: var(--color-text); background: white; }
	.diff-card:hover { border-color: var(--color-primary); }
	time { font-size: 0.8rem; color: var(--color-muted); min-width: 160px; }
	.badges { display: flex; gap: 0.25rem; }
	.badge { font-size: 0.7rem; padding: 0.1rem 0.4rem; border-radius: 1rem; font-weight: 600; }
	.badge-title { background: var(--color-del-bg); color: var(--color-del-text); }
	.badge-content { background: var(--color-ins-bg); color: var(--color-ins-text); }
	.badge-boring { background: #e2e8f0; color: #475569; }
	.stats { font-size: 0.8rem; color: var(--color-muted); margin-left: auto; }
	.empty { color: var(--color-muted); padding: 2rem 0; }
</style>
