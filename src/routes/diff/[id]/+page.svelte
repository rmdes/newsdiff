<script lang="ts">
	import { browser } from '$app/environment';

	let { data } = $props();
	const { diff, prevDiffId, nextDiffId, apPostUri, bskyPostUrl } = data;

	let isMobile = $state(false);
	let shareMenuOpen = $state(false);
	let shareStatus = $state('');
	let instanceModalOpen = $state(false);
	let instanceInput = $state('');

	$effect(() => {
		if (browser) {
			isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
			instanceInput = localStorage.getItem('fedi-instance') || '';
		}
	});

	function buildShareText(): string {
		const title = diff.newVersion.title || diff.oldVersion.title || 'Article changed';
		const changes = [
			diff.titleChanged ? 'headline' : '',
			diff.contentChanged ? 'content' : ''
		].filter(Boolean).join(' & ');
		return `${changes.charAt(0).toUpperCase() + changes.slice(1)} changed in "${title}" (${diff.article.feed.name})`;
	}

	async function nativeShare() {
		shareStatus = 'Preparing...';
		try {
			const imageUrl = `/api/diff/${diff.id}/image.png`;
			const response = await fetch(imageUrl);
			const blob = await response.blob();
			const file = new File([blob], `diff-${diff.id}.png`, { type: 'image/png' });

			await navigator.share({
				title: buildShareText(),
				text: buildShareText(),
				url: window.location.href,
				files: [file]
			});
		} catch (err: any) {
			if (err.name !== 'AbortError') {
				try {
					await navigator.share({ text: buildShareText(), url: window.location.href });
				} catch { /* user cancelled */ }
			}
		}
		shareStatus = '';
	}

	function shareToBluesky() {
		const text = `${buildShareText()}\n\n${window.location.href}`;
		window.open(`https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`, '_blank');
		shareMenuOpen = false;
	}

	function shareToMastodon() {
		const text = `${buildShareText()}\n\n${window.location.href}`;
		window.open(`https://mastodon.social/share?text=${encodeURIComponent(text)}`, '_blank');
		shareMenuOpen = false;
	}

	function copyLink() {
		navigator.clipboard.writeText(window.location.href);
		shareMenuOpen = false;
		shareStatus = 'Copied!';
		setTimeout(() => shareStatus = '', 2000);
	}

	function openOnFediverse() {
		const saved = localStorage.getItem('fedi-instance');
		if (saved) {
			window.open(`https://${saved}/authorize_interaction?uri=${encodeURIComponent(apPostUri!)}`, '_blank');
		} else {
			instanceModalOpen = true;
		}
	}

	function submitInstance() {
		const instance = instanceInput.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
		if (!instance) return;
		localStorage.setItem('fedi-instance', instance);
		instanceModalOpen = false;
		window.open(`https://${instance}/authorize_interaction?uri=${encodeURIComponent(apPostUri!)}`, '_blank');
	}

	function changeInstance() {
		instanceModalOpen = true;
	}
</script>

