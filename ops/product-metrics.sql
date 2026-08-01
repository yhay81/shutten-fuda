WITH clean_events AS (
  SELECT name, session_id, opportunity_id, day FROM product_events WHERE is_qa = 0
),
opportunity_depth AS (
  SELECT opportunity_id,
    COUNT(DISTINCT CASE WHEN name = 'opportunity_opened' THEN session_id END) AS viewers,
    COUNT(DISTINCT CASE WHEN name = 'source_opened' THEN session_id END) AS source_users
  FROM clean_events WHERE opportunity_id IS NOT NULL GROUP BY opportunity_id
),
continuity AS (
  SELECT opportunity_id,
    MIN(CASE WHEN name = 'opportunity_created' THEN day END) AS created_day,
    MAX(CASE WHEN name = 'opportunity_updated' THEN day END) AS updated_day
  FROM clean_events WHERE opportunity_id IS NOT NULL GROUP BY opportunity_id
),
funnel AS (
  SELECT
    COUNT(DISTINCT CASE WHEN name = 'visited' THEN session_id END) AS visitors,
    COUNT(DISTINCT CASE WHEN name = 'directory_searched' THEN session_id END) AS searchers,
    COUNT(DISTINCT CASE WHEN name = 'opportunity_created' THEN session_id END) AS creators,
    COUNT(DISTINCT CASE WHEN name = 'opportunity_opened' THEN session_id END) AS viewers,
    COUNT(DISTINCT CASE WHEN name = 'source_opened' THEN session_id END) AS source_users,
    COUNT(DISTINCT CASE WHEN name = 'opportunity_updated' THEN session_id END) AS editors,
    COUNT(DISTINCT CASE WHEN name = 'opportunity_closed' THEN session_id END) AS closers,
    COUNT(DISTINCT CASE WHEN name = 'returned' THEN session_id END) AS returned,
    COUNT(DISTINCT CASE WHEN name = 'opportunity_reported' THEN session_id END) AS reporters,
    COUNT(DISTINCT CASE WHEN name = 'opportunity_deleted' THEN session_id END) AS deleters
  FROM clean_events
)
SELECT funnel.*,
  (SELECT COUNT(*) FROM opportunities WHERE status = 'active' AND deadline >= date('now')) AS active_opportunities,
  (SELECT COUNT(*) FROM opportunities WHERE status = 'closed') AS closed_opportunities,
  (SELECT COUNT(*) FROM opportunities WHERE status = 'hidden') AS hidden_opportunities,
  (SELECT COUNT(*) FROM opportunity_depth WHERE viewers >= 3) AS opportunities_with_three_viewers,
  (SELECT COUNT(*) FROM opportunity_depth WHERE source_users >= 2) AS opportunities_with_two_source_users,
  (SELECT COUNT(*) FROM opportunity_depth WHERE viewers >= 3 AND source_users >= 2) AS qualified_opportunities,
  (SELECT COUNT(*) FROM continuity WHERE created_day IS NOT NULL AND updated_day > created_day) AS opportunities_updated_later
FROM funnel;
