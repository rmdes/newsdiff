import { randomBytes } from 'node:crypto';

const USER_AGENT = 'NewsDiff/0.1 (+https://github.com/rmdes/newsdiff; WebSub subscriber)';

/**
 * Subscribe to a WebSub hub for a feed.
 * Returns the secret used for HMAC verification of content delivery.
 */
export async function subscribeToHub(params: {
	hubUrl: string;
	feedUrl: string;
	callbackUrl: string;
	leaseSeconds?: number;
}): Promise<{ secret: string }> {
	const secret = randomBytes(32).toString('hex');

	const body = new URLSearchParams({
		'hub.mode': 'subscribe',
		'hub.topic': params.feedUrl,
		'hub.callback': params.callbackUrl,
		'hub.secret': secret,
		'hub.lease_seconds': String(params.leaseSeconds || 86400 * 10) // 10 days default
	});

	const response = await fetch(params.hubUrl, {
		method: 'POST',
		headers: {
			'User-Agent': USER_AGENT,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: body.toString(),
		signal: AbortSignal.timeout(15000)
	});

	// 202 Accepted means the hub will verify async
	// 204 No Content means immediate verification succeeded
	if (response.status !== 202 && response.status !== 204) {
		const text = await response.text().catch(() => '');
		throw new Error(`Hub subscription failed: ${response.status} ${text.slice(0, 200)}`);
	}

	console.log(`WebSub: subscription requested for ${params.feedUrl} via ${params.hubUrl}`);
	return { secret };
}

/**
 * Unsubscribe from a WebSub hub.
 */
export async function unsubscribeFromHub(params: {
	hubUrl: string;
	feedUrl: string;
	callbackUrl: string;
}): Promise<void> {
	const body = new URLSearchParams({
		'hub.mode': 'unsubscribe',
		'hub.topic': params.feedUrl,
		'hub.callback': params.callbackUrl
	});

	await fetch(params.hubUrl, {
		method: 'POST',
		headers: {
			'User-Agent': USER_AGENT,
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: body.toString(),
		signal: AbortSignal.timeout(15000)
	}).catch(() => {});
}
