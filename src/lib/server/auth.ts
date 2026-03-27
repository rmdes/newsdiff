import * as client from 'openid-client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

let config: client.Configuration | null = null;
let configPromise: Promise<client.Configuration> | null = null;

const CALLBACK_PATH = '/auth/callback';
const COOKIE_NAME = 'newsdiff_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
	const secret = process.env.OIDC_SESSION_SECRET || process.env.CLOUDRON_OIDC_CLIENT_SECRET;
	if (!secret) {
		throw new Error('FATAL: No session secret configured. Set OIDC_SESSION_SECRET or CLOUDRON_OIDC_CLIENT_SECRET.');
	}
	return secret;
}

export function isOidcEnabled(): boolean {
	return Boolean(process.env.CLOUDRON_OIDC_ISSUER && process.env.CLOUDRON_OIDC_CLIENT_ID);
}

export async function getOidcConfig(): Promise<client.Configuration> {
	if (config) return config;
	if (configPromise) return configPromise;

	configPromise = (async () => {
		const issuer = new URL(process.env.CLOUDRON_OIDC_ISSUER!);
		const clientId = process.env.CLOUDRON_OIDC_CLIENT_ID!;
		const clientSecret = process.env.CLOUDRON_OIDC_CLIENT_SECRET!;

		config = await client.discovery(issuer, clientId, clientSecret);
		return config;
	})();

	return configPromise;
}

export function getRedirectUri(origin: string): string {
	return `${origin}${CALLBACK_PATH}`;
}

export async function buildLoginUrl(origin: string, returnTo: string = '/'): Promise<{ url: string; codeVerifier: string; state: string }> {
	const oidcConfig = await getOidcConfig();
	const codeVerifier = client.randomPKCECodeVerifier();
	const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
	const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url');

	const redirectTo = client.buildAuthorizationUrl(oidcConfig, {
		redirect_uri: getRedirectUri(origin),
		scope: 'openid profile email',
		code_challenge: codeChallenge,
		code_challenge_method: 'S256',
		state
	});

	return { url: redirectTo.href, codeVerifier, state };
}

export async function handleCallback(origin: string, currentUrl: URL, codeVerifier: string): Promise<{ email: string; name: string }> {
	const oidcConfig = await getOidcConfig();
	const tokens = await client.authorizationCodeGrant(oidcConfig, currentUrl, {
		pkceCodeVerifier: codeVerifier,
		expectedState: currentUrl.searchParams.get('state') || undefined
	});

	const claims = tokens.claims();
	return {
		email: (claims?.email as string) || '',
		name: (claims?.name as string) || (claims?.preferred_username as string) || ''
	};
}

// Simple signed session cookie
export function createSessionCookie(userData: { email: string; name: string }): string {
	const payload = JSON.stringify({ ...userData, iat: Date.now() });
	const signature = createHmac('sha256', getSecret()).update(payload).digest('base64url');
	const value = `${Buffer.from(payload).toString('base64url')}.${signature}`;
	return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}; Secure`;
}

export function clearSessionCookie(): string {
	return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

export function parseSessionCookie(cookieHeader: string | null): { email: string; name: string } | null {
	if (!cookieHeader) return null;

	const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith(`${COOKIE_NAME}=`));
	if (!match) return null;

	const value = match.slice(COOKIE_NAME.length + 1);
	const [payloadB64, signature] = value.split('.');
	if (!payloadB64 || !signature) return null;

	const payload = Buffer.from(payloadB64, 'base64url').toString();
	const expectedSig = createHmac('sha256', getSecret()).update(payload).digest('base64url');

	const sigBuf = Buffer.from(signature, 'base64url');
	const expectedBuf = Buffer.from(expectedSig, 'base64url');
	if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) return null;

	try {
		const data = JSON.parse(payload);
		// Check expiry (7 days)
		if (Date.now() - data.iat > COOKIE_MAX_AGE * 1000) return null;
		return { email: data.email, name: data.name };
	} catch {
		return null;
	}
}
