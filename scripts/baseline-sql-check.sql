-- Checks the baseline batch's SQL against a real Postgres.
--
-- Why this exists as raw SQL: the statements in src/lib/baseline/compute.ts
-- run through Neon's HTTP driver, which only talks to Neon — so they cannot
-- be exercised from a unit test, and every mistake in them (a missing comma,
-- UTC bucketing, a percentile taken over the wrong column) would first show
-- up as a silently wrong baseline in production. That is the one thing M0
-- exists to produce, so it is worth checking somewhere.
--
-- WARNING: the statements below are a COPY of the ones in compute.ts and
-- nothing keeps them in step. If you change the batch, change this too, or it
-- will go on certifying the query you no longer run.
--
-- Run against a scratch database — it creates and drops its own tables, so
-- never point it at the real one:
--   psql "$BASELINE_CHECK_DATABASE_URL" -f scripts/baseline-sql-check.sql

\set ON_ERROR_STOP on
SET TIME ZONE 'UTC';

DROP TABLE IF EXISTS traffic_snapshot, baseline;

CREATE TABLE traffic_snapshot (
  id BIGSERIAL PRIMARY KEY, section_id TEXT NOT NULL, section_name TEXT NOT NULL,
  source TEXT NOT NULL, travel_minutes DOUBLE PRECISION NOT NULL,
  speed_kmh DOUBLE PRECISION, ts TIMESTAMPTZ NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE UNIQUE INDEX traffic_snapshot_section_ts_key ON traffic_snapshot (section_id, ts);
CREATE TABLE baseline (
  section_id TEXT NOT NULL, dow SMALLINT NOT NULL, bucket SMALLINT NOT NULL,
  p50 DOUBLE PRECISION NOT NULL, p75 DOUBLE PRECISION NOT NULL, p90 DOUBLE PRECISION NOT NULL,
  sample_size INT NOT NULL, computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (section_id, dow, bucket));

-- Fixtures are anchored to *yesterday in Taipei* rather than a fixed date, so
-- the trailing window never quietly ages past them and leaves this check
-- passing over an empty table.
CREATE TEMP VIEW anchor AS
  SELECT ((now() AT TIME ZONE 'Asia/Taipei')::date - 1) AS local_day;

-- A: 12 readings, values 1..12, inside Taipei 08:00–08:12 -> bucket 32.
INSERT INTO traffic_snapshot (section_id, section_name, source, travel_minutes, ts)
SELECT 'A', 'A', 't', g,
       (a.local_day + time '08:00' + (g || ' minutes')::interval) AT TIME ZONE 'Asia/Taipei'
FROM anchor a, generate_series(1, 12) g;

-- A: 3 readings in Taipei 09:00 -> bucket 36. A bucket this thin must still be
-- stored; refusing to draw a conclusion from it is classify.ts's job, not the
-- batch's, and dropping it here would hide how thin the data actually is.
INSERT INTO traffic_snapshot (section_id, section_name, source, travel_minutes, ts)
SELECT 'A', 'A', 't', 5,
       (a.local_day + time '09:00' + (g || ' minutes')::interval) AT TIME ZONE 'Asia/Taipei'
FROM anchor a, generate_series(1, 3) g;

-- B: Taipei 07:30, which is 23:30 the *previous* day in UTC. Bucketing in UTC
-- would file this under the previous weekday's bucket 94 instead of this
-- weekday's bucket 30 — the eight-hour smear this check exists to catch.
INSERT INTO traffic_snapshot (section_id, section_name, source, travel_minutes, ts)
SELECT 'B', 'B', 't', 4, (a.local_day + time '07:30') AT TIME ZONE 'Asia/Taipei' FROM anchor a;

-- C: a broken zero reading. Must be excluded — it is not a very fast road.
INSERT INTO traffic_snapshot (section_id, section_name, source, travel_minutes, ts)
SELECT 'C', 'C', 't', 0, (a.local_day + time '08:05') AT TIME ZONE 'Asia/Taipei' FROM anchor a;

-- D: older than the window.
INSERT INTO traffic_snapshot (section_id, section_name, source, travel_minutes, ts)
SELECT 'D', 'D', 't', 7, (a.local_day - 400 + time '08:05') AT TIME ZONE 'Asia/Taipei' FROM anchor a;

-- A leftover row from an earlier run that this window no longer supports.
INSERT INTO baseline (section_id, dow, bucket, p50, p75, p90, sample_size, computed_at)
VALUES ('GONE', 3, 44, 1, 2, 3, 99, now() - interval '1 day');

SELECT now() AS run_start \gset

-- ===== copy of computeBaselines()'s upsert (windowDays = 56) =====
INSERT INTO baseline (section_id, dow, bucket, p50, p75, p90, sample_size, computed_at)
SELECT
  section_id,
  EXTRACT(ISODOW FROM ts AT TIME ZONE 'Asia/Taipei')::smallint,
  (EXTRACT(HOUR FROM ts AT TIME ZONE 'Asia/Taipei')::int * 4
    + FLOOR(EXTRACT(MINUTE FROM ts AT TIME ZONE 'Asia/Taipei') / 15)::int)::smallint,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY travel_minutes),
  percentile_cont(0.75) WITHIN GROUP (ORDER BY travel_minutes),
  percentile_cont(0.90) WITHIN GROUP (ORDER BY travel_minutes),
  COUNT(*)::int,
  now()
