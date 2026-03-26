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

export async function generateDiffCard(data: DiffCardData): Promise<Buffer> {
	const changeType = data.titleChanged && data.contentChanged
		? 'Headline & Content changed'
		: data.titleChanged
			? 'Headline changed'
			: 'Content changed';

	const children: any[] = [
		{
			type: 'div',
			props: {
				style: { fontSize: '18px', color: '#666', marginBottom: '12px' },
				children: `${data.feedName} — NewsDiff`
			}
		},
		{
			type: 'div',
			props: {
				style: { fontSize: '28px', fontWeight: 'bold', color: '#1a1a1a', marginBottom: '20px', lineHeight: 1.3 },
				children: data.articleTitle
			}
		},
		{
			type: 'div',
			props: {
				style: { display: 'flex', gap: '8px', marginBottom: '20px' },
				children: [
					{
						type: 'div',
						props: {
							style: {
								padding: '4px 12px', borderRadius: '999px', fontSize: '14px', fontWeight: '600',
								backgroundColor: data.titleChanged ? '#f8d7da' : '#d4edda',
								color: data.titleChanged ? '#721c24' : '#155724'
							},
							children: changeType
						}
					}
				]
			}
		}
	];

	if (data.titleChanged && data.oldTitle && data.newTitle) {
		children.push(
			{
				type: 'div',
				props: {
					style: { fontSize: '16px', color: '#721c24', textDecoration: 'line-through', marginBottom: '8px' },
					children: data.oldTitle
				}
			},
			{
				type: 'div',
				props: {
					style: { fontSize: '16px', color: '#155724', fontWeight: 'bold' },
					children: data.newTitle
				}
			}
		);
	}

	children.push({
		type: 'div',
		props: {
			style: { marginTop: 'auto', fontSize: '14px', color: '#666' },
			children: `+${data.charsAdded} / -${data.charsRemoved} characters`
		}
	});

	const font = loadFont();

	const svg = await satori(
		{
			type: 'div',
			props: {
				style: {
					display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
					backgroundColor: '#fafafa', padding: '40px', fontFamily: 'sans-serif'
				},
				children
			}
		},
		{ width: 800, height: 418, fonts: [font] }
	);

	return await sharp(Buffer.from(svg)).png().toBuffer();
}

export function generateAltText(data: DiffCardData): string {
	if (data.titleChanged && data.oldTitle && data.newTitle) {
		return `Before: ${data.oldTitle}\nAfter: ${data.newTitle}`;
	}
	return `Article content changed: ${data.charsAdded} characters added, ${data.charsRemoved} characters removed`;
}
