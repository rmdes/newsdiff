import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
	try {
		await db.execute(sql`SELECT 1`);
		return new Response(JSON.stringify({ status: 'ok', database: true }), {
			status: 200,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch {
		return new Response(JSON.stringify({ status: 'error', database: false }), {
			status: 503,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
