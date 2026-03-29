<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Import from Sitemap — NewsDiff</title>
</svelte:head>

<div class="import-page">
	<h1>Import from Sitemap</h1>
	<p class="subtitle">Seed version 1 for all articles in a sitemap. No diffs or social posts are created — this just establishes a baseline so future edits are detected.</p>

	{#if form?.error}
		<p class="notice error">{form.error}</p>
	{/if}

	{#if form?.message}
		<p class="notice success">{form.message}</p>
	{/if}

	<form method="POST" action="?/import">
		<div class="field">
			<label for="sitemapUrl">Sitemap URL</label>
			<input type="url" id="sitemapUrl" name="sitemapUrl" placeholder="https://example.com/sitemap.xml" required />
		</div>

		<div class="field">
			<label for="feedId">Associate with feed</label>
			<select id="feedId" name="feedId" required>
				<option value="">Select a feed...</option>
				{#each data.feeds as feed}
					<option value={feed.id}>{feed.name}</option>
				{/each}
			</select>
		</div>

		<button type="submit" class="btn-import" disabled={data.status.running}>
			{data.status.running ? 'Import running...' : 'Start import'}
		</button>
	</form>

	{#if data.status.total > 0}
		<section class="status">
			<h2>Import Status</h2>
			<div class="progress-bar">
				<div class="progress-fill" style="width: {data.status.total ? (data.status.processed / data.status.total * 100) : 0}%"></div>
			</div>
			<div class="stats">
				<span><strong>{data.status.processed}</strong> / {data.status.total} processed</span>
				<span class="stored">{data.status.stored} stored</span>
				<span class="skipped">{data.status.skipped} skipped</span>
				<span class="failed">{data.status.failed} failed</span>
				{#if data.status.running}
					<span class="running">Running...</span>
				{:else}
					<span class="done">Done</span>
				{/if}
			</div>

			{#if data.status.errors.length > 0}
				<details>
					<summary>{data.status.errors.length} errors</summary>
					<ul class="error-list">
						{#each data.status.errors as err}
							<li>{err}</li>
						{/each}
					</ul>
				</details>
			{/if}

			{#if data.status.running}
				<p class="hint">Refresh the page to see updated progress.</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.import-page { max-width: 640px; }
	.subtitle { color: var(--color-muted); margin-bottom: 1.5rem; font-size: 0.9rem; }

	.notice { padding: 0.75rem; border-radius: 0.25rem; margin-bottom: 1rem; font-size: 0.9rem; }
	.notice.error { background: var(--color-del-bg); color: var(--color-del-text); }
	.notice.success { background: var(--color-ins-bg); color: var(--color-ins-text); }

	.field { margin-bottom: 1rem; }
	.field label { display: block; font-size: 0.85rem; font-weight: 600; margin-bottom: 0.25rem; }
	.field input, .field select {
		width: 100%; padding: 0.5rem; border: 1px solid var(--color-border);
		border-radius: 0.25rem; font-family: inherit; font-size: 0.9rem;
	}

	.btn-import {
		padding: 0.5rem 1.5rem; background: var(--color-primary); color: white;
		border: none; border-radius: 0.25rem; cursor: pointer; font-size: 0.9rem;
	}
	.btn-import:hover { background: #1d4ed8; }
	.btn-import:disabled { opacity: 0.5; cursor: not-allowed; }

	.status { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--color-border); }
	.status h2 { font-size: 1rem; margin-bottom: 0.75rem; }

	.progress-bar { height: 8px; background: var(--color-border); border-radius: 4px; overflow: hidden; margin-bottom: 0.75rem; }
	.progress-fill { height: 100%; background: var(--color-primary); border-radius: 4px; transition: width 0.3s; }

	.stats { display: flex; gap: 1rem; flex-wrap: wrap; font-size: 0.85rem; color: var(--color-muted); }
	.stored { color: var(--color-ins-text); }
	.skipped { color: var(--color-muted); }
	.failed { color: var(--color-del-text); }
	.running { color: var(--color-primary); font-weight: 600; }
	.done { color: var(--color-ins-text); font-weight: 600; }

	.hint { font-size: 0.8rem; color: var(--color-muted); margin-top: 0.75rem; }

	details { margin-top: 0.75rem; }
	summary { cursor: pointer; font-size: 0.85rem; color: var(--color-del-text); }
	.error-list { font-size: 0.8rem; color: var(--color-muted); margin-top: 0.5rem; padding-left: 1.5rem; }
	.error-list li { margin-bottom: 0.25rem; word-break: break-all; }
</style>
