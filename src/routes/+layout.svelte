<script>
	import { browser } from '$app/environment';
	import '../app.css';
	let { data, children } = $props();
	const { botHandle, botActorUrl, bskyHandle, bskyProfileUrl } = data;

	let instanceModalOpen = $state(false);
	let instanceInput = $state('');

	$effect(() => {
		if (browser) {
			instanceInput = localStorage.getItem('fedi-instance') || '';
		}
	});

	function openOnFediverse(e) {
		e.preventDefault();
		if (!botActorUrl) return;
		const saved = browser && localStorage.getItem('fedi-instance');
		if (saved) {
			window.open(`https://${saved}/authorize_interaction?uri=${encodeURIComponent(botActorUrl)}`, '_blank');
		} else {
			instanceModalOpen = true;
		}
	}

	function submitInstance() {
		const instance = instanceInput.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
		if (!instance) return;
		localStorage.setItem('fedi-instance', instance);
		instanceModalOpen = false;
		window.open(`https://${instance}/authorize_interaction?uri=${encodeURIComponent(botActorUrl)}`, '_blank');
	}
</script>

<svelte:head>
	{#if botActorUrl}<link rel="me" href={botActorUrl} />{/if}
	<link rel="alternate" type="application/atom+xml" title="NewsDiff — All Diffs" href="/feed.xml" />
</svelte:head>

<header>
	<div class="container header-inner">
		<a href="/" class="logo" data-sveltekit-preload-data="hover">
			<img src="/logo.png" alt="NewsDiff" class="logo-img" />
			NewsDiff
		</a>
		<nav class="nav-links">
			<a href="/about" data-sveltekit-preload-data="hover">About</a>
			<a href="/feeds" data-sveltekit-preload-data="hover">Feeds</a>
			<a href="/bot/profile" data-sveltekit-preload-data="hover">Bot</a>
		</nav>
	</div>
</header>

<main class="container">
	{@render children()}
</main>

<footer class="container">
	<div class="follow-links">
		{#if botHandle}
			<a href={botActorUrl} rel="me" class="follow-link" onclick={openOnFediverse} title="Follow on the fediverse">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 74 79" fill="currentColor">
					<path d="M73.7 17.7c-1-6.2-6.3-11-12.7-12.3C54.5 4 37.2 2 37.2 2h-.1C27 2 19.5 4 13 5.4 6.6 6.7 1.3 11.5.3 17.7c-.5 3.3-.9 7.1-.9 11 0 3.2.1 6.2.3 9 .7 9.4 5.3 17.7 13.4 21.4 3.8 1.8 8.1 2.7 12.5 3 4.5.3 8.7-.3 12.5-1.7 0 0 0 0 0 0-.3-1.4-.6-2.9-1-4.3-4 1.2-8.3 1.6-12.6 1.3-4.3-.3-8.5-1.7-8.8-6.5-.1-.5-.1-1-.1-1.5 4 1 8.1 1.6 12.3 1.8 2.6.1 5.1 0 7.6-.2 7.1-.7 13.3-2.9 14.1-5.3.6-1.8.8-3.8.8-5.9v-.3c0-6.3 2.4-7.2 2.4-7.2 2.4-1.1 1.3 4.4 1.3 7.2 0 2.4-.3 5.5-1.1 8.5-.5 2-1.4 3.8-2.5 5.4 4.1-1.7 7.5-4.6 9.5-8.5 2.5-5 2.8-10.9 2.8-15.9 0-3.9-.3-7.7-.9-11z"/>
					<path d="M61.2 27.2v22.7h-9V28c0-4.6-1.9-7-5.8-7-4.3 0-6.4 2.8-6.4 8.3v12h-9V29.3c0-5.5-2.2-8.3-6.4-8.3-3.9 0-5.8 2.3-5.8 7v21.9h-9V27.2c0-4.6 1.2-8.3 3.5-11 2.4-2.7 5.6-4.1 9.5-4.1 4.5 0 7.9 1.7 10.2 5.2l2.2 3.7 2.2-3.7c2.2-3.5 5.7-5.2 10.2-5.2 3.9 0 7.1 1.4 9.5 4.1 2.3 2.7 3.5 6.4 3.5 11z"/>
				</svg>
				{botHandle}
			</a>
		{/if}
		{#if bskyHandle}
			<a href={bskyProfileUrl} target="_blank" rel="noopener" class="follow-link" title="Follow on Bluesky">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 568 501" fill="currentColor">
					<path d="M123.121 33.664C188.241 82.553 258.281 181.68 284 234.873c25.719-53.192 95.759-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.947c0 17.346-9.945 145.713-15.778 166.555-20.275 72.453-94.155 90.933-159.875 79.748C507.222 323.8 536.444 388.56 473.333 453.32c-119.86 122.992-172.272-30.859-185.702-70.281-2.462-7.227-3.614-10.608-3.631-7.733-.017-2.875-1.169.506-3.631 7.733-13.43 39.422-65.842 193.273-185.702 70.281-63.111-64.76-33.889-129.52 80.986-149.07-65.72 11.185-139.6-7.295-159.875-79.748C10.945 203.659 1 75.291 1 57.946 1-28.906 77.135-1.612 123.121 33.664z"/>
				</svg>
				@{bskyHandle}
			</a>
		{/if}
	</div>
	<p><a href="https://github.com/rmdes/newsdiff">Source code</a> · <a href="/feed.xml">Atom feed</a></p>
</footer>

<!-- Fediverse instance picker modal (shared across pages) -->
{#if instanceModalOpen}
	<div class="modal-backdrop" onclick={() => instanceModalOpen = false}>
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<h3>Your Mastodon instance</h3>
			<p>Enter your instance to follow the bot from your account.</p>
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
					<button type="button" class="btn-cancel" onclick={() => instanceModalOpen = false}>Cancel</button>
					<button type="submit" class="btn-go">Follow on fediverse</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	header { border-bottom: 1px solid var(--color-border); margin-bottom: 2rem; }
	.header-inner { display: flex; justify-content: space-between; align-items: center; padding-top: 1rem; padding-bottom: 1rem; }
	.logo { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 1.3rem; text-decoration: none; color: var(--color-text); }
	.logo:hover { color: var(--color-primary); }
	.logo-img { width: 36px; height: 36px; border-radius: 6px; }
	.nav-links { display: flex; gap: 1.25rem; }
	.nav-links a { color: var(--color-muted); text-decoration: none; font-size: 1rem; }
	.nav-links a:hover { color: var(--color-primary); }

	footer { margin-top: 3rem; padding: 1.5rem 0; border-top: 1px solid var(--color-border); font-size: 0.8rem; color: var(--color-muted); text-align: center; }
	footer a { color: var(--color-primary); text-decoration: none; }
	footer a:hover { text-decoration: underline; }

	.follow-links { display: flex; justify-content: center; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
	.follow-link { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.85rem; color: var(--color-text); text-decoration: none; }
	.follow-link:hover { color: var(--color-primary); }
	.follow-link svg { opacity: 0.7; }
	.follow-link:hover svg { opacity: 1; }

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
	.instance-input input { flex: 1; border: none; padding: 0.5rem; font-size: 0.9rem; outline: none; }
	.modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
	.btn-cancel { padding: 0.4rem 0.75rem; border: 1px solid var(--color-border); border-radius: 0.25rem; background: white; cursor: pointer; font-size: 0.85rem; }
	.btn-go { padding: 0.4rem 0.75rem; border: none; border-radius: 0.25rem; background: var(--color-primary); color: white; cursor: pointer; font-size: 0.85rem; }
	.btn-go:hover { background: #1d4ed8; }
</style>
