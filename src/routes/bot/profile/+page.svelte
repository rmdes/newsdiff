<script lang="ts">
	import { enhance } from '$app/forms';
	let { data, form } = $props();

	// Ensure we always have at least 4 field slots
	let fields = $derived((() => {
		const f = [...(data.profile.fields || [])];
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

			<label>
				<span>Display Name</span>
				<input type="text" name="displayName" value={data.profile.displayName} required />
			</label>

			<label>
				<span>Bio</span>
				<textarea name="summary" rows="4">{data.profile.summary}</textarea>
			</label>
		</section>

		<section>
			<h2>Images</h2>

			<div class="image-fields">
				<div class="image-field">
					<span>Avatar</span>
					{#if data.profile.avatarUrl}
						<div class="image-preview">
							<img src={data.profile.avatarUrl} alt="Current avatar" />
						</div>
					{/if}
					<input type="file" name="avatar" accept="image/png,image/jpeg,image/webp" />
					{#if data.profile.avatarUrl}
						<form method="POST" action="?/removeAvatar" use:enhance class="inline-form">
							<button type="submit" class="remove-btn">Remove avatar</button>
						</form>
					{/if}
				</div>

				<div class="image-field">
					<span>Header</span>
					{#if data.profile.headerUrl}
						<div class="image-preview header-preview">
							<img src={data.profile.headerUrl} alt="Current header" />
						</div>
					{/if}
					<input type="file" name="header" accept="image/png,image/jpeg,image/webp" />
					{#if data.profile.headerUrl}
						<form method="POST" action="?/removeHeader" use:enhance class="inline-form">
							<button type="submit" class="remove-btn">Remove header</button>
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

	<section class="info">
		<h2>Current Bot Handle</h2>
		<p class="handle">@{data.profile.username}@diff.rmendes.net</p>
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

	label { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 1rem; }
	label span { font-size: 0.85rem; font-weight: 600; }
	input[type="text"], textarea {
		padding: 0.5rem; border: 1px solid var(--color-border); border-radius: 0.25rem;
		font-family: inherit; font-size: 0.9rem;
	}
	textarea { resize: vertical; }

	.image-fields { display: flex; gap: 2rem; flex-wrap: wrap; }
	.image-field { flex: 1; min-width: 200px; }
	.image-field span { font-size: 0.85rem; font-weight: 600; display: block; margin-bottom: 0.5rem; }
	.image-preview { margin-bottom: 0.5rem; }
	.image-preview img { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid var(--color-border); }
	.header-preview img { width: 100%; height: 80px; border-radius: 0.25rem; object-fit: cover; }
	input[type="file"] { font-size: 0.85rem; margin-bottom: 0.25rem; }
	.remove-btn { background: none; border: none; color: var(--color-del-text); cursor: pointer; font-size: 0.8rem; padding: 0; }
	.inline-form { display: inline; }

	.hint { font-size: 0.8rem; color: var(--color-muted); margin-bottom: 0.75rem; }
	.hint code { background: #e2e8f0; padding: 0.1em 0.3em; border-radius: 2px; font-size: 0.85em; }

	.fields-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.field-row { display: flex; gap: 0.5rem; }
	.field-row input { flex: 1; padding: 0.4rem; border: 1px solid var(--color-border); border-radius: 0.25rem; font-size: 0.85rem; }
	.field-row input:first-child { max-width: 140px; }

	.actions { margin-top: 1.5rem; }
	.btn-save {
		padding: 0.5rem 1.5rem; background: var(--color-primary); color: white;
		border: none; border-radius: 0.25rem; cursor: pointer; font-size: 0.9rem;
	}
	.btn-save:hover { background: #1d4ed8; }

	.info { background: white; border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 1rem; }
	.handle { font-size: 1.1rem; font-weight: 600; color: var(--color-primary); }
</style>
