<script>
	import '../app.css';
	let { children } = $props();
</script>

<header>
	<nav class="container">
		<a href="/" class="logo">NewsDiff</a>
		<a href="/feeds">Feeds</a>
	</nav>
</header>

<main class="container">
	{@render children()}
</main>

<style>
	header { border-bottom: 1px solid var(--color-border); padding: 1rem 0; margin-bottom: 2rem; }
	nav { display: flex; gap: 1.5rem; align-items: center; }
	.logo { font-weight: 700; font-size: 1.25rem; text-decoration: none; color: var(--color-text); }
	nav a { color: var(--color-muted); text-decoration: none; }
	nav a:hover { color: var(--color-primary); }
</style>
