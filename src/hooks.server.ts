import { startWorkers } from '$lib/server/workers/startup';

startWorkers().catch((err) => {
	console.error('Failed to start workers:', err);
});
