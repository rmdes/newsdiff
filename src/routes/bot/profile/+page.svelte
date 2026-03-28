<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();
	let profile = $derived(data.profile);

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

		<div class="actions">
			<button type="submit" class="btn-save">Save Profile</button>
		</div>
	</form>

	<section class="danger-zone">
		<h2>Danger Zone</h2>
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

	.danger-zone { margin-top: 3rem; padding-top: 1.5rem; border-top: 2px solid var(--color-del-bg); }
	.danger-zone h2 { color: var(--color-del-text); border-bottom-color: var(--color-del-bg); }
	.danger-zone p { font-size: 0.85rem; color: var(--color-muted); margin-bottom: 1rem; }
	.btn-danger {
		padding: 0.5rem 1.5rem; background: white; color: var(--color-del-text);
		border: 1px solid var(--color-del-text); border-radius: 0.25rem; cursor: pointer; font-size: 0.9rem;
	}
	.btn-danger:hover { background: var(--color-del-bg); }
</style>