<svelte:head>
	<title>Diff: {diff.newVersion.title || 'Untitled'} — NewsDiff</title>
	<meta property="og:title" content="Article changed: {diff.newVersion.title}" />
	<meta property="og:image" content="/api/diff/{diff.id}/image.png" />
	<meta property="og:image:width" content="800" />
	<meta property="og:image:height" content="418" />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<article class="diff-view">
	<header>
		<a href="/feed/{diff.article.feed.id}" class="feed-link">{diff.article.feed.name}</a>
		<h1>{diff.newVersion.title || diff.oldVersion.title || 'Untitled'}</h1>
		<div class="meta">
			<a href={diff.article.url} target="_blank" rel="noopener">Original article</a>
			<span>Version {diff.oldVersion.versionNumber} → {diff.newVersion.versionNumber}</span>
			<time>{new Date(diff.createdAt).toLocaleString()}</time>
		</div>
		<div class="badges">
			{#if diff.titleChanged}<span class="badge badge-title">Headline changed</span>{/if}
			{#if diff.contentChanged}<span class="badge badge-content">Content changed</span>{/if}
			{#if diff.isBoring}<span class="badge badge-boring">Boring</span>{/if}
		</div>
		<div class="actions">
			{#if isMobile}
				<button class="btn btn-share" onclick={nativeShare}>
					{shareStatus || 'Share'}
				</button>
			{:else}
				<div class="share-dropdown">
					<button class="btn btn-share" onclick={() => shareMenuOpen = !shareMenuOpen}>
						{shareStatus || 'Share'}
					</button>
					{#if shareMenuOpen}
						<div class="share-menu">
							<button onclick={shareToBluesky}>Bluesky</button>
							<button onclick={shareToMastodon}>Mastodon</button>
							<button onclick={copyLink}>Copy link</button>
						</div>
					{/if}
				</div>
			{/if}
			<a href="/api/diff/{diff.id}/full.png" download="diff-{diff.id}-full.png" class="btn">Download image</a>
			{#if apPostUri}
				<button class="btn btn-fedi" onclick={openOnFediverse} title="View this post on the fediverse">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 74 79" fill="currentColor">
						<path d="M73.7 17.7c-1-6.2-6.3-11-12.7-12.3C54.5 4 37.2 2 37.2 2h-.1C27 2 19.5 4 13 5.4 6.6 6.7 1.3 11.5.3 17.7c-.5 3.3-.9 7.1-.9 11 0 3.2.1 6.2.3 9 .7 9.4 5.3 17.7 13.4 21.4 3.8 1.8 8.1 2.7 12.5 3 4.5.3 8.7-.3 12.5-1.7 0 0 0 0 0 0-.3-1.4-.6-2.9-1-4.3-4 1.2-8.3 1.6-12.6 1.3-4.3-.3-8.5-1.7-8.8-6.5-.1-.5-.1-1-.1-1.5 4 1 8.1 1.6 12.3 1.8 2.6.1 5.1 0 7.6-.2 7.1-.7 13.3-2.9 14.1-5.3.6-1.8.8-3.8.8-5.9v-.3c0-6.3 2.4-7.2 2.4-7.2 2.4-1.1 1.3 4.4 1.3 7.2 0 2.4-.3 5.5-1.1 8.5-.5 2-1.4 3.8-2.5 5.4 4.1-1.7 7.5-4.6 9.5-8.5 2.5-5 2.8-10.9 2.8-15.9 0-3.9-.3-7.7-.9-11z"/>
						<path d="M61.2 27.2v22.7h-9V28c0-4.6-1.9-7-5.8-7-4.3 0-6.4 2.8-6.4 8.3v12h-9V29.3c0-5.5-2.2-8.3-6.4-8.3-3.9 0-5.8 2.3-5.8 7v21.9h-9V27.2c0-4.6 1.2-8.3 3.5-11 2.4-2.7 5.6-4.1 9.5-4.1 4.5 0 7.9 1.7 10.2 5.2l2.2 3.7 2.2-3.7c2.2-3.5 5.7-5.2 10.2-5.2 3.9 0 7.1 1.4 9.5 4.1 2.3 2.7 3.5 6.4 3.5 11z"/>
					</svg>
					ActivityPub
				</button>
			{/if}
			{#if bskyPostUrl}
				<a href={bskyPostUrl} target="_blank" rel="noopener" class="btn btn-bsky" title="View this post on Bluesky">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 568 501" fill="currentColor">
						<path d="M123.121 33.664C188.241 82.553 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.947c0 17.346-9.945 145.713-15.778 166.555-20.275 72.453-94.155 90.933-159.875 79.748C507.222 323.8 536.444 388.56 473.333 453.32c-119.86 122.992-172.272-30.859-185.702-70.281-2.462-7.227-3.614-10.608-3.631-7.733-.017-2.875-1.169.506-3.631 7.733-13.43 39.422-65.842 193.273-185.702 70.281-63.111-64.76-33.889-129.52 80.986-149.07-65.72 11.185-139.6-7.295-159.875-79.748C10.945 203.659 1 75.291 1 57.946 1-28.906 77.135-1.612 123.121 33.664z"/>
					</svg>
					Bluesky
				</a>
			{/if}
		</div>
	</header>

	<section class="diff-section">
		<h2>Changes</h2>
		<div class="diff-body">{@html diff.diffHtml}</div>
	</section>

	<nav class="diff-nav">
		{#if prevDiffId}<a href="/diff/{prevDiffId}">← Previous diff</a>{:else}<span></span>{/if}
		<a href="/article/{diff.article.id}">All versions</a>
		{#if nextDiffId}<a href="/diff/{nextDiffId}">Next diff →</a>{:else}<span></span>{/if}
	</nav>
</article>

<!-- Fediverse instance picker modal -->
{#if instanceModalOpen}
	<div class="modal-backdrop" onclick={() => instanceModalOpen = false}>
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<h3>Your Mastodon instance</h3>
			<p>Enter your instance to interact with this post from your account.</p>
			<form onsubmit={(e) => { e.preventDefault(); submitInstance(); }}>
				<div class="instance-input">
					<span class="instance-prefix">https://</span>
					<input
						type="text"
						bind:value={instanceInput}
						placeholder="mastodon.social"
						autofocus
					/>
				</div>
				<div class="modal-actions">
					<button type="button" class="btn" onclick={() => instanceModalOpen = false}>Cancel</button>
					<button type="submit" class="btn btn-share">Open on fediverse</button>
				</div>
			</form>
		</div>
	</div>
{/if}

{#if apPostUri && browser && localStorage.getItem('fedi-instance')}
	<p class="instance-note">
		Using <strong>{localStorage.getItem('fedi-instance')}</strong> —
		<button class="link-btn" onclick={changeInstance}>change</button>
	</p>
{/if}

<style>
	.diff-view { max-width: 720px; }
	header { margin-bottom: 2rem; }
	.feed-link { font-size: 0.8rem; color: var(--color-muted); text-decoration: none; }
	.feed-link:hover { color: var(--color-primary); }
	h1 { font-size: 1.5rem; margin: 0.5rem 0; }
	.meta { display: flex; gap: 1rem; font-size: 0.85rem; color: var(--color-muted); flex-wrap: wrap; }
	.meta a { color: var(--color-primary); }
	.badges { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
	.badge { font-size: 0.75rem; padding: 0.15rem 0.5rem; border-radius: 1rem; font-weight: 600; }
	.badge-title { background: var(--color-del-bg); color: var(--color-del-text); }
	.badge-content { background: var(--color-ins-bg); color: var(--color-ins-text); }
	.badge-boring { background: #e2e8f0; color: #475569; }
	.diff-section { margin-bottom: 2rem; }
	.diff-section h2 { font-size: 1rem; color: var(--color-muted); margin-bottom: 0.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.25rem; }
	.diff-body { line-height: 1.8; word-wrap: break-word; white-space: pre-line; }
	.diff-nav { display: flex; justify-content: space-between; padding-top: 1.5rem; border-top: 1px solid var(--color-border); }
	.diff-nav a { color: var(--color-primary); text-decoration: none; }
	.actions { display: flex; gap: 0.5rem; margin-top: 1rem; align-items: center; flex-wrap: wrap; }
	.btn { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.75rem; border-radius: 0.25rem; font-size: 0.85rem; cursor: pointer; text-decoration: none; border: 1px solid var(--color-border); background: white; color: var(--color-text); }
	.btn:hover { border-color: var(--color-primary); color: var(--color-primary); }
	.btn-share { background: var(--color-primary); color: white; border-color: var(--color-primary); }
	.btn-share:hover { background: #1d4ed8; color: white; }
	.btn-fedi { border-color: #6364ff; color: #6364ff; }
	.btn-fedi:hover { background: #6364ff; color: white; }
	.btn-bsky { border-color: #0085ff; color: #0085ff; }
	.btn-bsky:hover { background: #0085ff; color: white; }
	.btn-fedi:hover { background: #6364ff; color: white; }

	.share-dropdown { position: relative; }
	.share-menu {
		position: absolute; top: 100%; left: 0; margin-top: 0.25rem;
		background: white; border: 1px solid var(--color-border); border-radius: 0.375rem;
		box-shadow: 0 4px 12px rgba(0,0,0,0.1); z-index: 10; min-width: 150px;
		display: flex; flex-direction: column;
	}
	.share-menu button {
		display: block; width: 100%; text-align: left; padding: 0.5rem 0.75rem;
		border: none; background: none; cursor: pointer; font-size: 0.85rem; color: var(--color-text);
	}
	.share-menu button:hover { background: #f0f4ff; color: var(--color-primary); }
	.share-menu button:not(:last-child) { border-bottom: 1px solid var(--color-border); }

	/* Instance picker modal */
	.modal-backdrop {
		position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 100;
		display: flex; align-items: center; justify-content: center;
	}
	.modal {
		background: white; border-radius: 0.5rem; padding: 1.5rem; max-width: 420px; width: 90%;
		box-shadow: 0 8px 32px rgba(0,0,0,0.2);
	}
	.modal h3 { margin: 0 0 0.5rem; font-size: 1.1rem; }
	.modal p { font-size: 0.85rem; color: var(--color-muted); margin-bottom: 1rem; }
	.instance-input {
		display: flex; align-items: center; border: 1px solid var(--color-border); border-radius: 0.25rem;
		overflow: hidden; margin-bottom: 1rem;
	}
	.instance-prefix { padding: 0.5rem; background: #f5f5f5; color: var(--color-muted); font-size: 0.85rem; border-right: 1px solid var(--color-border); }
	.instance-input input {
		flex: 1; border: none; padding: 0.5rem; font-size: 0.9rem; outline: none;
	}
	.modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }

	.instance-note { font-size: 0.8rem; color: var(--color-muted); margin-top: 0.5rem; }
	.link-btn { border: none; background: none; color: var(--color-primary); cursor: pointer; font-size: 0.8rem; padding: 0; text-decoration: underline; }
</style>
