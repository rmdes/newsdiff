import { describe, it, expect, vi } from 'vitest';
import { subscribeToHub } from './websub';

describe('subscribeToHub', () => {
	it('sends correct subscription parameters', async () => {
		const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
		vi.stubGlobal('fetch', fetchSpy);

		const result = await subscribeToHub({
			hubUrl: 'https://hub.example.com/hub',
			feedUrl: 'https://example.com/feed.xml',
			callbackUrl: 'https://diff.example.com/api/websub/1'
		});

		expect(result.secret).toHaveLength(64); // 32 bytes hex
		expect(fetchSpy).toHaveBeenCalledOnce();

		const [url, opts] = fetchSpy.mock.calls[0];
		expect(url).toBe('https://hub.example.com/hub');
		expect(opts.method).toBe('POST');

		const body = opts.body;
		expect(body).toContain('hub.mode=subscribe');
		expect(body).toContain('hub.topic=');
		expect(body).toContain('hub.callback=');
		expect(body).toContain('hub.secret=');

		vi.unstubAllGlobals();
	});

	it('throws on non-202/204 response', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('error', { status: 400 })));

		await expect(subscribeToHub({
			hubUrl: 'https://hub.example.com/hub',
			feedUrl: 'https://example.com/feed.xml',
			callbackUrl: 'https://diff.example.com/api/websub/1'
		})).rejects.toThrow('Hub subscription failed');

		vi.unstubAllGlobals();
	});

	it('accepts 204 No Content', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

		const result = await subscribeToHub({
			hubUrl: 'https://hub.example.com/hub',
			feedUrl: 'https://example.com/feed.xml',
			callbackUrl: 'https://diff.example.com/api/websub/1'
		});

		expect(result.secret).toBeTruthy();
		vi.unstubAllGlobals();
	});
});
