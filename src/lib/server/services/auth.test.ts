import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the env vars before importing
beforeEach(() => {
	vi.stubEnv('CLOUDRON_OIDC_CLIENT_SECRET', 'test-secret-for-testing');
});

import { createSessionCookie, parseSessionCookie, clearSessionCookie, isOidcEnabled } from '../auth';

describe('isOidcEnabled', () => {
	it('returns false when env vars are not set', () => {
		vi.stubEnv('CLOUDRON_OIDC_ISSUER', '');
		vi.stubEnv('CLOUDRON_OIDC_CLIENT_ID', '');
		expect(isOidcEnabled()).toBe(false);
	});

	it('returns true when both env vars are set', () => {
		vi.stubEnv('CLOUDRON_OIDC_ISSUER', 'https://auth.example.com');
		vi.stubEnv('CLOUDRON_OIDC_CLIENT_ID', 'client-123');
		expect(isOidcEnabled()).toBe(true);
	});
});

describe('session cookies', () => {
	it('creates and parses a valid session cookie', () => {
		const cookie = createSessionCookie({ email: 'test@example.com', name: 'Test User' });
		expect(cookie).toContain('newsdiff_session=');
		expect(cookie).toContain('HttpOnly');
		expect(cookie).toContain('SameSite=Lax');
		expect(cookie).toContain('Secure');

		const parsed = parseSessionCookie(cookie);
		expect(parsed).not.toBeNull();
		expect(parsed!.email).toBe('test@example.com');
		expect(parsed!.name).toBe('Test User');
	});

	it('returns null for missing cookie', () => {
		expect(parseSessionCookie(null)).toBeNull();
		expect(parseSessionCookie('')).toBeNull();
	});

	it('returns null for tampered cookie', () => {
		const cookie = createSessionCookie({ email: 'test@example.com', name: 'Test' });
		const tampered = cookie.replace(/\.[^;]+/, '.TAMPERED_SIGNATURE');
		expect(parseSessionCookie(tampered)).toBeNull();
	});

	it('returns null for expired cookie', () => {
		// Create a cookie with a very old iat
		const { createHmac } = require('node:crypto');
		const payload = JSON.stringify({ email: 'old@test.com', name: 'Old', iat: Date.now() - (8 * 24 * 60 * 60 * 1000) }); // 8 days ago
		const sig = createHmac('sha256', 'test-secret-for-testing').update(payload).digest('base64url');
		const value = `${Buffer.from(payload).toString('base64url')}.${sig}`;
		const cookie = `newsdiff_session=${value}`;
		expect(parseSessionCookie(cookie)).toBeNull();
	});

	it('clearSessionCookie sets Max-Age=0', () => {
		const clear = clearSessionCookie();
		expect(clear).toContain('Max-Age=0');
		expect(clear).toContain('newsdiff_session=');
	});
});
