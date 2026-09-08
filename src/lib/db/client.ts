import { neon } from "@neondatabase/serverless";

/**
 * M0 (PRD §12, §14): a persistent time-series store for raw traffic
 * snapshots, so a baseline can eventually be computed from real data instead
 * of the time-function simulation. Neon's HTTP driver is used rather than a
 * pooled TCP client because this only ever runs inside short-lived
 * serverless invocations (the cron route) — no connection pool to manage or
 * exhaust.
 *
 * `DATABASE_URL` comes from connecting a Neon (or any Postgres) resource to
 * this Vercel project under Storage — see README.md's M0 section. Read
 * lazily (not at module load) so importing this file never throws before
 * the caller has a chance to check `isDatabaseConfigured()`.
 */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function requireSql() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL not set");
  return neon(url);
}

/**
 * Idempotent — safe to call on every cron invocation rather than requiring a
 * separate migration step, since M0's schema is still small and stable.
 */
export async function ensureSchema(): Promise<void> {
  const sql = requireSql();
  await sql`
    CREATE TABLE IF NOT EXISTS traffic_snapshot (
      id BIGSERIAL PRIMARY KEY,
      section_id TEXT NOT NULL,
      section_name TEXT NOT NULL,
      source TEXT NOT NULL,
      travel_minutes DOUBLE PRECISION NOT NULL,
      speed_kmh DOUBLE PRECISION,
      ts TIMESTAMPTZ NOT NULL,
      collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // Unique, not just indexed: TDX refreshes its live feed about once a
  // minute while we poll every five, so a poll can read back a reading we
  // already stored — and two schedulers firing together makes that likelier
  // still. Storing the same (section, upstream timestamp) twice would
  // overweight that moment when the baseline percentiles are computed, which
  // is a quiet way to corrupt the one thing M0 exists to produce. The index
  // doubles as the lookup index for baseline queries.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS traffic_snapshot_section_ts_key
      ON traffic_snapshot (section_id, ts)
  `;

  // Every attempt, not just the ones that stored something. Without this, a
  // collector that is running fine but reading unchanged upstream data is
  // indistinguishable from one that died: both simply stop adding rows to
  // traffic_snapshot. Knowing which is which is the difference between "leave
  // it alone" and "the collection is broken, fix it now".
  await sql`
    CREATE TABLE IF NOT EXISTS collection_run (
      id BIGSERIAL PRIMARY KEY,
      ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      source TEXT NOT NULL,
      fetched INT NOT NULL,
      inserted INT NOT NULL,
      duplicates INT NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS collection_run_ran_at_idx ON collection_run (ran_at)
  `;

  // PRD §9's Baseline: the normal travel-time distribution per section, per
  // day of week, per 15-minute bucket. This is what "今天跟平常不一樣" is
  // measured against, so `sample_size` is stored alongside the percentiles —
  // a P90 computed from three readings is a number, but not an answer, and
  // the consumer has to be able to tell the difference.
  await sql`
    CREATE TABLE IF NOT EXISTS baseline (
      section_id   TEXT NOT NULL,
      dow          SMALLINT NOT NULL,
      bucket       SMALLINT NOT NULL,
      p50          DOUBLE PRECISION NOT NULL,
      p75          DOUBLE PRECISION NOT NULL,
      p90          DOUBLE PRECISION NOT NULL,
      sample_size  INT NOT NULL,
      computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (section_id, dow, bucket)
    )
  `;
}

/** Records one collection attempt, whatever it managed to store. */
export async function recordCollectionRun(run: {
  source: string;
  fetched: number;
  inserted: number;
  duplicates: number;
}): Promise<void> {
  const sql = requireSql();
  await sql`
    INSERT INTO collection_run (source, fetched, inserted, duplicates)
    VALUES (${run.source}, ${run.fetched}, ${run.inserted}, ${run.duplicates})
  `;
}

export interface SnapshotRow {
  sectionId: string;
  sectionName: string;
  source: string;
  travelMinutes: number;
  speedKmh?: number;
  /** Upstream-reported timestamp; falls back to the fetch time when the row is built. */
  ts: string;
}

export interface InsertResult {
  /** Rows actually stored. */
  inserted: number;
  /** Rows dropped as already-seen (same section, same upstream timestamp). */
  duplicates: number;
}

/**
 * Inserts every row in one statement — cron runs are small batches (tens of
 * rows), not a stream. Re-reading a snapshot TDX hasn't refreshed yet is
 * normal and not an error, so those rows are dropped silently; the count is
 * returned so a caller can tell "nothing new upstream" apart from "the
 * collector is broken", which look identical from the row count alone.
 */
export async function insertSnapshots(rows: SnapshotRow[]): Promise<InsertResult> {
  if (rows.length === 0) return { inserted: 0, duplicates: 0 };
  const sql = requireSql();

  const sectionIds = rows.map((r) => r.sectionId);
  const sectionNames = rows.map((r) => r.sectionName);
  const sources = rows.map((r) => r.source);
  const travelMinutes = rows.map((r) => r.travelMinutes);
  const speedKmh = rows.map((r) => r.speedKmh ?? null);
  const ts = rows.map((r) => r.ts);

  const stored = await sql`
    INSERT INTO traffic_snapshot (section_id, section_name, source, travel_minutes, speed_kmh, ts)
    SELECT * FROM UNNEST(
      ${sectionIds}::text[],
      ${sectionNames}::text[],
      ${sources}::text[],
      ${travelMinutes}::double precision[],
      ${speedKmh}::double precision[],
      ${ts}::timestamptz[]
    )
    ON CONFLICT (section_id, ts) DO NOTHING
    RETURNING id
  `;
  const inserted = stored.length;
  return { inserted, duplicates: rows.length - inserted };
}
