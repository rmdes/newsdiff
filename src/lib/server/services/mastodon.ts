import { createRestAPIClient } from 'masto';

export function isMastodonConfigured(instance?: string, token?: string): boolean {
	return Boolean(instance && token);
}

interface StatusInput {
	isRoot: boolean;
	articleUrl: string;
	articleTitle: string;
	feedName: string;
	titleChanged?: boolean;
	contentChanged?: boolean;
	charsAdded?: number;
	charsRemoved?: number;
}

export function buildMastodonStatus(input: StatusInput): string {
	if (input.isRoot) {
		return `Tracking: ${input.articleTitle}\n\n${input.articleUrl}`;
	}

	const changes: string[] = [];
	if (input.titleChanged) changes.push('Headline changed');
	if (input.contentChanged) changes.push('Content changed');

	const changeDesc = changes.join(' & ') || 'Article updated';
	const stats = `+${input.charsAdded ?? 0} / -${input.charsRemoved ?? 0} chars`;

	return `${changeDesc} in "${input.articleTitle}" (${input.feedName})\n${stats}\n\n${input.articleUrl}`;
}

export async function postToMastodon(params: {
	instance: string;
	accessToken: string;
	status: string;
	imageBuffer?: Buffer;
	imageAltText?: string;
	inReplyToId?: string;
}): Promise<{ id: string; url: string }> {
	const client = createRestAPIClient({
		url: params.instance,
		accessToken: params.accessToken
	});

	let mediaIds: string[] = [];
	if (params.imageBuffer) {
		const blob = new Blob([params.imageBuffer], { type: 'image/png' });
		const file = new File([blob], 'diff.png', { type: 'image/png' });
		const media = await client.v2.media.create({ file, description: params.imageAltText || '' });
		mediaIds = [media.id];
	}

	const post = await client.v1.statuses.create({
		status: params.status,
		mediaIds,
		inReplyToId: params.inReplyToId,
		visibility: 'public'
	});

	return { id: post.id, url: post.url || '' };
}
