<script lang="ts">
	let { data } = $props();
	let expandedArticles = $state(new Set<number>());

	// Stable color per feed name — hashes the name to pick a hue
	function feedColor(name: string): string {
		let hash = 0;
		for (let i = 0; i < name.length; i++) {
			hash = name.charCodeAt(i) + ((hash << 5) - hash);
		}
		const hue = ((hash % 360) + 360) % 360;
		return `hsl(${hue}, 55%, 50%)`;
	}

	function toggleExpand(articleId: number) {
		const next = new Set(expandedArticles);
		if (next.has(articleId)) next.delete(articleId);
		else next.add(articleId);
		expandedArticles = next;
	}

	function buildUrl(params: Record<string, string | null>): string {
		const url = new URL(window.location.href);
		for (const [key, value] of Object.entries(params)) {
			if (value === null) url.searchParams.delete(key);
			else url.searchParams.set(key, value);
		}
		if ('feed' in params) url.searchParams.delete('page');
		return url.pathname + url.search;
	}
</script>

<svelte:head>
	<title>NewsDiff — Recent Changes</title>
</svelte:head>

<div class="filters">
	<h2 class="filter-label">Sources</h2>
	<div class="feed-tabs">
		<a href="/" class:active={!data.feedFilter}>All</a>
		{#each data.feeds as feed}
			<a
				href="?feed={feed.id}"
				class:active={data.feedFilter === String(feed.id)}
				style={data.feedFilter === String(feed.id) ? `background: ${feedColor(feed.name)};` : `border: 1px solid ${feedColor(feed.name)}; color: ${feedColor(feed.name)}; background: transparent;`}
			>{feed.name}</a>
		{/each}
		<a href={data.feedFilter ? `/feed/${data.feedFilter}/rss.xml` : '/rss.xml'}
			class="rss-icon" title="Subscribe to this feed (RSS)">
			<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256">
				<rect width="256" height="256" rx="55" ry="55" fill="#f26522"/>
				<circle cx="68" cy="189" r="28" fill="#fff"/>
				<path d="M160 213h-34a82 82 0 0 0-82-82V97a116 116 0 0 1 116 116z" fill="#fff"/>
				<path d="M224 213h-34a148 148 0 0 0-148-148V31a182 182 0 0 1 182 182z" fill="#fff"/>
			</svg>
		</a>
	</div>
	<label>
		<input type="checkbox" checked={data.showBoring}
			onchange={(e) => {
				if (e.currentTarget.checked) window.location.href = buildUrl({ boring: '1' });
				else window.location.href = buildUrl({ boring: null });
			}} />
		Show boring
	</label>
</div>

<h1>Recent Changes</h1>

{#if data.groups.length === 0}
	<p class="empty">
		{#if data.feedFilter}
			No diffs for this feed yet.
		{:else}
			No diffs found. Add some feeds to start monitoring.
		{/if}
	</p>
{:else}
	<div class="diff-list">
		{#each data.groups as group}
			{@const expanded = expandedArticles.has(group.articleId)}
			{@const color = feedColor(group.article.feed.name)}
			<div class="article-group" style="border-left: 3px solid {color};">
				<!-- Latest diff card -->
				<a href="/diff/{group.latestDiff.id}" class="diff-card">
					<div class="diff-meta">
						<span class="feed-name" style="color: {color};">{group.article.feed.name}</span>
						<time>{new Date(group.latestDiff.createdAt).toLocaleString()}</time>
					</div>
					<h2>{group.latestDiff.newVersion.title || group.latestDiff.oldVersion.title || 'Untitled'}</h2>
					<div class="card-footer">
						<div class="badges">
							{#if group.latestDiff.titleChanged}<span class="badge badge-title">Headline</span>{/if}
							{#if group.latestDiff.contentChanged}<span class="badge badge-content">Content</span>{/if}
						</div>
						<div class="stats">+{group.latestDiff.charsAdded} / -{group.latestDiff.charsRemoved} chars</div>
					</div>
				</a>

				<!-- Change count pill + expand toggle -->
				{#if group.olderDiffs.length > 0 || group.totalChanges > group.visibleChanges}
					<div class="group-actions">
						{#if group.olderDiffs.length > 0}
							<button class="expand-btn" onclick={() => toggleExpand(group.articleId)}>
								{expanded ? '▾' : '▸'} {group.visibleChanges} changes
							</button>
						{/if}
						{#if group.boringCount > 0}
							<span class="boring-count">{group.boringCount} boring</span>
						{/if}
						<a href="/article/{group.articleId}" class="history-link">Full history</a>
					</div>
				{/if}

				<!-- Expanded older diffs -->
				{#if expanded}
					<div class="older-diffs">
						{#each group.olderDiffs as diff}
							<a href="/diff/{diff.id}" class="diff-card diff-card-compact">
								<div class="diff-meta">
									<time>{new Date(diff.createdAt).toLocaleString()}</time>
									<span>v{diff.oldVersion.versionNumber} → v{diff.newVersion.versionNumber}</span>
								</div>
								<div class="card-footer">
									<div class="badges">
										{#if diff.titleChanged}<span class="badge badge-title">Headline</span>{/if}
										{#if diff.contentChanged}<span class="badge badge-content">Content</span>{/if}
									</div>
									<div class="stats">+{diff.charsAdded} / -{diff.charsRemoved}</div>
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
	</div>
	<div class="pagination">
		{#if data.page > 1}<a href="?feed={data.feedFilter || ''}&page={data.page - 1}">Previous</a>{/if}
		{#if data.groups.length === 20}<a href="?feed={data.feedFilter || ''}&page={data.page + 1}">Next</a>{/if}
	</div>
{/if}

<style>
	.filters { display: flex; flex-wrap: wrap; align-items: center; margin-bottom: 1.5rem; gap: 0.5rem 1rem; }
	.filter-label { font-size: 0.85rem; font-weight: 600; color: var(--color-muted); text-transform: uppercase; letter-spacing: 0.03em; width: 100%; margin: 0; }
	.feed-tabs { display: flex; gap: 0.35rem; flex-wrap: wrap; align-items: center; }
	.feed-tabs a { padding: 0.2rem 0.6rem; border-radius: 1rem; text-decoration: none; background: var(--color-border); color: var(--color-text); font-size: 0.8rem; transition: background 0.15s; }
	.feed-tabs a:hover { background: var(--color-primary); color: white; }
	.feed-tabs a.active { background: var(--color-primary); color: white; }
	.rss-icon { display: inline-flex; align-items: center; background: none !important; padding: 0.2rem !important; }
	.rss-icon:hover { background: none !important; opacity: 0.8; }
	label { font-size: 0.8rem; white-space: nowrap; color: var(--color-muted); }

	.diff-list { display: flex; flex-direction: column; gap: 1rem; }
	.article-group { border: 1px solid var(--color-border); border-radius: 0.5rem; overflow: hidden; background: white; }
	.diff-card { display: block; padding: 1rem; text-decoration: none; color: var(--color-text); transition: background 0.15s; }
	.diff-card:hover { background: #f8fafc; }
	.diff-card-compact { padding: 0.6rem 1rem; border-top: 1px solid var(--color-border); }
	.diff-meta { display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--color-muted); margin-bottom: 0.25rem; }
	h2 { font-size: 1.1rem; margin-bottom: 0.5rem; }
	.card-footer { display: flex; justify-content: space-between; align-items: center; }
	.badges { display: flex; gap: 0.5rem; }
	.badge { font-size: 0.75rem; padding: 0.1rem 0.5rem; border-radius: 1rem; font-weight: 600; }
	.badge-title { background: var(--color-del-bg); color: var(--color-del-text); }
	.badge-content { background: var(--color-ins-bg); color: var(--color-ins-text); }
	.stats { font-size: 0.8rem; color: var(--color-muted); }

	.group-actions { display: flex; align-items: center; gap: 1rem; padding: 0.4rem 1rem; border-top: 1px solid var(--color-border); background: #f8fafc; font-size: 0.8rem; }
	.expand-btn { border: none; background: none; cursor: pointer; color: var(--color-primary); font-size: 0.8rem; font-weight: 600; padding: 0; }
	.expand-btn:hover { text-decoration: underline; }
	.boring-count { color: var(--color-muted); font-size: 0.75rem; }
	.history-link { color: var(--color-muted); text-decoration: none; margin-left: auto; }
	.history-link:hover { color: var(--color-primary); }

	.older-diffs { background: #fafafa; }
	.empty { color: var(--color-muted); padding: 3rem 0; text-align: center; }
	.pagination { display: flex; gap: 1rem; justify-content: center; margin-top: 2rem; }
	.pagination a { color: var(--color-primary); }
</style>
