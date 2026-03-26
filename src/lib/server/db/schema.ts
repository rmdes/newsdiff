import { pgTable, serial, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const feeds = pgTable('feeds', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	url: text('url').notNull().unique(),
	siteName: text('site_name'),
	checkInterval: integer('check_interval').notNull().default(5),
	isActive: boolean('is_active').notNull().default(true),
	lastError: text('last_error'),
	lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
	consecutiveErrors: integer('consecutive_errors').notNull().default(0),
	lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const articles = pgTable('articles', {
	id: serial('id').primaryKey(),
	feedId: integer('feed_id').notNull().references(() => feeds.id, { onDelete: 'cascade' }),
	url: text('url').notNull().unique(),
	firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
	lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
	lastChangedAt: timestamp('last_changed_at', { withTimezone: true }),
	checkCount: integer('check_count').notNull().default(0)
});

export const versions = pgTable('versions', {
	id: serial('id').primaryKey(),
	articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
	title: text('title'),
	byline: text('byline'),
	contentText: text('content_text').notNull(),
	contentHash: text('content_hash').notNull(),
	versionNumber: integer('version_number').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const diffs = pgTable('diffs', {
	id: serial('id').primaryKey(),
	articleId: integer('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
	oldVersionId: integer('old_version_id').notNull().references(() => versions.id, { onDelete: 'cascade' }),
	newVersionId: integer('new_version_id').notNull().references(() => versions.id, { onDelete: 'cascade' }),
	titleChanged: boolean('title_changed').notNull().default(false),
	contentChanged: boolean('content_changed').notNull().default(false),
	diffHtml: text('diff_html').notNull(),
	charsAdded: integer('chars_added').notNull().default(0),
	charsRemoved: integer('chars_removed').notNull().default(0),
	isBoring: boolean('is_boring').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const socialPosts = pgTable('social_posts', {
	id: serial('id').primaryKey(),
	diffId: integer('diff_id').notNull().references(() => diffs.id, { onDelete: 'cascade' }),
	platform: text('platform').notNull(),
	postUri: text('post_uri'),
	threadRootUri: text('thread_root_uri'),
	imagePath: text('image_path'),
	postedAt: timestamp('posted_at', { withTimezone: true }),
	error: text('error')
});

export const feedsRelations = relations(feeds, ({ many }) => ({
	articles: many(articles)
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
	feed: one(feeds, { fields: [articles.feedId], references: [feeds.id] }),
	versions: many(versions),
	diffs: many(diffs)
}));

export const versionsRelations = relations(versions, ({ one }) => ({
	article: one(articles, { fields: [versions.articleId], references: [articles.id] })
}));

export const diffsRelations = relations(diffs, ({ one, many }) => ({
	article: one(articles, { fields: [diffs.articleId], references: [articles.id] }),
	oldVersion: one(versions, { fields: [diffs.oldVersionId], references: [versions.id], relationName: 'oldVersion' }),
	newVersion: one(versions, { fields: [diffs.newVersionId], references: [versions.id], relationName: 'newVersion' }),
	socialPosts: many(socialPosts)
}));

export const socialPostsRelations = relations(socialPosts, ({ one }) => ({
	diff: one(diffs, { fields: [socialPosts.diffId], references: [diffs.id] })
}));
