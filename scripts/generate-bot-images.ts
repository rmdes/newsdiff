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

// Abstract bar representing a line of text
function textBar(width: string, color: string, opacity: number) {
	return {
		type: 'div',
		props: {
			style: {
				width,
				height: '12px',
				borderRadius: '6px',
				backgroundColor: color,
				opacity: String(opacity),
			},
			children: ''
		}
	};
}

async function generateAvatar() {
	const font = loadFont();
	const del = '#d32f2f';  // strong red on white
	const ins = '#2e7d32';  // strong green on white
	const muted = '#ccc';   // light gray for unchanged lines

	const svg = await satori({
		type: 'div',
		props: {
			style: {
				display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
				width: '100%', height: '100%', backgroundColor: '#ffffff', fontFamily: 'sans-serif',
				padding: '40px', gap: '14px',
			},
			children: [
				// Abstract "paragraph" with del/ins lines
				{ type: 'div', props: { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', width: '100%' }, children: [
					{ type: 'span', props: { style: { fontSize: '36px', color: del, fontWeight: '700', width: '30px' }, children: '−' } },
					textBar('70%', del, 0.4),
				]}},
				{ type: 'div', props: { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', width: '100%' }, children: [
					{ type: 'span', props: { style: { fontSize: '36px', color: ins, fontWeight: '700', width: '30px' }, children: '+' } },
					textBar('75%', ins, 0.5),
				]}},
				// Separator
				{ type: 'div', props: { style: { height: '8px' }, children: '' } },
				// Muted unchanged lines
				{ type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', paddingLeft: '40px' }, children: [
					textBar('85%', muted, 0.3),
					textBar('60%', muted, 0.2),
				]}},
				// Separator
				{ type: 'div', props: { style: { height: '8px' }, children: '' } },
				// Another change
				{ type: 'div', props: { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', width: '100%' }, children: [
					{ type: 'span', props: { style: { fontSize: '36px', color: del, fontWeight: '700', width: '30px' }, children: '−' } },
					textBar('50%', del, 0.4),
				]}},
				{ type: 'div', props: { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '10px', width: '100%' }, children: [
					{ type: 'span', props: { style: { fontSize: '36px', color: ins, fontWeight: '700', width: '30px' }, children: '+' } },
					textBar('65%', ins, 0.5),
				]}},
			]
		}
	}, { width: 400, height: 400, fonts: [font] });

	return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generateHeader() {
	const font = loadFont();
	const del = '#d32f2f';
	const ins = '#2e7d32';
	const muted = '#ccc';

	// Build rows of abstract diff bars
	function row(symbol: string, color: string, width: string, isDel: boolean = false) {
		return { type: 'div', props: { style: { display: 'flex', flexDirection: 'row' as const, alignItems: 'center', gap: '14px', width: '100%' }, children: [
			{ type: 'span', props: { style: { fontSize: '28px', color, fontWeight: '700', width: '24px', textAlign: 'center' as const }, children: symbol } },
			textBar(width, color, isDel ? 0.35 : 0.6),
		]}};
	}
	function mutedRow(width: string) {
		return { type: 'div', props: { style: { display: 'flex', flexDirection: 'row' as const, paddingLeft: '38px', width: '100%' }, children: [
			textBar(width, muted, 0.25),
		]}};
	}

	const svg = await satori({
		type: 'div',
		props: {
			style: {
				display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
				width: '100%', height: '100%', backgroundColor: '#ffffff', fontFamily: 'sans-serif',
				padding: '40px 60px', gap: '60px',
			},
			children: [
				// Left: abstract diff
				{ type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '10px', flex: '1' }, children: [
					row('−', del, '80%', true),
					row('+', ins, '85%'),
					{ type: 'div', props: { style: { height: '4px' }, children: '' } },
					mutedRow('90%'),
					mutedRow('70%'),
					mutedRow('75%'),
					{ type: 'div', props: { style: { height: '4px' }, children: '' } },
					row('−', del, '55%', true),
					row('+', ins, '70%'),
				]}},
				// Right: branding
				{ type: 'div', props: { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }, children: [
					{ type: 'span', props: { style: { fontSize: '42px', fontWeight: '700', color: '#1a1a1a', letterSpacing: '-2px' }, children: 'NewsDiff' } },
					{ type: 'span', props: { style: { fontSize: '14px', color: '#999', textAlign: 'right' as const }, children: 'Tracking how news changes' } },
				]}},
			]
		}
	}, { width: 1500, height: 500, fonts: [font] });

	return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generateFavicon() {
	const font = loadFont();
	const svg = await satori({
		type: 'div',
		props: {
			style: {
				display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
				width: '100%', height: '100%', backgroundColor: '#ffffff', fontFamily: 'sans-serif',
				borderRadius: '20px', gap: '4px',
			},
			children: [
				{ type: 'span', props: { style: { fontSize: '52px', fontWeight: '700', color: '#d32f2f', lineHeight: '1' }, children: '−' } },
				{ type: 'span', props: { style: { fontSize: '52px', fontWeight: '700', color: '#2e7d32', lineHeight: '1' }, children: '+' } },
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
