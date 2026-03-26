import { describe, it, expect } from 'vitest';
import { generateDiffCard, generateAltText } from './card-generator';

describe('generateDiffCard', () => {
	it('returns a PNG buffer', async () => {
		const png = await generateDiffCard({
			feedName: 'NYT',
			articleTitle: 'Test Article',
			titleChanged: true,
			contentChanged: false,
			charsAdded: 42,
			charsRemoved: 10,
			oldTitle: 'Old Title',
			newTitle: 'New Title'
		});
		expect(png).toBeInstanceOf(Buffer);
		expect(png[0]).toBe(0x89);
		expect(png[1]).toBe(0x50);
		expect(png[2]).toBe(0x4e);
		expect(png[3]).toBe(0x47);
	});
});

describe('generateAltText', () => {
	it('returns title change text when title changed', () => {
		const text = generateAltText({
			feedName: 'NYT', articleTitle: 'Test', titleChanged: true,
			contentChanged: false, charsAdded: 0, charsRemoved: 0,
			oldTitle: 'Old', newTitle: 'New'
		});
		expect(text).toContain('Before: Old');
		expect(text).toContain('After: New');
	});

	it('returns content change text when only content changed', () => {
		const text = generateAltText({
			feedName: 'NYT', articleTitle: 'Test', titleChanged: false,
			contentChanged: true, charsAdded: 50, charsRemoved: 20
		});
		expect(text).toContain('50 characters added');
		expect(text).toContain('20 characters removed');
	});
});
