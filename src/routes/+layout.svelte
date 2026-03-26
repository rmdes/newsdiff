<script>
	import '../app.css';
	let { children } = $props();
</script>

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

<style>
	header { border-bottom: 1px solid var(--color-border); padding: 1rem 0; margin-bottom: 2rem; }
	nav { display: flex; gap: 1.5rem; align-items: center; }
	.logo { font-weight: 700; font-size: 1.25rem; text-decoration: none; color: var(--color-text); }
	.logo:hover { color: var(--color-primary); }
	.nav-links { display: flex; gap: 1rem; margin-left: auto; }
	.nav-links a { color: var(--color-muted); text-decoration: none; }
	.nav-links a:hover { color: var(--color-primary); }
</style>
