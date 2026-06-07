-- Dedupe versions that share (article_id, version_number) before enforcing
-- uniqueness. These come from a race where two concurrent polls of the same
-- URL both inserted the "next" version. Keep the lowest id per group and
-- repoint any diffs that referenced a removed duplicate.
UPDATE "diffs" SET "new_version_id" = k.keep_id
FROM "versions" v,
     (SELECT "article_id", "version_number", min("id") AS keep_id FROM "versions" GROUP BY "article_id", "version_number") k
WHERE "diffs"."new_version_id" = v."id"
  AND v."article_id" = k."article_id" AND v."version_number" = k."version_number"
  AND v."id" <> k.keep_id;--> statement-breakpoint
UPDATE "diffs" SET "old_version_id" = k.keep_id
FROM "versions" v,
     (SELECT "article_id", "version_number", min("id") AS keep_id FROM "versions" GROUP BY "article_id", "version_number") k
WHERE "diffs"."old_version_id" = v."id"
  AND v."article_id" = k."article_id" AND v."version_number" = k."version_number"
  AND v."id" <> k.keep_id;--> statement-breakpoint
DELETE FROM "versions" v
USING (SELECT "article_id", "version_number", min("id") AS keep_id FROM "versions" GROUP BY "article_id", "version_number") k
WHERE v."article_id" = k."article_id" AND v."version_number" = k."version_number" AND v."id" <> k.keep_id;--> statement-breakpoint
CREATE UNIQUE INDEX "versions_article_version_unq" ON "versions" USING btree ("article_id","version_number");
