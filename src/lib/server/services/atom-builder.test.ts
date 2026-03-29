import { describe, it, expect } from 'vitest';
import { buildAtomFeed } from './atom-builder';

describe('buildAtomFeed', () => {
	it('generates valid Atom XML with entries', () => {
		const xml = buildAtomFeed({
			id: 'https://example.com/feed.xml',
			title: 'Test Feed',
			link: 'https://example.com',
			updated: '2026-03-29T10:00:00Z',
			entries: [
				{
					id: 'https://example.com/diff/1',
					title: 'Content changed: Article One',
					link: 'https://example.com/diff/1',
					updated: '2026-03-29T10:00:00Z',
					summary: 'Content changed in "Article One". +50 / -20 chars.'
				}
			]
		});

		expect(xml).toContain('<?xml version="1.0"');
		expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
		expect(xml).toContain('<title>Test Feed</title>');
		expect(xml).toContain('<entry>');
		expect(xml).toContain('Content changed: Article One');
	});

	it('escapes special characters in title and summary', () => {
		const xml = buildAtomFeed({
			id: 'https://example.com/feed.xml',
			title: 'Feed & "Friends"',
			link: 'https://example.com',
			updated: '2026-03-29T10:00:00Z',
			entries: [{
				id: 'https://example.com/diff/1',
				title: 'He said "hello" & <goodbye>',
				link: 'https://example.com/diff/1',
				updated: '2026-03-29T10:00:00Z',
				summary: 'Test <script>alert(1)</script>'
			}]
		});

		expect(xml).toContain('&amp;');
		expect(xml).toContain('&lt;');
		expect(xml).toContain('&quot;');
		expect(xml).not.toContain('<script>');
	});

	it('generates feed with no entries', () => {
		const xml = buildAtomFeed({
			id: 'https://example.com/feed.xml',
			title: 'Empty',
			link: 'https://example.com',
			updated: '2026-03-29T10:00:00Z',
			entries: []
		});

		expect(xml).toContain('<title>Empty</title>');
		expect(xml).not.toContain('<entry>');
	});

	it('includes self link', () => {
		const xml = buildAtomFeed({
			id: 'https://example.com/feed.xml',
			title: 'Test',
			link: 'https://example.com',
			updated: '2026-03-29T10:00:00Z',
			entries: []
		});

		expect(xml).toContain('rel="self"');
		expect(xml).toContain('type="application/atom+xml"');
	});
});
