<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	let profile = $derived(data.profile);

	// Bluesky budget: 300 chars total. ~80 chars for change desc + stats + feed name + links
	const BSKY_LIMIT = 300;
	const BSKY_OVERHEAD = 120; // approx: change desc, stats, feed name, URLs
	let prefixInput = $state(data.profile.postPrefix || '');
	let suffixInput = $state(data.profile.postSuffix || '');
	let bskyBudget = $derived(BSKY_LIMIT - BSKY_OVERHEAD - prefixInput.length - suffixInput.length);

	// Live preview using a real diff
	const preview = data.previewData;
	let previewText = $derived(() => {
		if (!preview) return '';
		const changes = [
			preview.titleChanged ? 'Headline changed' : '',
			preview.contentChanged ? 'Content changed' : ''
		].filter(Boolean).join(' & ') || 'Article updated';
		const stats = `+${preview.charsAdded} / -${preview.charsRemoved} chars`;
		const prefix = prefixInput ? `${prefixInput} ` : '';
		const suffix = suffixInput ? `\n\n${suffixInput}` : '';
		return `${prefix}${changes} in "${preview.title}" (${preview.feedName})\n${stats}\n\nhttps://diff.example.com/diff/${preview.diffId}\nhttps://example.com/article${suffix}`;
	});
	let previewCharCount = $derived(previewText().length);

	let fields = $derived((() => {
		const f = [...(profile.fields || [])];
		while (f.length < 4) f.push({ name: '', value: '' });
		return f;
	})());
</script>

<svelte:head>
	<title>Bot Profile — NewsDiff</title>
</svelte:head>

