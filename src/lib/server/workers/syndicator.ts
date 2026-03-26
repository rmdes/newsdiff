import { Worker, type Job } from 'bullmq';
import { getRedisConnection } from './connection';
import { db } from '../db';
import { diffs, socialPosts } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateDiffCard, generateAltText } from '../services/card-generator';
import { postToBluesky, buildBlueskyPost, isBlueskyConfigured } from '../services/bluesky';
import { postToMastodon, buildMastodonStatus, isMastodonConfigured } from '../services/mastodon';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export interface SyndicateJobData {
	diffId: number;
}

const IMAGE_DIR = process.env.IMAGE_DIR || './images';

async function syndicate(job: Job<SyndicateJobData>) {
	const diff = await db.query.diffs.findFirst({
		where: eq(diffs.id, job.data.diffId),
		with: {
			article: { with: { feed: true } },
			oldVersion: true,
			newVersion: true
		}
	});

	if (!diff || diff.isBoring) return;

	const cardData = {
		feedName: diff.article.feed.name,
		articleTitle: diff.newVersion.title || diff.oldVersion.title || 'Untitled',
		titleChanged: diff.titleChanged,
		contentChanged: diff.contentChanged,
		charsAdded: diff.charsAdded,
		charsRemoved: diff.charsRemoved,
		oldTitle: diff.titleChanged ? (diff.oldVersion.title || undefined) : undefined,
		newTitle: diff.titleChanged ? (diff.newVersion.title || undefined) : undefined
	};

	const imageBuffer = await generateDiffCard(cardData);
	const altText = generateAltText(cardData);

	await mkdir(IMAGE_DIR, { recursive: true });
	const imagePath = join(IMAGE_DIR, `diff-${diff.id}.png`);
	await writeFile(imagePath, imageBuffer);

	// Find existing thread references for this article
	const existingBskyPosts = await db
		.select()
		.from(socialPosts)
		.innerJoin(diffs, eq(socialPosts.diffId, diffs.id))
		.where(eq(diffs.articleId, diff.articleId));

	// Bluesky
	const bskyHandle = process.env.BLUESKY_HANDLE;
	const bskyPassword = process.env.BLUESKY_PASSWORD;

	if (isBlueskyConfigured(bskyHandle, bskyPassword)) {
		try {
			const bskyThread = existingBskyPosts.find(
				(p) => p.social_posts.platform === 'bluesky' && p.social_posts.threadRootUri
			);

			let rootRef: { uri: string; cid: string } | undefined;
			let parentRef: { uri: string; cid: string } | undefined;

			if (!bskyThread) {
				const rootPost = buildBlueskyPost({
					isRoot: true, articleUrl: diff.article.url,
					articleTitle: cardData.articleTitle, feedName: diff.article.feed.name
				});
				const root = await postToBluesky({
					handle: bskyHandle!, password: bskyPassword!, text: rootPost.text
				});
				rootRef = root;
				parentRef = root;
			} else {
				const latest = existingBskyPosts
					.filter((p) => p.social_posts.platform === 'bluesky')
					.pop();
				if (latest?.social_posts.postUri) {
					const [uri, cid] = latest.social_posts.postUri.split('|');
					const [rootUri, rootCid] = (latest.social_posts.threadRootUri || '').split('|');
					parentRef = { uri, cid };
					rootRef = { uri: rootUri, cid: rootCid };
				}
			}

			const replyPost = buildBlueskyPost({
				isRoot: false, articleUrl: diff.article.url,
				articleTitle: cardData.articleTitle, feedName: diff.article.feed.name,
				titleChanged: diff.titleChanged, contentChanged: diff.contentChanged,
				charsAdded: diff.charsAdded, charsRemoved: diff.charsRemoved
			});

			const result = await postToBluesky({
				handle: bskyHandle!, password: bskyPassword!, text: replyPost.text,
				imageBuffer, imageAltText: altText, replyTo: parentRef, rootRef
			});

			await db.insert(socialPosts).values({
				diffId: diff.id, platform: 'bluesky',
				postUri: `${result.uri}|${result.cid}`,
				threadRootUri: rootRef ? `${rootRef.uri}|${rootRef.cid}` : `${result.uri}|${result.cid}`,
				imagePath, postedAt: new Date()
			});
		} catch (err: any) {
			await db.insert(socialPosts).values({
				diffId: diff.id, platform: 'bluesky', imagePath, error: err.message
			});
		}
	}

	// Mastodon
	const mastoInstance = process.env.MASTODON_INSTANCE;
	const mastoToken = process.env.MASTODON_ACCESS_TOKEN;

	if (isMastodonConfigured(mastoInstance, mastoToken)) {
		try {
			const mastoThread = existingBskyPosts.find(
				(p) => p.social_posts.platform === 'mastodon' && p.social_posts.threadRootUri
			);

			let replyToId: string | undefined;
			let threadRootId: string | undefined;

			if (!mastoThread) {
				const rootStatus = buildMastodonStatus({
					isRoot: true, articleUrl: diff.article.url,
					articleTitle: cardData.articleTitle, feedName: diff.article.feed.name
				});
				const root = await postToMastodon({
					instance: mastoInstance!, accessToken: mastoToken!, status: rootStatus
				});
				replyToId = root.id;
				threadRootId = root.id;
			} else {
				const latest = existingBskyPosts
					.filter((p) => p.social_posts.platform === 'mastodon')
					.pop();
				replyToId = latest?.social_posts.postUri || undefined;
				threadRootId = latest?.social_posts.threadRootUri || undefined;
			}

			const replyStatus = buildMastodonStatus({
				isRoot: false, articleUrl: diff.article.url,
				articleTitle: cardData.articleTitle, feedName: diff.article.feed.name,
				titleChanged: diff.titleChanged, contentChanged: diff.contentChanged,
				charsAdded: diff.charsAdded, charsRemoved: diff.charsRemoved
			});

			const result = await postToMastodon({
				instance: mastoInstance!, accessToken: mastoToken!,
				status: replyStatus, imageBuffer, imageAltText: altText, inReplyToId: replyToId
			});

			await db.insert(socialPosts).values({
				diffId: diff.id, platform: 'mastodon',
				postUri: result.id, threadRootUri: threadRootId || result.id,
				imagePath, postedAt: new Date()
			});
		} catch (err: any) {
			await db.insert(socialPosts).values({
				diffId: diff.id, platform: 'mastodon', imagePath, error: err.message
			});
		}
	}
}

export function createSyndicatorWorker() {
	const worker = new Worker<SyndicateJobData>('syndicate', syndicate, {
		connection: getRedisConnection(),
		concurrency: 1
	});

	worker.on('failed', (job, err) => {
		console.error(`Syndication job ${job?.id} failed:`, err.message);
	});

	return worker;
}
