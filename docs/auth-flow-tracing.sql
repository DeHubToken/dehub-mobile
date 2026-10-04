-- Read-only login journey inspection. One flow can contain several method attempts.
-- A missing completion means incomplete observation, not a proven failed signup.
-- Web survives same-tab redirects; mobile correlation currently lasts one process.
-- Screen changes and explicit sheet dismissal are recorded. No input values are recorded.

-- Flow outcomes and last observed screen/stage in the past 24 hours.
WITH events AS (
  SELECT created_at, message, metadata,
    metadata->>'auth_flow_id' AS flow_id
  FROM public.client_error_logs
  WHERE created_at > now() - interval '24 hours'
    AND metadata->>'auth_flow_id' IS NOT NULL
), flows AS (
  SELECT flow_id, min(created_at) AS first_seen, max(created_at) AS last_seen,
    bool_or(message IN ('signed-in', 'signup-complete')) AS completed,
    bool_or(message = 'flow-dismissed') AS explicitly_dismissed,
    count(DISTINCT metadata->>'auth_attempt_id') AS attempts,
    (array_agg(metadata->>'auth_stage' ORDER BY created_at DESC))[1] AS last_stage,
    (array_agg(metadata->>'screen' ORDER BY created_at DESC)
      FILTER (WHERE metadata->>'screen' IS NOT NULL))[1] AS last_screen
  FROM events GROUP BY flow_id
)
SELECT * FROM flows ORDER BY last_seen DESC;

-- Replace the placeholder with one flow id to see the ordered journey.
SELECT created_at, level, component, message,
  metadata->>'auth_attempt_id' AS attempt_id,
  metadata->>'auth_method' AS method,
  metadata->>'auth_stage' AS stage,
  metadata->>'auth_elapsed_ms' AS elapsed_ms,
  metadata->>'screen' AS screen,
  metadata->>'status' AS http_status,
  metadata->>'reason' AS reason
FROM public.client_error_logs
WHERE metadata->>'auth_flow_id' = 'FLOW_ID'
ORDER BY created_at, id;
