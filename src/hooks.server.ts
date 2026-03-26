import { startWorkers } from '$lib/server/workers/startup';
import { isOidcEnabled, parseSessionCookie } from '$lib/server/auth';
import { redirect, type Handle } from '@sveltejs/kit';

startWorkers().catch((err) => {
	console.error('Failed to start workers:', err);
});

const PROTECTED_PATHS = ['/feeds'];

export const handle: Handle = async ({ event, resolve }) => {
	// Check auth for protected paths
	if (isOidcEnabled() && PROTECTED_PATHS.some(p => event.url.pathname.startsWith(p))) {
		const user = parseSessionCookie(event.request.headers.get('cookie'));
		if (!user) {
			throw redirect(302, `/auth/login?returnTo=${event.url.pathname}`);
		}
		// Make user available to load functions
		event.locals.user = user;
	}

	return resolve(event);
};
