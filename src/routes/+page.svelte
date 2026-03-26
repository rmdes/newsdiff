<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>NewsDiff — Recent Changes</title>
</svelte:head>

<h1>Recent Changes</h1>

<div class="filters">
	<div class="feed-tabs">
		<a href="/">All</a>
		{#each data.feeds as feed}
			<a href="?feed={feed.id}">{feed.name}</a>
		{/each}
	</div>
	<label>
		<input type="checkbox" checked={data.showBoring}
			onchange={(e) => {
				const url = new URL(window.location.href);
				if (e.currentTarget.checked) url.searchParams.set('boring', '1');
				else url.searchParams.delete('boring');
				window.location.href = url.toString();
			}} />
		Show boring diffs
	</label>
</div>

{#if data.diffs.length === 0}
	<p class="empty">No diffs found. Add some feeds to start monitoring.</p>
{:else}
	<div class="diff-list">
		{#each data.diffs as diff}
			<a href="/diff/{diff.id}" class="diff-card">
				<div class="diff-meta">
					<span class="feed-name">{diff.article.feed.name}</span>
					<time>{new Date(diff.createdAt).toLocaleString()}</time>
				</div>
				<h2>{diff.newVersion.title || diff.oldVersion.title || 'Untitled'}</h2>
				<div class="badges">
					{#if diff.titleChanged}<span class="badge badge-title">Headline</span>{/if}
					{#if diff.contentChanged}<span class="badge badge-content">Content</span>{/if}
				</div>
				<div class="stats">+{diff.charsAdded} / -{diff.charsRemoved} chars</div>
			</a>
		{/each}
	</div>
	<div class="pagination">
		{#if data.page > 1}<a href="?page={data.page - 1}">Previous</a>{/if}
		{#if data.diffs.length === 20}<a href="?page={data.page + 1}">Next</a>{/if}
	</div>
{/if}

<style>
	.filters { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
	.feed-tabs { display: flex; gap: 0.5rem; flex-wrap: wrap; }
	.feed-tabs a { padding: 0.25rem 0.75rem; border-radius: 1rem; text-decoration: none; background: var(--color-border); color: var(--color-text); font-size: 0.875rem; }
	.feed-tabs a:hover { background: var(--color-primary); color: white; }
	.diff-list { display: flex; flex-direction: column; gap: 1rem; }
	.diff-card { display: block; padding: 1rem; border: 1px solid var(--color-border); border-radius: 0.5rem; text-decoration: none; color: var(--color-text); background: white; transition: border-color 0.15s; }
	.diff-card:hover { border-color: var(--color-primary); }
	.diff-meta { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--color-muted); margin-bottom: 0.25rem; }
	h2 { font-size: 1.1rem; margin-bottom: 0.5rem; }
	.badges { display: flex; gap: 0.5rem; margin-bottom: 0.25rem; }
	.badge { font-size: 0.75rem; padding: 0.1rem 0.5rem; border-radius: 1rem; font-weight: 600; }
	.badge-title { background: var(--color-del-bg); color: var(--color-del-text); }
	.badge-content { background: var(--color-ins-bg); color: var(--color-ins-text); }
	.stats { font-size: 0.8rem; color: var(--color-muted); }
	.empty { color: var(--color-muted); padding: 3rem 0; text-align: center; }
	.pagination { display: flex; gap: 1rem; justify-content: center; margin-top: 2rem; }
	.pagination a { color: var(--color-primary); }
</style>
