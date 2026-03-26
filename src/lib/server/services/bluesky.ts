import { BskyAgent, RichText } from '@atproto/api';

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

	return { text: `${changeDesc} in "${input.articleTitle}" (${input.feedName})\n${stats}\n\n${input.articleUrl}` };
}

export async function postToBluesky(params: {
	handle: string;
	password: string;
	text: string;
	imageBuffer?: Buffer;
	imageAltText?: string;
	replyTo?: { uri: string; cid: string };
	rootRef?: { uri: string; cid: string };
}): Promise<{ uri: string; cid: string }> {
	const agent = new BskyAgent({ service: 'https://bsky.social' });
	await agent.login({ identifier: params.handle, password: params.password });

	const rt = new RichText({ text: params.text });
	await rt.detectFacets(agent);

	let embed: any = undefined;
	if (params.imageBuffer) {
		const upload = await agent.uploadBlob(params.imageBuffer, { encoding: 'image/png' });
		embed = {
			$type: 'app.bsky.embed.images',
			images: [{
				alt: params.imageAltText || '',
				image: upload.data.blob,
				aspectRatio: { width: 800, height: 418 }
			}]
		};
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
		embed,
		reply
	});

	return { uri: response.uri, cid: response.cid };
}
