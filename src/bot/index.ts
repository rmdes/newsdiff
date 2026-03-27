import { createBot, text, link, Image, parseSemVer, type Session } from "@fedify/botkit";
import { Update } from "@fedify/vocab";
import { RedisKvStore, RedisMessageQueue } from "@fedify/redis";
import Redis from "ioredis";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Lazy-initialized bot instance (avoid connecting to Redis at import time)
let _bot: ReturnType<typeof createBot<void>> | undefined;
let _botFetch: ((request: Request) => Promise<Response>) | undefined;

function getRedis(): Redis {
	return new Redis({
		host: process.env.REDIS_HOST || 'localhost',
		port: Number(process.env.REDIS_PORT) || 6379,
		password: process.env.REDIS_PASSWORD || undefined
	});
}

interface BotProfileField {
	name: string;
	value: string;
}

interface BotProfile {
	username: string;
	displayName: string;
	summary: string;
	avatarUrl: string;
	headerUrl: string;
	fields: BotProfileField[];
}

function loadProfileSync(): BotProfile {
	const configDir = process.env.BOT_CONFIG_DIR || '/app/data/config';
	const defaults: BotProfile = {
		username: process.env.BOT_USERNAME || 'bot',
		displayName: process.env.BOT_NAME || 'NewsDiff Bot',
		summary: 'I track changes in news articles and post the diffs. Follow me to see when headlines and content get edited after publication.',
		avatarUrl: '',
		headerUrl: '',
		fields: []
	};

	try {
		const data = readFileSync(join(configDir, 'bot-profile.json'), 'utf-8');
		return { ...defaults, ...JSON.parse(data) };
	} catch {
		return defaults;
	}
}

function getBot() {
	if (_bot) return _bot;

	const profile = loadProfileSync();
	const origin = process.env.BOT_ORIGIN || process.env.ORIGIN || "https://localhost";

	// Build properties from profile fields
	const properties: Record<string, ReturnType<typeof text> | ReturnType<typeof link>> = {};
	for (const field of profile.fields) {
		if (!field.name || !field.value) continue;
		// If the value looks like a URL, use link(); otherwise use text``
		try {
			new URL(field.value);
			properties[field.name] = link(field.value);
		} catch {
			properties[field.name] = text`${field.value}`;
		}
	}

	// Add default Website field if not in profile fields
	if (!properties['Website'] && origin) {
		properties['Website'] = link(origin);
	}

	_bot = createBot<void>({
		username: profile.username,
		name: profile.displayName,
		summary: text`${profile.summary}`,
		icon: profile.avatarUrl ? new URL(profile.avatarUrl) : undefined,
		image: profile.headerUrl ? new URL(profile.headerUrl) : undefined,
		properties,
		software: {
			name: "newsdiff",
			version: parseSemVer("0.1.0"),
			homepage: new URL(origin),
		},
		pages: {
			color: "blue",
		},
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

// Force bot to reload profile from disk and broadcast update to followers
export async function reloadBotProfile(): Promise<void> {
	_bot = undefined; // Force re-creation on next getBot() call
	_botFetch = undefined;
	const bot = getBot();
	const origin = process.env.BOT_ORIGIN || process.env.ORIGIN || "https://localhost";
	const username = loadProfileSync().username;

	// Broadcast Update activity to all followers so they refresh the profile
	try {
		const ctx = bot.federation.createContext(
			new Request(origin),
			undefined
		);
		const actorUri = ctx.getActorUri(username);

		await ctx.sendActivity(
			{ identifier: username },
			"followers",
			new Update({
				id: new URL(`${actorUri.href}#profile-update-${Date.now()}`),
				actor: actorUri,
				object: actorUri,
			}),
			{ preferSharedInbox: true }
		);
		console.log('Bot profile reloaded and Update broadcast to followers');
	} catch (err: any) {
		console.error('Bot profile reloaded but broadcast failed:', err.message);
	}
}

// Get a session for publishing
export function getBotSession(): Session<void> {
	const origin = process.env.BOT_ORIGIN || process.env.ORIGIN || "https://localhost";
	return getBot().getSession(origin);
}

// Find a published message by its URI in the bot's outbox
async function findOutboxMessage(session: Session<void>, uri: string) {
	for await (const msg of session.getOutbox()) {
		if (msg.id?.href === uri) return msg;
	}
	return undefined;
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
	diffPageUrl: string;
	archiveUrl?: string;
	replyToId?: string;
}): Promise<{ id: string }> {
	const session = getBotSession();

	const changes: string[] = [];
	if (params.titleChanged) changes.push("headline");
	if (params.contentChanged) changes.push("content");
	const changeDesc = changes.join(" & ") || "article";

	const stats = `+${params.charsAdded} / -${params.charsRemoved} chars`;

	const links = [
		link("View diff", params.diffPageUrl),
		link("Original", params.articleUrl),
		params.archiveUrl ? link("Archived", params.archiveUrl) : null
	].filter(Boolean);

	const messageText = text`${changeDesc.charAt(0).toUpperCase() + changeDesc.slice(1)} changed in "${params.articleTitle}" (${params.feedName})

${stats}

${links[0]}${links[1] ? text` · ${links[1]}` : text``}${links[2] ? text` · ${links[2]}` : text``}`;

	const attachments = [
		new Image({
			mediaType: "image/png",
			url: new URL(params.imageUrl),
			name: `Diff showing ${changeDesc} changes in "${params.articleTitle}"`,
			width: 800,
			height: 418
		})
	];

	const publishOptions = { attachments, visibility: "public" as const };

	let message;
	if (params.replyToId) {
		const parent = await findOutboxMessage(session, params.replyToId);
		if (parent) {
			message = await parent.reply(messageText, publishOptions);
			console.log(`ActivityPub: replied to ${params.replyToId}`);
		}
	}

	// Fallback: publish as root post if no parent found
	if (!message) {
		message = await session.publish(messageText, publishOptions);
	}

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
