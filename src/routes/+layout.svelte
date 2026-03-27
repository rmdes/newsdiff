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
	{#if botHandle}
		<p>Follow on the fediverse: <a href={botActorUrl} rel="me">{botHandle}</a></p>
	{/if}
	<p><a href="https://github.com/rmdes/newsdiff">Source code</a> · <a href="/feed.xml">Atom feed</a></p>
</footer>

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
</style>
