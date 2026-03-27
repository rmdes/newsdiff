const USER_AGENT = 'NewsDiff/0.1 (+https://github.com/rmdes/newsdiff; article archiver)';

/**
 * Submit a URL to the Wayback Machine and return the archive URL.
 * Returns null if archiving fails (non-blocking).
 */
export async function archiveUrl(url: string): Promise<string | null> {
	try {
		const response = await fetch(`https://web.archive.org/save/${url}`, {
			method: 'POST',
			headers: { 'User-Agent': USER_AGENT },
			signal: AbortSignal.timeout(30000)
		});

		// archive.org returns the archive path in Content-Location header
		const location = response.headers.get('Content-Location');
		if (location) {
			return `https://web.archive.org${location}`;
		}

		// Some responses redirect to the archived page
		if (response.status >= 300 && response.status < 400) {
			const redirect = response.headers.get('Location');
			if (redirect?.includes('web.archive.org')) return redirect;
		}

		console.warn(`Archive.org: no archive URL returned for ${url} (status ${response.status})`);
		return null;
	} catch (err: any) {
		console.warn(`Archive.org: failed to archive ${url}: ${err.message}`);
		return null;
	}
}
