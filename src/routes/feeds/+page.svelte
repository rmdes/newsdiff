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

{#if form?.error}<p class="error">{form.error}</p>{/if}

{#if data.feeds.length === 0}
	<p class="empty">No feeds yet. Add one above to start monitoring.</p>
{:else}
	<table>
		<thead><tr><th>Name</th><th>URL</th><th>Interval</th><th>Active</th><th></th></tr></thead>
		<tbody>
			{#each data.feeds as feed}
				<tr>
					<td>{feed.name}</td>
					<td class="url">{feed.url}</td>
					<td>{feed.checkInterval}min</td>
					<td>
						<form method="POST" action="?/toggle" use:enhance>
							<input type="hidden" name="id" value={feed.id} />
							<input type="hidden" name="isActive" value={String(!feed.isActive)} />
							<button type="submit" class="toggle" class:active={feed.isActive}>{feed.isActive ? 'Active' : 'Paused'}</button>
						</form>
					</td>
					<td>
						<form method="POST" action="?/remove" use:enhance
							onsubmit={(e) => { if (!confirm('Remove this feed and all its data?')) e.preventDefault(); }}>
							<input type="hidden" name="id" value={feed.id} />
							<button type="submit" class="remove">Remove</button>
						</form>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.add-form { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
	.add-form input { flex: 1; padding: 0.5rem; border: 1px solid var(--color-border); border-radius: 0.25rem; }
	.add-form button { padding: 0.5rem 1rem; background: var(--color-primary); color: white; border: none; border-radius: 0.25rem; cursor: pointer; }
	.error { color: var(--color-del-text); background: var(--color-del-bg); padding: 0.5rem; border-radius: 0.25rem; margin-bottom: 1rem; }
	table { width: 100%; border-collapse: collapse; }
	th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid var(--color-border); }
	th { font-size: 0.8rem; color: var(--color-muted); text-transform: uppercase; }
	.url { font-size: 0.85rem; color: var(--color-muted); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.toggle { background: none; border: 1px solid var(--color-border); padding: 0.2rem 0.5rem; border-radius: 1rem; cursor: pointer; font-size: 0.8rem; }
	.toggle.active { background: var(--color-ins-bg); color: var(--color-ins-text); border-color: var(--color-ins-text); }
	.remove { background: none; border: none; color: var(--color-del-text); cursor: pointer; font-size: 0.8rem; }
	.empty { color: var(--color-muted); padding: 3rem 0; text-align: center; }
</style>
