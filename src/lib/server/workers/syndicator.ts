import { Worker, type Job } from 'bullmq';
import { getRedisConnection } from './connection';
import { db } from '../db';
import { diffs, socialPosts } from '../db/schema';
import { eq } from 'drizzle-orm';
import { generateDiffCard, generateAltText } from '../services/card-generator';
import { postToBluesky, buildBlueskyPost, isBlueskyConfigured, type BlueskyEmbed } from '../services/bluesky';
import { publishDiff as publishApDiff } from '../../../bot/index';
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
		newTitle: diff.titleChanged ? (diff.newVersion.title || undefined) : undefined,
		diffHtml: diff.diffHtml
	};

	const imageBuffer = await generateDiffCard(cardData);
	const altText = generateAltText(cardData);

	await mkdir(IMAGE_DIR, { recursive: true });
	const imagePath = join(IMAGE_DIR, `diff-${diff.id}.png`);
	await writeFile(imagePath, imageBuffer);

	// Build the public image URL for ActivityPub (needs full URL, not blob)
	const origin = process.env.ORIGIN || process.env.BOT_ORIGIN || '';
	const imageUrl = `${origin}/api/diff/${diff.id}/image.png`;

	// Find existing thread references for this article
	const existingPosts = await db
		.select()
		.from(socialPosts)
		.innerJoin(diffs, eq(socialPosts.diffId, diffs.id))
		.where(eq(diffs.articleId, diff.articleId));

	// ── Bluesky ──
	const bskyHandle = process.env.BLUESKY_HANDLE;
	const bskyPassword = process.env.BLUESKY_PASSWORD;

	if (isBlueskyConfigured(bskyHandle, bskyPassword)) {
		try {
			const bskyThread = existingPosts.find(
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
				const latest = existingPosts
					.filter((p) => p.social_posts.platform === 'bluesky')
					.pop();
				if (latest?.social_posts.postUri) {
					const [uri, cid] = latest.social_posts.postUri.split('|');
					const [rootUri, rootCid] = (latest.social_posts.threadRootUri || '').split('|');
					parentRef = { uri, cid };
					rootRef = { uri: rootUri, cid: rootCid };
				}
			}

			const diffPageUrl = `${origin}/diff/${diff.id}`;
			const replyPost = buildBlueskyPost({
				isRoot: false, articleUrl: diff.article.url,
				articleTitle: cardData.articleTitle, feedName: diff.article.feed.name,
				titleChanged: diff.titleChanged, contentChanged: diff.contentChanged,
				charsAdded: diff.charsAdded, charsRemoved: diff.charsRemoved,
				diffPageUrl
			});

			const embedType = (process.env.BLUESKY_EMBED_TYPE === 'card') ? 'external' as const : 'image' as const;
			const embed: BlueskyEmbed = embedType === 'image'
				? { type: 'image', imageBuffer, imageAlt: altText }
				: {
					type: 'external',
					uri: `${origin}/diff/${diff.id}`,
					title: replyPost.text.split('\n')[0],
					description: `+${diff.charsAdded} / -${diff.charsRemoved} chars — ${diff.article.feed.name}`,
					imageBuffer, imageAlt: altText
				};

			const result = await postToBluesky({
				handle: bskyHandle!, password: bskyPassword!, text: replyPost.text,
				embed, replyTo: parentRef, rootRef
			});

			await db.insert(socialPosts).values({
				diffId: diff.id, platform: 'bluesky',
				postUri: `${result.uri}|${result.cid}`,
				threadRootUri: rootRef ? `${rootRef.uri}|${rootRef.cid}` : `${result.uri}|${result.cid}`,
				imagePath, postedAt: new Date()
			});

			console.log(`Bluesky: posted diff ${diff.id} for "${cardData.articleTitle}"`);
		} catch (err: any) {
			console.error(`Bluesky post failed for diff ${diff.id}:`, err.message);
			await db.insert(socialPosts).values({
				diffId: diff.id, platform: 'bluesky', imagePath, error: err.message
			});
		}
	}

	// ── ActivityPub (Botkit) ──
	try {
		const apThread = existingPosts.find(
			(p) => p.social_posts.platform === 'activitypub' && p.social_posts.threadRootUri
		);

		const latest = existingPosts
			.filter((p) => p.social_posts.platform === 'activitypub')
			.pop();

		const result = await publishApDiff({
			articleTitle: cardData.articleTitle,
			articleUrl: diff.article.url,
			feedName: diff.article.feed.name,
			titleChanged: diff.titleChanged,
			contentChanged: diff.contentChanged,
			charsAdded: diff.charsAdded,
			charsRemoved: diff.charsRemoved,
			imageUrl,
			diffPageUrl: `${origin}/diff/${diff.id}`,
			replyToId: latest?.social_posts.postUri || undefined
		});

		await db.insert(socialPosts).values({
			diffId: diff.id,
			platform: 'activitypub',
			postUri: result.id,
			threadRootUri: apThread?.social_posts.threadRootUri || result.id,
			imagePath,
			postedAt: new Date()
		});

		console.log(`ActivityPub: posted diff ${diff.id} for "${cardData.articleTitle}"`);
	} catch (err: any) {
		console.error(`ActivityPub post failed for diff ${diff.id}:`, err.message);
		await db.insert(socialPosts).values({
			diffId: diff.id, platform: 'activitypub', imagePath, error: err.message
		});
	}
}

// Minimum gap between syndication posts (default: 5 minutes).
// Prevents flooding followers when many diffs arrive at once.
// Override with SYNDICATE_RATE_MS env var (milliseconds).
const SYNDICATE_RATE_MS = Number(process.env.SYNDICATE_RATE_MS) || 5 * 60 * 1000;

export function createSyndicatorWorker() {
	const worker = new Worker<SyndicateJobData>('syndicate', syndicate, {
		connection: getRedisConnection(),
		concurrency: 1,
		limiter: { max: 1, duration: SYNDICATE_RATE_MS }
	});

	worker.on('failed', (job, err) => {
		console.error(`Syndication job ${job?.id} failed:`, err.message);
	});

	return worker;
}
