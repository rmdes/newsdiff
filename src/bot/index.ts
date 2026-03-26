import { createBot, text, link, Image, type Session } from "@fedify/botkit";
import { RedisKvStore, RedisMessageQueue } from "@fedify/redis";
import Redis from "ioredis";
import { createServer } from "node:http";

// Lazy-initialized bot instance (avoid connecting to Redis at import time)
let _bot: ReturnType<typeof createBot<void>> | undefined;

function getRedis(): Redis {
	return new Redis({
		host: process.env.REDIS_HOST || 'localhost',
		port: Number(process.env.REDIS_PORT) || 6379,
		password: process.env.REDIS_PASSWORD || undefined
	});
}

function getBot() {
	if (_bot) return _bot;

	const BOT_USERNAME = process.env.BOT_USERNAME || "bot";
	const BOT_NAME = process.env.BOT_NAME || "NewsDiff Bot";
	const BOT_SUMMARY = "I track changes in news articles and post the diffs. Follow me to see when headlines and content get edited after publication.";

	_bot = createBot<void>({
		username: BOT_USERNAME,
		name: BOT_NAME,
		summary: text`${BOT_SUMMARY}`,
		kv: new RedisKvStore(getRedis()),
		queue: new RedisMessageQueue(() => getRedis()),
		behindProxy: true,
	});

	_bot.onMention = async (_session, message) => {
		await message.reply(
			text`Hi! I'm a bot that tracks news article edits. Follow me to see diffs in your feed.`
		);
	};

	return _bot;
}

// Get a session for publishing
export function getBotSession(): Session<void> {
	const origin = process.env.BOT_ORIGIN || process.env.ORIGIN || "https://localhost";
	return getBot().getSession(origin);
}

// Publish a diff to the fediverse
export async function publishDiff(params: {
	articleTitle: string;
	articleUrl: string;
	feedName: string;
	titleChanged: boolean;
	contentChanged: boolean;
	charsAdded: number;
	charsRemoved: number;
	imageUrl: string;
	replyToId?: string;
}): Promise<{ id: string }> {
	const session = getBotSession();

	const changes: string[] = [];
	if (params.titleChanged) changes.push("headline");
	if (params.contentChanged) changes.push("content");
	const changeDesc = changes.join(" & ") || "article";

	const stats = `+${params.charsAdded} / -${params.charsRemoved} chars`;

	const messageText = text`${changeDesc.charAt(0).toUpperCase() + changeDesc.slice(1)} changed in "${params.articleTitle}" (${params.feedName})

${stats}

${link(params.articleUrl, params.articleUrl)}`;

	const attachments = [
		new Image({
			mediaType: "image/png",
			url: new URL(params.imageUrl),
			name: `Diff showing ${changeDesc} changes in "${params.articleTitle}"`,
			width: 800,
			height: 418
		})
	];

	const message = await session.publish(messageText, {
		attachments,
		visibility: "public"
	});

	return { id: message.id!.href };
}

// Start the bot HTTP server (called from start.sh, not at import time)
export function startBotServer() {
	const bot = getBot();
	const BOT_PORT = Number(process.env.BOT_PORT) || 8001;
	const botFetch = bot.fetch;

	const server = createServer(async (req, res) => {
		const url = new URL(req.url || "/", `http://${req.headers.host}`);

		const headers = new Headers();
		for (const [key, value] of Object.entries(req.headers)) {
			if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
		}

		const request = new Request(url.toString(), {
			method: req.method,
			headers,
			body: req.method !== "GET" && req.method !== "HEAD"
				? await new Promise<Buffer>((resolve) => {
					const chunks: Buffer[] = [];
					req.on("data", (chunk: Buffer) => chunks.push(chunk));
					req.on("end", () => resolve(Buffer.concat(chunks)));
				})
				: undefined
		});

		try {
			const response = await botFetch(request);

			res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
			if (response.body) {
				const reader = response.body.getReader();
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					res.write(value);
				}
			}
			res.end();
		} catch (err) {
			console.error("Bot request error:", err);
			res.writeHead(500);
			res.end("Internal Server Error");
		}
	});

	server.listen(BOT_PORT, () => {
		console.log(`ActivityPub bot listening on port ${BOT_PORT}`);
	});
}

// If run directly (not imported), start the server
const isMainModule = process.argv[1]?.includes('bot/index');
if (isMainModule) {
	startBotServer();
}
