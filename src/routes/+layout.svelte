<script>
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<link rel="me" href="https://diff.rmendes.net/ap/actor/bot" />
</svelte:head>

<header>
	<nav class="container">
		<a href="/" class="logo" data-sveltekit-preload-data="hover">NewsDiff</a>
		<div class="nav-links">
			<a href="/" data-sveltekit-preload-data="hover">Home</a>
			<a href="/feeds" data-sveltekit-preload-data="hover">Feeds</a>
		</div>
	</nav>
</header>

<main class="container">
	{@render children()}
</main>

<footer class="container">
	<p>Follow on the fediverse: <a href="https://diff.rmendes.net/ap/actor/bot" rel="me">@bot@diff.rmendes.net</a></p>
</footer>

<style>
	header { border-bottom: 1px solid var(--color-border); padding: 1rem 0; margin-bottom: 2rem; }
	nav { display: flex; gap: 1.5rem; align-items: center; }
	.logo { font-weight: 700; font-size: 1.25rem; text-decoration: none; color: var(--color-text); }
	.logo:hover { color: var(--color-primary); }
	.nav-links { display: flex; gap: 1rem; margin-left: auto; }
	.nav-links a { color: var(--color-muted); text-decoration: none; }
	.nav-links a:hover { color: var(--color-primary); }
	footer { margin-top: 3rem; padding: 1.5rem 0; border-top: 1px solid var(--color-border); font-size: 0.8rem; color: var(--color-muted); text-align: center; }
	footer a { color: var(--color-primary); text-decoration: none; }
	footer a:hover { text-decoration: underline; }
</style>
