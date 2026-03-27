const USER_AGENT = 'NewsDiff/0.1 (+https://github.com/rmdes/newsdiff; article archiver)';

/**
 * Check if Internet Archive credentials are configured.
 * Without credentials, archiving is silently disabled.
 */
export function isArchiveEnabled(): boolean {
	return Boolean(process.env.ARCHIVE_ORG_ACCESS && process.env.ARCHIVE_ORG_SECRET);
}

/**
 * Submit a URL to the Wayback Machine via SPN2 API and return the archive URL.
 * Requires ARCHIVE_ORG_ACCESS and ARCHIVE_ORG_SECRET env vars (S3-like API keys
 * from https://archive.org/account/s3.php).
 *
 * Returns null if archiving is disabled, fails, or the job hasn't completed yet.
 * The SPN2 API is async — we submit and poll once. If the snapshot isn't ready
 * within the timeout, we return null (the URL can be retried later).
 */
export async function archiveUrl(url: string): Promise<string | null> {
	if (!isArchiveEnabled()) return null;

	const access = process.env.ARCHIVE_ORG_ACCESS!;
	const secret = process.env.ARCHIVE_ORG_SECRET!;
	const auth = `LOW ${access}:${secret}`;

	try {
		// Submit the save request
		const submitRes = await fetch('https://web.archive.org/save', {
			method: 'POST',
			headers: {
				'User-Agent': USER_AGENT,
				'Authorization': auth,
				'Accept': 'application/json',
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: `url=${encodeURIComponent(url)}`,
			signal: AbortSignal.timeout(30000)
		});

		if (!submitRes.ok) {
			const body = await submitRes.text().catch(() => '');
			console.warn(`Archive.org: submit failed for ${url} (${submitRes.status}): ${body.slice(0, 200)}`);
			return null;
		}

		const submitData = await submitRes.json() as { job_id?: string; url?: string; status?: string };

		// Some responses return the archive URL directly
		if (submitData.url && submitData.url.includes('web.archive.org')) {
			console.log(`Archived ${url} → ${submitData.url}`);
			return submitData.url;
		}

		// Otherwise we get a job_id to poll
		if (!submitData.job_id) {
			console.warn(`Archive.org: no job_id returned for ${url}`);
			return null;
		}

		// Poll for completion (wait up to 30 seconds with 3 attempts)
		for (let attempt = 0; attempt < 3; attempt++) {
			await new Promise(r => setTimeout(r, 10000)); // wait 10s between polls

			const statusRes = await fetch(`https://web.archive.org/save/status/${submitData.job_id}`, {
				headers: {
					'User-Agent': USER_AGENT,
					'Authorization': auth,
					'Accept': 'application/json'
				},
				signal: AbortSignal.timeout(15000)
			});

			if (!statusRes.ok) continue;

			const status = await statusRes.json() as {
				status?: string;
				timestamp?: string;
				original_url?: string;
			};

			if (status.status === 'success' && status.timestamp && status.original_url) {
				const archiveUrl = `https://web.archive.org/web/${status.timestamp}/${status.original_url}`;
				console.log(`Archived ${url} → ${archiveUrl}`);
				return archiveUrl;
			}

			if (status.status === 'error') {
				console.warn(`Archive.org: job failed for ${url}`);
				return null;
			}

			// status is 'pending' — keep polling
		}

		console.warn(`Archive.org: job timed out for ${url} (job_id: ${submitData.job_id})`);
		return null;
	} catch (err: any) {
		console.warn(`Archive.org: failed to archive ${url}: ${err.message}`);
		return null;
	}
}
