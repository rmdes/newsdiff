import { describe, it, expect } from 'vitest';
import { shouldCheckArticle } from './scheduler';

describe('shouldCheckArticle', () => {
	const now = new Date('2024-06-15T12:00:00Z');

	it('always checks articles younger than 3 hours', () => {
		const firstSeen = new Date('2024-06-15T10:00:00Z');
		const lastChecked = new Date('2024-06-15T11:50:00Z');
		expect(shouldCheckArticle(firstSeen, lastChecked, now)).toBe(true);
	});

	it('checks 3-24h old articles every 30 minutes', () => {
		const firstSeen = new Date('2024-06-15T06:00:00Z');
		const lastChecked = new Date('2024-06-15T11:25:00Z');
		expect(shouldCheckArticle(firstSeen, lastChecked, now)).toBe(true);
	});

	it('skips 3-24h old articles checked less than 30 min ago', () => {
		const firstSeen = new Date('2024-06-15T06:00:00Z');
		const lastChecked = new Date('2024-06-15T11:45:00Z');
		expect(shouldCheckArticle(firstSeen, lastChecked, now)).toBe(false);
	});

	it('checks 1-7 day old articles every 3 hours', () => {
		const firstSeen = new Date('2024-06-13T12:00:00Z');
		const lastChecked = new Date('2024-06-15T08:00:00Z');
		expect(shouldCheckArticle(firstSeen, lastChecked, now)).toBe(true);
	});

	it('checks 7-30 day old articles every 12 hours', () => {
		const firstSeen = new Date('2024-06-05T12:00:00Z');
		const lastChecked = new Date('2024-06-14T22:00:00Z');
		expect(shouldCheckArticle(firstSeen, lastChecked, now)).toBe(true);
	});

	it('never checks articles older than 30 days', () => {
		const firstSeen = new Date('2024-05-01T12:00:00Z');
		const lastChecked = new Date('2024-05-15T12:00:00Z');
		expect(shouldCheckArticle(firstSeen, lastChecked, now)).toBe(false);
	});

	it('checks articles never checked before', () => {
		const firstSeen = new Date('2024-06-15T11:00:00Z');
		expect(shouldCheckArticle(firstSeen, null, now)).toBe(true);
	});
});
