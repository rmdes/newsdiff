import { createQueues } from './queues';
import { createFeedPollerWorker } from './feed-poller';
import { createSyndicatorWorker } from './syndicator';
import { db } from '../db';
import { feeds } from '../db/schema';
import { eq } from 'drizzle-orm';

let initialized = false;

export async function startWorkers() {
	if (initialized) return;
	initialized = true;

	const { feedPollQueue } = createQueues();
	createFeedPollerWorker();
	createSyndicatorWorker();

	const activeFeeds = await db.select().from(feeds).where(eq(feeds.isActive, true));

	for (const feed of activeFeeds) {
		await feedPollQueue.upsertJobScheduler(
			`poll-feed-${feed.id}`,
			{ every: feed.checkInterval * 60 * 1000 },
			{
				name: `poll-feed-${feed.id}`,
				data: { feedId: feed.id, feedUrl: feed.url }
			}
		);
	}

	console.log(`Started feed poller with ${activeFeeds.length} active feeds`);
}

export async function scheduleFeed(feedId: number, feedUrl: string, checkInterval: number) {
	const { feedPollQueue } = createQueues();
	await feedPollQueue.upsertJobScheduler(
		`poll-feed-${feedId}`,
		{ every: checkInterval * 60 * 1000 },
		{
			name: `poll-feed-${feedId}`,
			data: { feedId, feedUrl }
		}
	);
	// Also trigger an immediate poll
	await feedPollQueue.add(`poll-feed-${feedId}-immediate`, { feedId, feedUrl });
}

export async function unscheduleFeed(feedId: number) {
	const { feedPollQueue } = createQueues();
	await feedPollQueue.removeJobScheduler(`poll-feed-${feedId}`);
}
