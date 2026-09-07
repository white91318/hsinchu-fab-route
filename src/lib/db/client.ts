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
  await sql`
    CREATE INDEX IF NOT EXISTS traffic_snapshot_section_ts_idx
      ON traffic_snapshot (section_id, ts)
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

/** Inserts every row in one statement — cron runs are small batches (tens of rows), not a stream. */
export async function insertSnapshots(rows: SnapshotRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const sql = requireSql();

  const sectionIds = rows.map((r) => r.sectionId);
  const sectionNames = rows.map((r) => r.sectionName);
  const sources = rows.map((r) => r.source);
  const travelMinutes = rows.map((r) => r.travelMinutes);
  const speedKmh = rows.map((r) => r.speedKmh ?? null);
  const ts = rows.map((r) => r.ts);

  await sql`
    INSERT INTO traffic_snapshot (section_id, section_name, source, travel_minutes, speed_kmh, ts)
    SELECT * FROM UNNEST(
      ${sectionIds}::text[],
      ${sectionNames}::text[],
      ${sources}::text[],
      ${travelMinutes}::double precision[],
      ${speedKmh}::double precision[],
      ${ts}::timestamptz[]
    )
  `;
  return rows.length;
}