FROM traffic_snapshot
WHERE ts >= now() - (56::int * INTERVAL '1 day')
  AND travel_minutes > 0
GROUP BY 1, 2, 3
ON CONFLICT (section_id, dow, bucket) DO UPDATE SET
  p50         = EXCLUDED.p50,
  p75         = EXCLUDED.p75,
  p90         = EXCLUDED.p90,
  sample_size = EXCLUDED.sample_size,
  computed_at = EXCLUDED.computed_at
RETURNING section_id, sample_size;

-- ===== copy of the stale sweep =====
DELETE FROM baseline WHERE computed_at < :'run_start' RETURNING section_id;

\echo '--- resulting baseline ---'
SELECT section_id, dow, bucket, p50, p75, p90, sample_size FROM baseline ORDER BY section_id, dow, bucket;

DO $$
DECLARE
  r RECORD;
  expected_dow INT;
BEGIN
  -- Derived from the plain local date, independently of the timestamptz →
  -- Taipei conversion the batch performs, so this is a real check of that
  -- conversion rather than a restatement of it.
  SELECT EXTRACT(ISODOW FROM local_day)::int INTO expected_dow FROM anchor;

  SELECT * INTO r FROM baseline WHERE section_id='A' AND bucket=32;
  ASSERT r.dow = expected_dow, 'A bucketed on the wrong weekday: ' || r.dow;
  ASSERT r.sample_size = 12, 'A/32 sample_size = ' || r.sample_size;
  ASSERT r.p50 = 6.5,   'A/32 p50 = ' || r.p50;
  ASSERT r.p75 = 9.25,  'A/32 p75 = ' || r.p75;
  ASSERT abs(r.p90 - 10.9) < 1e-9, 'A/32 p90 = ' || r.p90;

  SELECT * INTO r FROM baseline WHERE section_id='A' AND bucket=36;
  ASSERT r.sample_size = 3, 'a thin bucket is still stored';

  SELECT * INTO r FROM baseline WHERE section_id='B';
  ASSERT r.dow = expected_dow AND r.bucket = 30,
    'B must bucket by the Taipei wall clock, got dow=' || r.dow || ' bucket=' || r.bucket;

  ASSERT NOT EXISTS (SELECT 1 FROM baseline WHERE section_id='C'), 'a zero-minute reading must be excluded';
  ASSERT NOT EXISTS (SELECT 1 FROM baseline WHERE section_id='D'), 'a reading outside the window must be excluded';
  ASSERT NOT EXISTS (SELECT 1 FROM baseline WHERE section_id='GONE'), 'an unsupported leftover row must be deleted';

  RAISE NOTICE 'baseline batch SQL: all assertions passed';
END $$;

-- ===== copy of readBaselineFor() =====
\echo '--- readBaselineFor(dow, bucket 32) ---'
SELECT section_id, dow, bucket, p50, p75, p90, sample_size
FROM baseline
WHERE bucket = 32 AND section_id = ANY('{A,B}'::text[]);

-- ===== copy of readBaselineReadiness() (MIN_SAMPLES_FOR_BASELINE = 8) =====
\echo '--- readBaselineReadiness() ---'
SELECT
  COUNT(*)::int                                                   AS buckets,
  COUNT(*) FILTER (WHERE sample_size >= 8)::int                   AS reliable_buckets,
  COUNT(DISTINCT section_id)::int                                 AS sections,
  COUNT(DISTINCT section_id) FILTER (WHERE sample_size >= 8)::int AS ready_sections,
  MAX(computed_at)                                                AS last_computed_at
FROM baseline;

DROP TABLE traffic_snapshot, baseline;