<div class="profile-editor">
	<h1>Bot Profile</h1>
	<p class="subtitle">Edit the ActivityPub bot identity. Changes take effect on next app restart.</p>

	{#if form?.success}
		<div class="notice">{form.message || 'Saved.'}</div>
	{/if}

	<!-- No use:enhance — full page reload on save ensures form shows saved values -->
	<form method="POST" action="?/save" enctype="multipart/form-data">
		<section>
			<h2>Identity</h2>

			<div class="field">
				<label for="displayName">Display Name</label>
				<input type="text" id="displayName" name="displayName" value={profile.displayName} required />
			</div>

			<div class="field">
				<label for="summary">Bio</label>
				<textarea id="summary" name="summary" rows="4">{profile.summary}</textarea>
			</div>
		</section>

		<section>
			<h2>Images</h2>

			<div class="image-fields">
				<div class="image-field">
					<span class="field-label">Avatar</span>
					{#if profile.avatarUrl}
						<div class="image-preview">
							<img src={profile.avatarUrl} alt="Current avatar" />
						</div>
					{:else}
						<div class="image-placeholder">No avatar</div>
					{/if}
					<input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" />
					{#if profile.avatarUrl}
						<form method="POST" action="?/removeAvatar" class="inline-form">
							<button type="submit" class="remove-btn">Remove</button>
						</form>
					{/if}
				</div>

				<div class="image-field">
					<span class="field-label">Header</span>
					{#if profile.headerUrl}
						<div class="image-preview header-preview">
							<img src={profile.headerUrl} alt="Current header" />
						</div>
					{:else}
						<div class="image-placeholder header-placeholder">No header</div>
					{/if}
					<input type="file" name="header" accept="image/png,image/jpeg,image/webp" />
					{#if profile.headerUrl}
						<form method="POST" action="?/removeHeader" class="inline-form">
							<button type="submit" class="remove-btn">Remove</button>
						</form>
					{/if}
				</div>
			</div>
		</section>

		<section>
			<h2>Profile Fields</h2>
			<p class="hint">Add links and metadata. URLs are automatically linked and can be used for <code>rel="me"</code> verification.</p>

			<div class="fields-list">
				{#each fields as field, i}
					<div class="field-row">
						<input type="text" name="field_name_{i}" value={field.name} placeholder="Label" />
						<input type="text" name="field_value_{i}" value={field.value} placeholder="Value or URL" />
					</div>
				{/each}
			</div>
		</section>

		<section>
			<h2>Post template</h2>
			<p class="hint">Customize how syndicated posts are constructed on ActivityPub and Bluesky. The default format is: <code>{'{change}'} in "{'{title}'}" ({'{feed}'})</code></p>
			<div class="field">
				<label for="postPrefix">Prefix</label>
				<input type="text" id="postPrefix" name="postPrefix" bind:value={prefixInput} placeholder="e.g. 📝 Edit detected:" />
				<p class="hint">Added before the change description. Leave empty for default.</p>
			</div>
			<div class="field">
				<label for="postSuffix">Suffix</label>
				<input type="text" id="postSuffix" name="postSuffix" bind:value={suffixInput} placeholder="e.g. #newsdiff #transparency" />
				<p class="hint">Added at the end of every post. Useful for hashtags.</p>
			</div>
			<div class="budget" class:budget-warn={bskyBudget < 30} class:budget-over={bskyBudget < 0}>
				Bluesky budget: ~{bskyBudget} chars remaining for title
				{#if bskyBudget < 0}
					— title will be truncated
				{:else if bskyBudget < 30}
					— title may be truncated
				{/if}
			</div>

			{#if preview}
				<div class="preview-cards">
					<div class="preview-card preview-mastodon">
						<div class="preview-header">
							<span class="preview-icon">🐘</span>
							<span class="preview-label">ActivityPub preview</span>
						</div>
						<div class="preview-body">{previewText()}</div>
						<div class="preview-meta">{previewCharCount} chars (no limit)</div>
					</div>
					<div class="preview-card preview-bluesky">
						<div class="preview-header">
							<span class="preview-icon">🦋</span>
							<span class="preview-label">Bluesky preview</span>
						</div>
						<div class="preview-body" class:preview-truncated={previewCharCount > 300}>{previewText().slice(0, 300)}{#if previewCharCount > 300}...{/if}</div>
						<div class="preview-meta" class:budget-over={previewCharCount > 300}>{Math.min(previewCharCount, 300)}/300 chars</div>
					</div>
				</div>
			{/if}
		</section>

		<div class="actions">
			<button type="submit" class="btn-save">Save Profile</button>
		</div>
	</form>

	<section class="danger-zone">
		<h2>Danger Zone</h2>
		{#if form?.message && !form?.profile}
			<p class="notice" style="background: var(--color-del-bg); color: var(--color-del-text);">{form.message}</p>
		{/if}
		<form method="POST" action="?/deleteAllPosts" onsubmit={(e) => {
			if (!confirm('Delete ALL posts from the fediverse? This sends Delete activities to all federated instances and cannot be undone.')) {
				e.preventDefault();
			}
		}}>
			<p>Delete all posts from the bot's fediverse outbox and clear the social posts database. This cannot be undone.</p>
			<button type="submit" class="btn-danger">Delete all posts</button>
		</form>
	</section>
</div>

<style>
	.profile-editor { max-width: 640px; }
	.subtitle { color: var(--color-muted); margin-bottom: 1.5rem; }
	.notice { background: var(--color-ins-bg); color: var(--color-ins-text); padding: 0.75rem; border-radius: 0.25rem; margin-bottom: 1.5rem; }

	section { margin-bottom: 2rem; }
	h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
	h2 { font-size: 1rem; color: var(--color-muted); margin-bottom: 0.75rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.25rem; }

	.field { margin-bottom: 1rem; }
	.field label, .field-label { font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 0.25rem; }
	input[type="text"], textarea {
		width: 100%; padding: 0.5rem; border: 1px solid var(--color-border); border-radius: 0.25rem;
		font-family: inherit; font-size: 0.9rem;
	}
	textarea { resize: vertical; }

	.image-fields { display: flex; gap: 2rem; flex-wrap: wrap; }
	.image-field { flex: 1; min-width: 200px; }
	.image-preview { margin-bottom: 0.5rem; }
	.image-preview img { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-border); }
	.header-preview img { width: 100%; height: 80px; border-radius: 0.25rem; object-fit: cover; }
	.image-placeholder { width: 80px; height: 80px; background: var(--color-border); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; color: var(--color-muted); margin-bottom: 0.5rem; }
	.header-placeholder { width: 100%; border-radius: 0.25rem; }
	input[type="file"] { font-size: 0.85rem; margin-bottom: 0.25rem; }
	.remove-btn { background: none; border: none; color: var(--color-del-text); cursor: pointer; font-size: 0.8rem; padding: 0; }
	.inline-form { display: inline; }

	.hint { font-size: 0.8rem; color: var(--color-muted); margin-bottom: 0.75rem; }
	.hint code { background: #e2e8f0; padding: 0.1em 0.3em; border-radius: 2px; font-size: 0.85em; }

	.fields-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.field-row { display: flex; gap: 0.5rem; }
	.field-row input { flex: 1; }
	.field-row input:first-child { max-width: 140px; }

	.actions { margin-top: 1.5rem; }
	.btn-save {
		padding: 0.5rem 1.5rem; background: var(--color-primary); color: white;
		border: none; border-radius: 0.25rem; cursor: pointer; font-size: 0.9rem;
	}
	.btn-save:hover { background: #1d4ed8; }

	.budget { font-size: 0.8rem; color: var(--color-muted); margin-top: 0.5rem; padding: 0.4rem 0.6rem; background: #f5f5f5; border-radius: 0.25rem; }
	.budget-warn { color: #92400e; background: #fef3c7; }
	.budget-over { color: var(--color-del-text); background: var(--color-del-bg); }

	.preview-cards { display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap; }
	.preview-card { flex: 1; min-width: 260px; border: 1px solid var(--color-border); border-radius: 0.5rem; overflow: hidden; background: white; }
	.preview-header { display: flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.75rem; background: #f8f8f8; border-bottom: 1px solid var(--color-border); font-size: 0.8rem; font-weight: 600; color: var(--color-muted); }
	.preview-icon { font-size: 1rem; }
	.preview-body { padding: 0.75rem; font-size: 0.85rem; line-height: 1.5; white-space: pre-wrap; word-break: break-word; color: var(--color-text); }
	.preview-truncated { color: var(--color-del-text); }
	.preview-meta { padding: 0.4rem 0.75rem; border-top: 1px solid var(--color-border); font-size: 0.75rem; color: var(--color-muted); background: #fafafa; }
	.preview-mastodon { border-left: 3px solid #6364ff; }
	.preview-bluesky { border-left: 3px solid #0085ff; }

	.danger-zone { margin-top: 3rem; padding-top: 1.5rem; border-top: 2px solid var(--color-del-bg); }
	.danger-zone h2 { color: var(--color-del-text); border-bottom-color: var(--color-del-bg); }
	.danger-zone p { font-size: 0.85rem; color: var(--color-muted); margin-bottom: 1rem; }
	.btn-danger {
		padding: 0.5rem 1.5rem; background: white; color: var(--color-del-text);
		border: 1px solid var(--color-del-text); border-radius: 0.25rem; cursor: pointer; font-size: 0.9rem;
	}
	.btn-danger:hover { background: var(--color-del-bg); }
</style>
