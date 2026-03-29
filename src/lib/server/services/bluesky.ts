import { BskyAgent, RichText } from '@atproto/api';

/**
 * Resolve the PDS endpoint for a Bluesky handle.
 * Falls back to bsky.social if resolution fails.
 */
async function resolvePds(handle: string): Promise<string> {
	try {
		const res = await fetch(`https://bsky.social/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`, {
			signal: AbortSignal.timeout(10000)
		});
		if (!res.ok) return 'https://bsky.social';
		const { did } = await res.json() as { did: string };

		const plcRes = await fetch(`https://plc.directory/${did}`, {
			signal: AbortSignal.timeout(10000)
		});
		if (!plcRes.ok) return 'https://bsky.social';
		const doc = await plcRes.json() as { service?: Array<{ id: string; serviceEndpoint: string }> };
		const pds = doc.service?.find(s => s.id === '#atproto_pds');
		return pds?.serviceEndpoint || 'https://bsky.social';
	} catch {
		return 'https://bsky.social';
	}
}

export function isBlueskyConfigured(handle?: string, password?: string): boolean {
	return Boolean(handle && password);
}

interface PostInput {
	isRoot: boolean;
	articleUrl: string;
	articleTitle: string;
	feedName: string;
	titleChanged?: boolean;
	contentChanged?: boolean;
	charsAdded?: number;
	charsRemoved?: number;
	diffPageUrl?: string;
	archiveUrl?: string;
}

export function buildBlueskyPost(input: PostInput): { text: string } {
	if (input.isRoot) {
		return { text: `Tracking: ${input.articleTitle}\n\n${input.articleUrl}` };
	}

	const changes: string[] = [];
	if (input.titleChanged) changes.push('Headline changed');
	if (input.contentChanged) changes.push('Content changed');

	const changeDesc = changes.join(' & ') || 'Article updated';
	const stats = `+${input.charsAdded ?? 0} / -${input.charsRemoved ?? 0} chars`;

	const linkLines = [input.diffPageUrl, input.articleUrl, input.archiveUrl].filter(Boolean);

	return { text: `${changeDesc} in "${input.articleTitle}" (${input.feedName})\n${stats}\n\n${linkLines.join('\n')}` };
}

export interface BlueskyEmbed {
	type: 'image' | 'external';
	imageBuffer?: Buffer;
	imageAlt?: string;
	uri?: string;
	title?: string;
	description?: string;
}

export async function postToBluesky(params: {
	handle: string;
	password: string;
	text: string;
	embed?: BlueskyEmbed;
	replyTo?: { uri: string; cid: string };
	rootRef?: { uri: string; cid: string };
}): Promise<{ uri: string; cid: string }> {
	// Resolve the PDS from the handle (supports custom PDS like eurosky.social)
	const service = process.env.BLUESKY_PDS || await resolvePds(params.handle);
	const agent = new BskyAgent({ service });
	await agent.login({ identifier: params.handle, password: params.password });

	const rt = new RichText({ text: params.text });
	await rt.detectFacets(agent);

	let embedData: any = undefined;

	if (params.embed) {
		// Upload image blob if provided (used as full image or link card thumbnail)
		let uploadedBlob: any = undefined;
		if (params.embed.imageBuffer) {
			const upload = await agent.uploadBlob(params.embed.imageBuffer, { encoding: 'image/png' });
			uploadedBlob = upload.data.blob;
		}

		if (params.embed.type === 'image') {
			// Full-size image embed with alt text
			embedData = {
				$type: 'app.bsky.embed.images',
				images: [{
					image: uploadedBlob,
					alt: params.embed.imageAlt || '',
					aspectRatio: { width: 800, height: 418 }
				}]
			};
		} else {
			// Link card embed with optional thumbnail
			embedData = {
				$type: 'app.bsky.embed.external',
				external: {
					uri: params.embed.uri || '',
					title: params.embed.title || '',
					description: params.embed.description || '',
					thumb: uploadedBlob
				}
			};
		}
	}

	let reply: any = undefined;
	if (params.replyTo && params.rootRef) {
		reply = {
			root: { uri: params.rootRef.uri, cid: params.rootRef.cid },
			parent: { uri: params.replyTo.uri, cid: params.replyTo.cid }
		};
	}

	const response = await agent.post({
		text: rt.text,
		facets: rt.facets,
		embed: embedData,
		reply
	});

	return { uri: response.uri, cid: response.cid };
}
