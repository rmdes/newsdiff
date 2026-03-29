<script lang="ts">
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	let profile = $derived(data.profile);

	// Bluesky budget: 300 chars total. ~80 chars for change desc + stats + feed name + links
	const BSKY_LIMIT = 300;
	const AP_LIMIT = 500;
	const OVERHEAD = 120;

	let apPrefixInput = $state(data.profile.postPrefix || '');
	let apSuffixInput = $state(data.profile.postSuffix || '');
	let bskyPrefixInput = $state(data.profile.bskyPostPrefix || '');
	let bskySuffixInput = $state(data.profile.bskyPostSuffix || '');

	let previewTab = $state('ap');

	const preview = data.previewData;

	function buildPreview(prefix: string, suffix: string): string {
		if (!preview) return '';
		const changes = [
			preview.titleChanged ? 'Headline changed' : '',
			preview.contentChanged ? 'Content changed' : ''
		].filter(Boolean).join(' & ') || 'Article updated';
		const stats = `+${preview.charsAdded} / -${preview.charsRemoved} chars`;
		const pfx = prefix ? `${prefix} ` : '';
		const sfx = suffix ? `\n\n${suffix}` : '';
		return `${pfx}${changes} in "${preview.title}" (${preview.feedName})\n${stats}\n\nhttps://diff.example.com/diff/${preview.diffId}\nhttps://example.com/article${sfx}`;
	}

	let apPreview = $derived(browser ? buildPreview(apPrefixInput, apSuffixInput) : '');
	let bskyPreview = $derived(browser ? buildPreview(bskyPrefixInput || apPrefixInput, bskySuffixInput || apSuffixInput) : '');
	let apBudget = $derived(AP_LIMIT - apPreview.length);
	let bskyBudget = $derived(BSKY_LIMIT - bskyPreview.length);

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
						<button type="button" class="remove-btn" onclick={async () => {
							await fetch('?/removeAvatar', { method: 'POST' });
							location.reload();
						}}>Remove</button>
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
						<button type="button" class="remove-btn" onclick={async () => {
							await fetch('?/removeHeader', { method: 'POST' });
							location.reload();
						}}>Remove</button>
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
			<p class="hint">Customize syndicated posts per network. Bluesky fields fall back to ActivityPub values if left empty.</p>

			<div class="template-tabs">
				<button type="button" class:active={previewTab === 'ap'} onclick={() => previewTab = 'ap'}>
					<span class="tab-icon">🐘</span> ActivityPub
				</button>
				<button type="button" class:active={previewTab === 'bsky'} onclick={() => previewTab = 'bsky'}>
					<span class="tab-icon">🦋</span> Bluesky
				</button>
			</div>

			<div class="template-fields" class:hidden={previewTab !== 'ap'}>
				<div class="field">
					<label for="postPrefix">Prefix</label>
					<input type="text" id="postPrefix" name="postPrefix" value={apPrefixInput} oninput={(e) => apPrefixInput = e.currentTarget.value} placeholder="e.g. 📝 Edit detected:" />
				</div>
				<div class="field">
					<label for="postSuffix">Suffix</label>
					<input type="text" id="postSuffix" name="postSuffix" value={apSuffixInput} oninput={(e) => apSuffixInput = e.currentTarget.value} placeholder="e.g. #newsdiff #transparency" />
				</div>
				<div class="budget" class:budget-warn={apBudget < 50} class:budget-over={apBudget < 0}>
					{apPreview.length}/500 chars
				</div>
			</div>
			<div class="template-fields" class:hidden={previewTab !== 'bsky'}>
				<div class="field">
					<label for="bskyPostPrefix">Prefix</label>
					<input type="text" id="bskyPostPrefix" name="bskyPostPrefix" value={bskyPrefixInput} oninput={(e) => bskyPrefixInput = e.currentTarget.value} placeholder={apPrefixInput || 'Same as ActivityPub'} />
				</div>
				<div class="field">
					<label for="bskyPostSuffix">Suffix</label>
					<input type="text" id="bskyPostSuffix" name="bskyPostSuffix" value={bskySuffixInput} oninput={(e) => bskySuffixInput = e.currentTarget.value} placeholder={apSuffixInput || 'Same as ActivityPub'} />
				</div>
				<div class="budget" class:budget-warn={bskyBudget < 30} class:budget-over={bskyBudget < 0}>
					{bskyPreview.length}/300 chars
					{#if bskyBudget < 0} — title will be truncated{/if}
				</div>
			</div>

			{#if preview}
				<div class="preview-card" class:preview-mastodon={previewTab === 'ap'} class:preview-bluesky={previewTab === 'bsky'}>
					<div class="preview-header">
						<span class="preview-icon">{previewTab === 'ap' ? '🐘' : '🦋'}</span>
						<span class="preview-label">{previewTab === 'ap' ? 'ActivityPub' : 'Bluesky'} preview</span>
					</div>
					<div class="preview-body" class:hidden={previewTab !== 'ap'}>{apPreview}</div>
					<div class="preview-body" class:hidden={previewTab !== 'bsky'} class:preview-truncated={bskyPreview.length > 300}>{bskyPreview.slice(0, 300)}{#if bskyPreview.length > 300}...{/if}</div>
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

	.template-tabs { display: flex; gap: 0; margin-bottom: 1rem; border-bottom: 2px solid var(--color-border); }
	.template-tabs button { padding: 0.5rem 1rem; border: none; background: none; cursor: pointer; font-size: 0.85rem; color: var(--color-muted); border-bottom: 2px solid transparent; margin-bottom: -2px; display: flex; align-items: center; gap: 0.3rem; }
	.template-tabs button.active { color: var(--color-text); border-bottom-color: var(--color-primary); font-weight: 600; }
	.template-tabs button:hover { color: var(--color-text); }
	.template-fields { margin-bottom: 0.75rem; }
	.hidden { display: none; }

	.preview-card { border: 1px solid var(--color-border); border-radius: 0.5rem; overflow: hidden; background: white; margin-top: 1rem; }
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
