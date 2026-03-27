import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { getRedisConnection } from '$lib/server/workers/connection';

export const GET: RequestHandler = async () => {
	const checks: Record<string, boolean> = { database: false, redis: false };

	try {
		await db.execute(sql`SELECT 1`);
		checks.database = true;
	} catch {}

	try {
		const redis = getRedisConnection();
		await redis.ping();
		checks.redis = true;
	} catch {}

	const healthy = checks.database && checks.redis;
	return new Response(JSON.stringify(checks), {
		status: healthy ? 200 : 503,
		headers: { 'Content-Type': 'application/json' }
	});
};
