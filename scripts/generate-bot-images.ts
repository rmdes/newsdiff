import satori from 'satori';
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

const fontPaths = [
	'/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
	'/usr/share/fonts/google-carlito-fonts/Carlito-Regular.ttf',
	'/usr/share/fonts/liberation-fonts/LiberationSans-Regular.ttf',
	'/usr/share/fonts/dejavu-sans-fonts/DejaVuSans.ttf',
	'/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
];

function loadFont() {
	for (const p of fontPaths) {
		try {
			return { data: readFileSync(p), name: 'sans-serif', weight: 400 as const, style: 'normal' as const };
		} catch { /* next */ }
	}
	throw new Error('No font found');
}

function diffLine(symbol: string, text: string, isDel: boolean) {
	return {
		type: 'div',
		props: {
			style: {
				display: 'flex',
				flexDirection: 'row' as const,
				alignItems: 'center',
				gap: '10px',
				marginBottom: '6px',
			},
			children: [
				{ type: 'span', props: { style: { fontSize: '20px', color: isDel ? '#f8d7da' : '#d4edda', fontWeight: '700', width: '20px' }, children: symbol } },
				{ type: 'span', props: { style: {
					backgroundColor: isDel ? 'rgba(248,215,218,0.15)' : 'rgba(212,237,218,0.15)',
					borderRadius: '4px', padding: '4px 10px',
					color: isDel ? '#f8d7da' : '#d4edda',
					textDecoration: isDel ? 'line-through' : 'none',
					fontSize: '16px', fontWeight: isDel ? '400' : '600',
				}, children: text } },
			]
		}
	};
}

async function generateAvatar() {
	const font = loadFont();
	const svg = await satori({
		type: 'div',
		props: {
			style: {
				display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
				width: '100%', height: '100%', backgroundColor: '#1a1a2e', fontFamily: 'sans-serif',
				padding: '30px',
			},
			children: [
				diffLine('−', 'old headline', true),
				diffLine('+', 'new headline', false),
				{ type: 'div', props: { style: { marginTop: '20px', fontSize: '30px', fontWeight: '700', color: '#e0e0e0', letterSpacing: '-1px' }, children: 'NewsDiff' } },
			]
		}
	}, { width: 400, height: 400, fonts: [font] });

	return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generateHeader() {
	const font = loadFont();
	const svg = await satori({
		type: 'div',
		props: {
			style: {
				display: 'flex', flexDirection: 'column', justifyContent: 'center',
				width: '100%', height: '100%', backgroundColor: '#1a1a2e', fontFamily: 'sans-serif',
				padding: '40px 60px',
			},
			children: [
				// Top bar
				{
					type: 'div',
					props: {
						style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' },
						children: [
							{ type: 'span', props: { style: { fontSize: '28px', fontWeight: '700', color: '#e0e0e0', letterSpacing: '-1px' }, children: 'NewsDiff' } },
							{ type: 'span', props: { style: { fontSize: '14px', color: '#888' }, children: 'Tracking how news changes after publication' } },
						]
					}
				},
				// Diff lines
				diffLine('−', 'Government announces plan to reduce emissions by 2030', true),
				diffLine('+', 'Government quietly revises emissions target to 2035', false),
				{ type: 'div', props: { style: { height: '12px' }, children: '' } },
				diffLine('−', 'The initiative will cover all major industrial sectors', true),
				diffLine('+', 'The initiative will focus on selected industrial sectors', false),
			]
		}
	}, { width: 1500, height: 500, fonts: [font] });

	return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generateFavicon() {
	const font = loadFont();
	// Simple 128x128 icon: just the +/- symbols on dark background
	const svg = await satori({
		type: 'div',
		props: {
			style: {
				display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
				width: '100%', height: '100%', backgroundColor: '#1a1a2e', fontFamily: 'sans-serif',
				borderRadius: '20px',
			},
			children: [
				{ type: 'span', props: { style: { fontSize: '44px', fontWeight: '700', color: '#f8d7da', lineHeight: '1', marginBottom: '2px' }, children: '−' } },
				{ type: 'span', props: { style: { fontSize: '44px', fontWeight: '700', color: '#d4edda', lineHeight: '1' }, children: '+' } },
			]
		}
	}, { width: 128, height: 128, fonts: [font] });

	return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
	const outDir = './scripts/output';
	mkdirSync(outDir, { recursive: true });

	console.log('Generating avatar (400x400)...');
	const avatar = await generateAvatar();
	writeFileSync(`${outDir}/avatar.png`, avatar);
	console.log(`  → ${outDir}/avatar.png (${(avatar.length / 1024).toFixed(1)} KB)`);

	console.log('Generating header (1500x500)...');
	const header = await generateHeader();
	writeFileSync(`${outDir}/header.png`, header);
	console.log(`  → ${outDir}/header.png (${(header.length / 1024).toFixed(1)} KB)`);

	console.log('Generating favicon (128x128)...');
	const favicon = await generateFavicon();
	writeFileSync(`${outDir}/favicon.png`, favicon);
	console.log(`  → ${outDir}/favicon.png (${(favicon.length / 1024).toFixed(1)} KB)`);
}

main().catch(console.error);
