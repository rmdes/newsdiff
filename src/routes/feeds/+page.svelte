<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
</script>

<svelte:head><title>Manage Feeds — NewsDiff</title></svelte:head>

<h1>Manage Feeds</h1>

<form method="POST" action="?/add" use:enhance class="add-form">
	<input type="text" name="name" placeholder="Feed name" required />
	<input type="url" name="url" placeholder="https://example.com/rss" required />
	<button type="submit">Add Feed</button>
</form>

{#if form?.error}<p class="form-error">{form.error}</p>{/if}

{#if data.feeds.length === 0}
	<p class="empty">No feeds yet. Add one above to start monitoring.</p>
{:else}
	<div class="feed-list">
		{#each data.feeds as feed}
			<div class="feed-card" class:errored={feed.consecutiveErrors > 0} class:disabled={!feed.isActive}>
				<div class="feed-header">
					<div class="feed-info">
						<strong>{feed.name}</strong>
						<span class="feed-url">{feed.url}</span>
					</div>
					<div class="feed-actions">
						<form method="POST" action="?/toggle" use:enhance>
							<input type="hidden" name="id" value={feed.id} />
							<input type="hidden" name="isActive" value={String(!feed.isActive)} />
							<button type="submit" class="toggle" class:active={feed.isActive}>
								{feed.isActive ? 'Active' : 'Paused'}
							</button>
						</form>
						<form method="POST" action="?/remove" use:enhance
							onsubmit={(e) => { if (!confirm('Remove this feed and all its data?')) e.preventDefault(); }}>
							<input type="hidden" name="id" value={feed.id} />
							<button type="submit" class="remove">Remove</button>
						</form>
					</div>
				</div>

				<div class="feed-meta">
					<span>Every {feed.checkInterval}min</span>
					{#if feed.lastSuccessAt}
						<span>Last success: {new Date(feed.lastSuccessAt).toLocaleString()}</span>
					{/if}
					{#if feed.siteName}
						<span>{feed.siteName}</span>
					{/if}
				</div>

				{#if feed.lastError}
					<div class="feed-error">
						<span class="error-badge">
							{feed.consecutiveErrors >= 5 ? 'Auto-disabled' : `${feed.consecutiveErrors}/5 failures`}
						</span>
						<span class="error-msg">{feed.lastError}</span>
						{#if feed.lastErrorAt}
							<span class="error-time">{new Date(feed.lastErrorAt).toLocaleString()}</span>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.add-form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
	.add-form input { flex: 1; padding: 0.5rem; border: 1px solid var(--color-border); border-radius: 0.25rem; }
	.add-form button { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.25rem; cursor: pointer; }
	.form-error { color: var(--color-del-text); background: var(--color-del-bg); padding: 0.5rem; border-radius: 0.25rem; margin-bottom: 1rem; }

	.feed-list { display: flex; flex-direction: column; gap: 0.75rem; }

	.feed-card {
		padding: 1rem; border: 1px solid var(--color-border); border-radius: 0.5rem; background: white;
	}
	.feed-card.errored { border-color: #f59e0b; background: #fffbeb; }
	.feed-card.disabled { opacity: 0.7; }
	.feed-card.errored.disabled { border-color: var(--color-del-text); background: #fef2f2; }

	.feed-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; }
	.feed-info { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
	.feed-info strong { font-size: 1rem; }
	.feed-url { font-size: 0.8rem; color: var(--color-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.feed-actions { display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0; }
	.toggle { background: none; border: 1px solid var(--color-border); padding: 0.2rem 0.5rem; border-radius: 1rem; cursor: pointer; font-size: 0.8rem; }
	.toggle.active { background: var(--color-ins-bg); color: var(--color-ins-text); border-color: var(--color-ins-text); }
	.remove { background: none; border: none; color: var(--color-del-text); cursor: pointer; font-size: 0.8rem; }

	.feed-meta { display: flex; gap: 1rem; font-size: 0.8rem; color: var(--color-muted); margin-top: 0.5rem; flex-wrap: wrap; }

	.feed-error {
		margin-top: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 0.25rem;
		background: var(--color-del-bg); font-size: 0.8rem;
		display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;
	}
	.error-badge {
		font-weight: 600; color: var(--color-del-text); background: white;
		padding: 0.1rem 0.5rem; border-radius: 1rem; font-size: 0.75rem; white-space: nowrap;
	}
	.error-msg { color: var(--color-del-text); word-break: break-all; flex: 1; }
	.error-time { color: var(--color-muted); font-size: 0.75rem; white-space: nowrap; }

	.empty { color: var(--color-muted); padding: 3rem 0; text-align: center; }
</style>
