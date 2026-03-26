const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface CheckInterval {
	maxAge: number;
	minInterval: number;
}

const INTERVALS: CheckInterval[] = [
	{ maxAge: 3 * HOUR, minInterval: 0 },
	{ maxAge: 24 * HOUR, minInterval: 30 * MINUTE },
	{ maxAge: 7 * DAY, minInterval: 3 * HOUR },
	{ maxAge: 30 * DAY, minInterval: 12 * HOUR }
];

export function shouldCheckArticle(
	firstSeenAt: Date,
	lastCheckedAt: Date | null,
	now: Date = new Date()
): boolean {
	if (!lastCheckedAt) return true;

	const age = now.getTime() - firstSeenAt.getTime();
	const sinceLastCheck = now.getTime() - lastCheckedAt.getTime();

	for (const interval of INTERVALS) {
		if (age < interval.maxAge) {
			return sinceLastCheck >= interval.minInterval;
		}
	}

	return false; // > 30 days: stop checking
}
