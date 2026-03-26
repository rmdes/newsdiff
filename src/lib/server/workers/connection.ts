import type { ConnectionOptions } from 'bullmq';

let connectionOptions: ConnectionOptions | undefined;

export function getRedisConnection(): ConnectionOptions {
	if (connectionOptions) return connectionOptions;

	const redisUrl = process.env.REDIS_URL;
	if (!redisUrl) {
		throw new Error('REDIS_URL environment variable is required');
	}

	const url = new URL(redisUrl);
	connectionOptions = {
		host: url.hostname,
		port: Number(url.port) || 6379,
		password: url.password || undefined
	};

	return connectionOptions;
}
