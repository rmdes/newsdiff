import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { buildLoginUrl, isOidcEnabled } from '$lib/server/auth';

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!isOidcEnabled()) {
		throw redirect(302, '/feeds');
	}

	const origin = url.origin;
	const returnTo = url.searchParams.get('returnTo') || '/feeds';
	const { url: loginUrl, codeVerifier } = await buildLoginUrl(origin, returnTo);

	// Store code verifier in a short-lived cookie for the callback
	cookies.set('oidc_verifier', codeVerifier, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: true,
		maxAge: 300 // 5 minutes
	});

	throw redirect(302, loginUrl);
};
