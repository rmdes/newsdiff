import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { clearSessionCookie } from '$lib/server/auth';

export const GET: RequestHandler = async () => {
	return new Response(null, {
		status: 302,
		headers: {
			'Location': '/',
			'Set-Cookie': clearSessionCookie()
		}
	});
};
