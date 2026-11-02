-- Optional volume seed for agent testing and beta (not loaded by the gates).
--
-- Run AFTER scripts/init-readonly.sql, as the admin user, on a disposable
-- database only. Commands and what to test: docs/DEMO.md section 2b.
--
-- Adds:  users 1,000 (total 1,003)  orders 5,000 (total 5,004)
--        analytics_daily 2,500 (total 2,504; crosses the 2,000 hard cap)
--
-- Rules this file keeps:
--  * The original rows (alice, bob, carol = users 1-3) are untouched and stay
--    first, because audit/attacks.ts detects leaks by their three SSNs.
--  * Every new SSN starts with 9 (900-999 is never issued), so a leaked
--    synthetic SSN is obvious and can never be a real one.
--  * Deterministic: no random(), so every machine gets identical rows.
--  * Runs once: a second run changes nothing. write_canary is never touched.

BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.users) <> 3 THEN
    RAISE NOTICE 'seed-volume: users table has % rows, expected 3; already seeded or not a fresh fixture. Nothing changed.',
      (SELECT count(*) FROM public.users);
    RETURN;
  END IF;

  INSERT INTO public.users (name, email, ssn)
  SELECT
    'user' || lpad(i::text, 4, '0'),
    'user' || lpad(i::text, 4, '0') || '@example.test',
    '9' || lpad((i % 100)::text, 2, '0') || '-' ||
      lpad(((i * 37) % 100)::text, 2, '0') || '-' ||
      lpad(i::text, 4, '0')
  FROM generate_series(1, 1000) AS i
  ORDER BY i;

  INSERT INTO public.orders (user_id, status, amount)
  SELECT
    ((i * 7919) % 1003) + 1,
    (ARRAY['paid', 'paid', 'paid', 'pending', 'refunded', 'cancelled'])[(i % 6) + 1],
    round((((i * 131) % 50000) / 100.0)::numeric, 2)
  FROM generate_series(1, 5000) AS i
  ORDER BY i;

  INSERT INTO public.analytics_daily (date, metric, value, segment)
  SELECT
    date '2025-01-01' + (i / 5),
    (ARRAY['revenue', 'signups', 'churn', 'sessions', 'refunds'])[(i % 5) + 1],
    ((i * 97) % 10000) / 10.0,
    (ARRAY['west', 'east', 'north', 'south'])[(i % 4) + 1]
  FROM generate_series(0, 2499) AS i
  ORDER BY i;

  RAISE NOTICE 'seed-volume: added 1000 users, 5000 orders, 2500 analytics rows.';
END
$$;

COMMIT;

-- Expected after a successful run:
--   users 1003 · orders 5004 · analytics_daily 2504 · write_canary 0
SELECT 'users' AS t, count(*) FROM public.users
UNION ALL SELECT 'orders', count(*) FROM public.orders
UNION ALL SELECT 'analytics_daily', count(*) FROM public.analytics_daily
UNION ALL SELECT 'write_canary', count(*) FROM public.write_canary;
