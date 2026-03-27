import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { handleCallback, createSessionCookie, getRedirectUri, isOidcEnabled } from '$lib/server/auth';

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!isOidcEnabled()) {
		throw redirect(302, '/feeds');
	}

	const codeVerifier = cookies.get('oidc_verifier');
	if (!codeVerifier) {
		throw redirect(302, '/auth/login');
	}

	// Clear the verifier cookie
	cookies.delete('oidc_verifier', { path: '/' });

	try {
		const user = await handleCallback(url.origin, url, codeVerifier);

		// Parse returnTo from state
		let returnTo = '/feeds';
		const state = url.searchParams.get('state');
		if (state) {
			try {
				const parsed = JSON.parse(Buffer.from(state, 'base64url').toString());
				if (parsed.returnTo && typeof parsed.returnTo === 'string'
					&& parsed.returnTo.startsWith('/') && !parsed.returnTo.startsWith('//')) {
					returnTo = parsed.returnTo;
				}
			} catch { /* use default */ }
		}

		// Set session cookie via headers (SvelteKit cookies.set doesn't support all options)
		const sessionCookie = createSessionCookie(user);

		return new Response(null, {
			status: 302,
			headers: {
				'Location': returnTo,
				'Set-Cookie': sessionCookie
			}
		});
	} catch (err) {
		console.error('OIDC callback error:', err);
		throw redirect(302, '/auth/login');
	}
};
