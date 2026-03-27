<script>
	import '../app.css';
	let { data, children } = $props();
	const { botHandle, botActorUrl } = data;
</script>

<svelte:head>
	{#if botActorUrl}<link rel="me" href={botActorUrl} />{/if}
	<link rel="alternate" type="application/atom+xml" title="NewsDiff — All Diffs" href="/feed.xml" />
</svelte:head>

<header>
	<nav class="container">
		<a href="/" class="logo" data-sveltekit-preload-data="hover">
			<img src="/logo.png" alt="NewsDiff" class="logo-img" />
			NewsDiff
		</a>
		<div class="nav-links">
			<a href="/" data-sveltekit-preload-data="hover">Home</a>
			<a href="/about" data-sveltekit-preload-data="hover">About</a>
			<a href="/feeds" data-sveltekit-preload-data="hover">Feeds</a>
			<a href="/bot/profile" data-sveltekit-preload-data="hover">Bot</a>
		</div>
	</nav>
</header>

<main class="container">
	{@render children()}
</main>

<footer class="container">
	{#if botHandle}
		<p>Follow on the fediverse: <a href={botActorUrl} rel="me">{botHandle}</a></p>
	{/if}
	<p><a href="https://github.com/rmdes/newsdiff">Source code</a> · <a href="/feed.xml">Atom feed</a></p>
</footer>

<style>
	header { border-bottom: 1px solid var(--color-border); margin-bottom: 2rem; }
	nav { display: flex; flex-wrap: wrap; gap: 0.75rem 1.5rem; align-items: center; padding: 1rem 0; }
	.logo { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 1.25rem; text-decoration: none; color: var(--color-text); white-space: nowrap; }
	.logo:hover { color: var(--color-primary); }
	.logo-img { width: 32px; height: 32px; min-width: 32px; border-radius: 4px; }
	.nav-links { display: flex; gap: 1rem; margin-left: auto; }
	.nav-links a { color: var(--color-muted); text-decoration: none; font-size: 0.9rem; }
	.nav-links a:hover { color: var(--color-primary); }
	footer { margin-top: 3rem; padding: 1.5rem 0; border-top: 1px solid var(--color-border); font-size: 0.8rem; color: var(--color-muted); text-align: center; }
	footer a { color: var(--color-primary); text-decoration: none; }
	footer a:hover { text-decoration: underline; }
</style>
