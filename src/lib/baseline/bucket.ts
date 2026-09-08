/**
 * The (day-of-week × 15-minute) grid a baseline is computed on (PRD §9).
 *
 * Everything here is in **Asia/Taipei**, and that is not a formatting
 * preference. The buckets exist to answer "is this slower than a normal
 * Tuesday 08:00 here", so bucketing in UTC would shift every reading by eight
 * hours: Taipei's 00:00–08:00 would be filed under the *previous* weekday, so
 * Monday's pre-dawn hours would land in Sunday's bucket and the Monday
 * morning peak would be compared against a mixture that includes weekend
 * traffic. The comparison would be quietly wrong rather than obviously
 * broken, which is the worst kind.
 */

export const BUCKET_MINUTES = 15;
export const BUCKETS_PER_DAY = (24 * 60) / BUCKET_MINUTES; // 96

export interface BucketKey {
  /** ISO day of week: 1 = Monday … 7 = Sunday, matching Postgres' ISODOW. */
  dow: number;
  /** Index of the 15-minute slot within the local day: 0 = 00:00, 95 = 23:45. */
  bucket: number;
}

const TAIPEI_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // h23, not h12 and not the default: some runtimes render midnight as "24"
  // under hour12:false, which would silently produce bucket 96.
  hourCycle: "h23",
});

function taipeiFields(at: Date) {
  const parts = TAIPEI_PARTS.formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

/**
 * Which baseline bucket a moment belongs to, as the Postgres batch would
 * compute it. Having this in TypeScript as well is deliberate: the batch does
 * the bucketing in SQL, and a consumer that wants "the baseline for right
 * now" has to derive the same key. Two implementations of the same rule is a
 * risk, so `scripts/parser-checks.mjs` pins the boundaries this one produces.
 */
export function taipeiBucket(at: Date): BucketKey {
  const { year, month, day, hour, minute } = taipeiFields(at);
  // Reconstructing the local calendar date as UTC is the safe way to get its
  // weekday: getUTCDay() on it reads the Taipei date, not the runtime's.
  const jsDow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sunday
  return {
    dow: jsDow === 0 ? 7 : jsDow,
    bucket: hour * (60 / BUCKET_MINUTES) + Math.floor(minute / BUCKET_MINUTES),
  };
}

/** "07:45" — the local start time of a bucket, for message copy and diagnostics. */
export function bucketLabel(bucket: number): string {
  const minutesFromMidnight = bucket * BUCKET_MINUTES;
  const hh = String(Math.floor(minutesFromMidnight / 60)).padStart(2, "0");
  const mm = String(minutesFromMidnight % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

const DOW_LABELS = ["", "週一", "週二", "週三", "週四", "週五", "週六", "週日"];

export function dowLabel(dow: number): string {
  return DOW_LABELS[dow] ?? `週?(${dow})`;
}
