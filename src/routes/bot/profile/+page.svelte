<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();

	// Use profile from form action response if available, otherwise from load
	let profile = $derived(form?.profile || data.profile);

	// Ensure we always have at least 4 field slots
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

	<form method="POST" action="?/save" enctype="multipart/form-data" use:enhance>
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
						<div class="image-placeholder avatar-placeholder">No avatar</div>
					{/if}
					<input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" />
					{#if profile.avatarUrl}
						<form method="POST" action="?/removeAvatar" use:enhance class="inline-form">
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
						<form method="POST" action="?/removeHeader" use:enhance class="inline-form">
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

	<section class="current-values">
		<h2>Current Saved Values</h2>
		<dl>
			<dt>Handle</dt>
			<dd class="handle-value">@{profile.username}@diff.rmendes.net</dd>
			<dt>Name</dt>
			<dd>{profile.displayName || '(not set)'}</dd>
			<dt>Bio</dt>
			<dd>{profile.summary || '(not set)'}</dd>
			<dt>Avatar</dt>
			<dd>{profile.avatarUrl || '(none)'}</dd>
			<dt>Header</dt>
			<dd>{profile.headerUrl || '(none)'}</dd>
			{#each profile.fields || [] as field}
				<dt>{field.name}</dt>
				<dd>{field.value}</dd>
			{/each}
		</dl>
		<p class="hint">The username cannot be changed after federation (it would break existing followers).</p>
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

	.current-values { background: white; border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 1rem; }
	.current-values dl { display: grid; grid-template-columns: auto 1fr; gap: 0.25rem 1rem; font-size: 0.85rem; }
	.current-values dt { font-weight: 600; color: var(--color-muted); }
	.current-values dd { word-break: break-all; }
	.handle-value { font-weight: 600; color: var(--color-primary); }
</style>
