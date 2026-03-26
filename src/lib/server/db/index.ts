import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getDb() {
	if (_db) return _db;

	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error('DATABASE_URL environment variable is required');
	}

	const client = postgres(connectionString);
	_db = drizzle(client, { schema });
	return _db;
}

// Re-export as a proxy getter for backward compatibility
// This allows `import { db } from './db'` to work at runtime
// while not throwing during build-time analysis
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
	get(_target, prop) {
		return (getDb() as any)[prop];
	}
});
