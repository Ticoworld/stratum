WITH sole_tenant AS (
  SELECT id
  FROM "tenants"
  LIMIT 2
),
tenant_count AS (
  SELECT COUNT(*)::int AS count
  FROM sole_tenant
),
selected_tenant AS (
  SELECT id
  FROM sole_tenant
  LIMIT 1
)
UPDATE "stratum_watchlists"
SET "tenant_id" = (SELECT id FROM selected_tenant)
WHERE "tenant_id" IS NULL
  AND (SELECT count FROM tenant_count) = 1;
--> statement-breakpoint
WITH orphan_briefs AS (
  SELECT "id"
  FROM "stratum_briefs"
  WHERE "watchlist_entry_id" IS NULL
),
candidate_links AS (
  SELECT
    "latest_brief_id" AS "brief_id",
    "id" AS "watchlist_entry_id"
  FROM "stratum_watchlist_entries"
  WHERE "latest_brief_id" IS NOT NULL

  UNION ALL

  SELECT
    "related_brief_id" AS "brief_id",
    "watchlist_entry_id"
  FROM "stratum_monitoring_events"
  WHERE "related_brief_id" IS NOT NULL

  UNION ALL

  SELECT
    "related_brief_id" AS "brief_id",
    "watchlist_entry_id"
  FROM "stratum_notification_candidates"
  WHERE "related_brief_id" IS NOT NULL
),
distinct_links AS (
  SELECT DISTINCT
    candidate_links."brief_id",
    candidate_links."watchlist_entry_id"
  FROM candidate_links
  INNER JOIN orphan_briefs
    ON orphan_briefs."id" = candidate_links."brief_id"
),
unambiguous_links AS (
  SELECT
    distinct_links."brief_id",
    distinct_links."watchlist_entry_id"
  FROM distinct_links
  INNER JOIN (
    SELECT "brief_id"
    FROM distinct_links
    GROUP BY "brief_id"
    HAVING COUNT(*) = 1
  ) AS uniquely_linked_briefs
    ON uniquely_linked_briefs."brief_id" = distinct_links."brief_id"
)
UPDATE "stratum_briefs"
SET "watchlist_entry_id" = unambiguous_links."watchlist_entry_id"
FROM unambiguous_links
WHERE "stratum_briefs"."id" = unambiguous_links."brief_id"
  AND "stratum_briefs"."watchlist_entry_id" IS NULL;
