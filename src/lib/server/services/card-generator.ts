import satori from 'satori';
import sharp from 'sharp';
import { readFileSync } from 'fs';

export interface DiffCardData {
	feedName: string;
	articleTitle: string;
	titleChanged: boolean;
	contentChanged: boolean;
	charsAdded: number;
	charsRemoved: number;
	oldTitle?: string;
	newTitle?: string;
	diffHtml?: string;
}

function loadFont(): { data: Buffer; name: string; weight: 400; style: 'normal' } {
	const fontPaths = [
		'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
		'/usr/share/fonts/google-carlito-fonts/Carlito-Regular.ttf',
		'/usr/share/fonts/liberation-fonts/LiberationSans-Regular.ttf',
		'/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',
	];
	for (const p of fontPaths) {
		try {
			const data = readFileSync(p);
			return { data, name: 'sans-serif', weight: 400, style: 'normal' };
		} catch {
			// try next
		}
	}
	throw new Error('No system font found for satori');
}

/**
 * Parse diff HTML (<ins>, <del>, plain text) into Satori-compatible elements.
 * Extracts a window of text around the first change for the card.
 */
function parseDiffToElements(diffHtml: string, maxLength: number = 600): any[] {
	// Strip the wrapper divs
	const html = diffHtml
		.replace(/<div class="diff-(?:title|content)">/g, '')
		.replace(/<\/div>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"');

	// Parse into segments: text, <ins>...</ins>, <del>...</del>
	const segments: { type: 'text' | 'ins' | 'del'; value: string }[] = [];
	const regex = /<(ins|del)>(.*?)<\/\1>/gs;
	let lastIndex = 0;

	for (const match of html.matchAll(regex)) {
		if (match.index! > lastIndex) {
			segments.push({ type: 'text', value: html.slice(lastIndex, match.index!) });
		}
		segments.push({ type: match[1] as 'ins' | 'del', value: match[2] });
		lastIndex = match.index! + match[0].length;
	}
	if (lastIndex < html.length) {
		segments.push({ type: 'text', value: html.slice(lastIndex) });
	}

	// Find the first change and build a window around it
	const firstChangeIdx = segments.findIndex(s => s.type !== 'text');
	if (firstChangeIdx === -1) return [{ type: 'span', props: { children: '(no visible changes)' } }];

	// Collect segments around the first change, respecting maxLength
	let totalLen = 0;
	const start = Math.max(0, firstChangeIdx - 1);
	const windowSegments: typeof segments = [];

	for (let i = start; i < segments.length && totalLen < maxLength; i++) {
		const remaining = maxLength - totalLen;
		const seg = { ...segments[i] };
		if (seg.value.length > remaining) {
			seg.value = seg.value.slice(0, remaining) + '...';
		}
		windowSegments.push(seg);
		totalLen += seg.value.length;
	}

	// If we skipped leading context, prepend ellipsis
	if (start > 0) {
		const leadText = segments[start - 1]?.value || '';
		const tail = leadText.slice(-80);
		if (tail) {
			windowSegments.unshift({ type: 'text', value: '...' + tail });
		}
	}

	return windowSegments.map((seg) => {
		if (seg.type === 'ins') {
			return {
				type: 'span',
				props: {
					style: {
						backgroundColor: '#d4edda',
						color: '#155724',
						padding: '1px 3px',
						borderRadius: '2px'
					},
					children: seg.value
				}
			};
		}
		if (seg.type === 'del') {
			return {
				type: 'span',
				props: {
					style: {
						backgroundColor: '#f8d7da',
						color: '#721c24',
						textDecoration: 'line-through',
						padding: '1px 3px',
						borderRadius: '2px'
					},
					children: seg.value
				}
			};
		}
		return { type: 'span', props: { children: seg.value } };
	});
}

export async function generateDiffCard(data: DiffCardData): Promise<Buffer> {
	const changeType = data.titleChanged && data.contentChanged
		? 'Headline & Content changed'
		: data.titleChanged
			? 'Headline changed'
			: 'Content changed';

	const children: any[] = [
		// Header row: feed name + change badge
		{
			type: 'div',
			props: {
				style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
				children: [
					{
						type: 'div',
						props: {
							style: { fontSize: '14px', color: '#666' },
							children: `${data.feedName} — NewsDiff`
						}
					},
					{
						type: 'div',
						props: {
							style: {
								padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '600',
								backgroundColor: data.titleChanged ? '#f8d7da' : '#d4edda',
								color: data.titleChanged ? '#721c24' : '#155724'
							},
							children: changeType
						}
					}
				]
			}
		},
		// Article title (smaller)
		{
			type: 'div',
			props: {
				style: { fontSize: '18px', fontWeight: 'bold', color: '#1a1a1a', marginBottom: '16px', lineHeight: 1.3 },
				children: data.articleTitle.length > 100
					? data.articleTitle.slice(0, 100) + '...'
					: data.articleTitle
			}
		}
	];

	// Title diff if changed
	if (data.titleChanged && data.oldTitle && data.newTitle) {
		children.push({
			type: 'div',
			props: {
				style: {
					display: 'flex', flexDirection: 'column',
					backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px',
					padding: '12px', marginBottom: '12px', fontSize: '14px', lineHeight: 1.5
				},
				children: [
					{
						type: 'div',
						props: {
							style: { color: '#721c24', textDecoration: 'line-through', marginBottom: '4px' },
							children: data.oldTitle.length > 120 ? data.oldTitle.slice(0, 120) + '...' : data.oldTitle
						}
					},
					{
						type: 'div',
						props: {
							style: { color: '#155724', fontWeight: 'bold' },
							children: data.newTitle.length > 120 ? data.newTitle.slice(0, 120) + '...' : data.newTitle
						}
					}
				]
			}
		});
	}

	// Content diff snippet
	if (data.diffHtml && data.contentChanged) {
		const diffElements = parseDiffToElements(data.diffHtml);
		children.push({
			type: 'div',
			props: {
				style: {
					display: 'flex', flexWrap: 'wrap',
					backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px',
					padding: '12px', fontSize: '13px', lineHeight: 1.6, color: '#333',
					overflow: 'hidden', flex: '1'
				},
				children: diffElements
			}
		});
	}

	// Footer: stats
	children.push({
		type: 'div',
		props: {
			style: { marginTop: 'auto', fontSize: '12px', color: '#999', paddingTop: '8px' },
			children: `+${data.charsAdded} chars added / -${data.charsRemoved} chars removed`
		}
	});

	const font = loadFont();

	const svg = await satori(
		{
			type: 'div',
			props: {
				style: {
					display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
					backgroundColor: '#fafafa', padding: '28px 32px', fontFamily: 'sans-serif'
				},
				children
			}
		},
		{ width: 800, height: 418, fonts: [font] }
	);

	return await sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Parse ALL diff segments (no truncation) for the full-page image.
 */
function parseDiffToFullElements(diffHtml: string): any[] {
	const html = diffHtml
		.replace(/<div class="diff-(?:title|content)">/g, '')
		.replace(/<\/div>/g, '')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"');

	const segments: { type: 'text' | 'ins' | 'del'; value: string }[] = [];
	const regex = /<(ins|del)>(.*?)<\/\1>/gs;
	let lastIndex = 0;

	for (const match of html.matchAll(regex)) {
		if (match.index! > lastIndex) {
			segments.push({ type: 'text', value: html.slice(lastIndex, match.index!) });
		}
		segments.push({ type: match[1] as 'ins' | 'del', value: match[2] });
		lastIndex = match.index! + match[0].length;
	}
	if (lastIndex < html.length) {
		segments.push({ type: 'text', value: html.slice(lastIndex) });
	}

	if (segments.length === 0) return [{ type: 'span', props: { children: '(no visible changes)' } }];

	return segments.map((seg) => {
		if (seg.type === 'ins') {
			return {
				type: 'span',
				props: {
					style: {
						backgroundColor: '#d4edda', color: '#155724',
						padding: '1px 3px', borderRadius: '2px'
					},
					children: seg.value
				}
			};
		}
		if (seg.type === 'del') {
			return {
				type: 'span',
				props: {
					style: {
						backgroundColor: '#f8d7da', color: '#721c24',
						textDecoration: 'line-through',
						padding: '1px 3px', borderRadius: '2px'
					},
					children: seg.value
				}
			};
		}
		return { type: 'span', props: { children: seg.value } };
	});
}

/**
 * Generate a full-height diff image showing the entire diff.
 * Width is fixed at 800px, height grows to fit all content.
 */
export async function generateFullDiffImage(data: DiffCardData): Promise<Buffer> {
	const changeType = data.titleChanged && data.contentChanged
		? 'Headline & Content changed'
		: data.titleChanged
			? 'Headline changed'
			: 'Content changed';

	const children: any[] = [
		// Header
		{
			type: 'div',
			props: {
				style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
				children: [
					{
						type: 'div',
						props: { style: { fontSize: '14px', color: '#666' }, children: `${data.feedName} — NewsDiff` }
					},
					{
						type: 'div',
						props: {
							style: {
								padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: '600',
								backgroundColor: data.titleChanged ? '#f8d7da' : '#d4edda',
								color: data.titleChanged ? '#721c24' : '#155724'
							},
							children: changeType
						}
					}
				]
			}
		},
		// Title
		{
			type: 'div',
			props: {
				style: { fontSize: '18px', fontWeight: 'bold', color: '#1a1a1a', marginBottom: '16px', lineHeight: 1.3 },
				children: data.articleTitle
			}
		}
	];

	// Title diff
	if (data.titleChanged && data.oldTitle && data.newTitle) {
		children.push({
			type: 'div',
			props: {
				style: {
					display: 'flex', flexDirection: 'column',
					backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px',
					padding: '12px', marginBottom: '12px', fontSize: '14px', lineHeight: 1.5
				},
				children: [
					{
						type: 'div',
						props: {
							style: { color: '#721c24', textDecoration: 'line-through', marginBottom: '4px' },
							children: data.oldTitle
						}
					},
					{
						type: 'div',
						props: {
							style: { color: '#155724', fontWeight: 'bold' },
							children: data.newTitle
						}
					}
				]
			}
		});
	}

	// Full content diff (no truncation)
	if (data.diffHtml && data.contentChanged) {
		const diffElements = parseDiffToFullElements(data.diffHtml);
		children.push({
			type: 'div',
			props: {
				style: {
					display: 'flex', flexWrap: 'wrap',
					backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '6px',
					padding: '12px', fontSize: '13px', lineHeight: 1.6, color: '#333'
				},
				children: diffElements
			}
		});
	}

	// Footer
	children.push({
		type: 'div',
		props: {
			style: { fontSize: '12px', color: '#999', paddingTop: '12px' },
			children: `+${data.charsAdded} chars added / -${data.charsRemoved} chars removed`
		}
	});

	const font = loadFont();

	// Estimate height: base padding + header + title + content
	// Satori needs a fixed height, so we estimate generously
	const textLength = (data.diffHtml || '').replace(/<[^>]+>/g, '').length;
	const estimatedLines = Math.ceil(textLength / 80); // ~80 chars per line at 800px
	const estimatedHeight = Math.max(418, 180 + estimatedLines * 22);

	const svg = await satori(
		{
			type: 'div',
			props: {
				style: {
					display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
					backgroundColor: '#fafafa', padding: '28px 32px', fontFamily: 'sans-serif'
				},
				children
			}
		},
		{ width: 800, height: estimatedHeight, fonts: [font] }
	);

	return await sharp(Buffer.from(svg)).png().toBuffer();
}

export function generateAltText(data: DiffCardData): string {
	if (data.titleChanged && data.oldTitle && data.newTitle) {
		return `Before: ${data.oldTitle}\nAfter: ${data.newTitle}`;
	}
	return `Article content changed: ${data.charsAdded} characters added, ${data.charsRemoved} characters removed`;
}
