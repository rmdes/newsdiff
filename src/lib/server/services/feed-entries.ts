import type { FeedEntry } from './feed-builder';

/**
 * Convert a diff record (with relations) to a feed entry.
 */
export function diffToFeedEntry(diff: any, origin: string): FeedEntry {
	const title = diff.newVersion?.title || diff.oldVersion?.title || 'Untitled';
	const feedName = diff.article?.feed?.name || '';
	const changes = [
		diff.titleChanged ? 'headline' : '',
		diff.contentChanged ? 'content' : ''
	].filter(Boolean).join(' & ');
	const changeDesc = changes ? `${changes.charAt(0).toUpperCase() + changes.slice(1)} changed` : 'Updated';

	return {
		id: `${origin}/diff/${diff.id}`,
		title: `${changeDesc}: ${title}`,
		link: `${origin}/diff/${diff.id}`,
		updated: new Date(diff.createdAt).toISOString(),
		summary: `${changeDesc} in "${title}" (${feedName}). +${diff.charsAdded} / -${diff.charsRemoved} chars.`
	};
}
