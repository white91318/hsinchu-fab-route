import type { ConstructionNotice, ConstructionResult } from "@/lib/live/types";

const FETCH_TIMEOUT_MS = 8000;
/** Announcements are posted on a working-day cadence — 15 minutes is plenty fresh. */
const REVALIDATE_S = 900;

/**
 * 新竹市政府工務處「最新消息」列表（道路施工／交通管制公告）。
 *
 * Source page: https://publicworks.hsinchu.gov.tw/News.aspx?n=538&sms=8972
 *
 * This is an ASP.NET WebForms CMS page with no JSON API, so the list is
 * parsed out of the rendered HTML. The exact markup is NOT verifiable from
 * the dev sandbox (every *.tw domain is blocked by the egress policy here),
 * so the parser is deliberately structure-agnostic: it pulls every detail-page
 * anchor and looks for a date near it, rather than depending on a particular
 * table/class layout. `probe` reports what it actually saw so the selectors
 * can be tightened once we've seen one real response.
 *
 * If the markup changes or the fetch fails, this returns
 * `status: "unavailable"` and the UI simply omits the section — it never
 * invents a notice.
 */
export const CONSTRUCTION_LIST_URL =
  "https://publicworks.hsinchu.gov.tw/News.aspx?n=538&sms=8972";

const BASE_URL = "https://publicworks.hsinchu.gov.tw/";

/** Kept broad on purpose: the board carries more than road works. */
const RELEVANT_KEYWORDS = ["施工", "道路", "交通", "管制", "改道", "封閉", "維修", "工程", "車道"];

/** Today's date in Taiwan (UTC+8), as YYYY-MM-DD — the site publishes in local time. */
export function taipeiToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const DATE_RE = /(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})/g;

function toIsoDate(m: RegExpMatchArray): string | null {
  let year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  // A 2-3 digit year is a ROC year; 1911 + 115 = 2026.
  if (year < 1911) year += 1911;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Normalises the date formats these CMS pages use. Taiwanese government sites
 * print either a Gregorian date (2026-09-04, 2026/9/4) or a ROC-era one
 * (115-09-04, where 115 = 2026 - 1911). Returns the first date as YYYY-MM-DD,
 * or null.
 */
export function normaliseDate(raw: string): string | null {
  const m = new RegExp(DATE_RE.source).exec(raw);
  return m ? toIsoDate(m) : null;
}

/** Last date in the text — the one nearest a trailing anchor. */
function lastDate(raw: string): string | null {
  const all = [...raw.matchAll(DATE_RE)];
  for (let i = all.length - 1; i >= 0; i--) {
    const iso = toIsoDate(all[i]);
    if (iso) return iso;
  }
  return null;
}

/**
 * Bounds of the table row / list item containing an anchor. Dates must be read
 * within the row: a fixed character window around the anchor bleeds into the
 * neighbouring row and silently mislabels an older notice as today's.
 */
function rowBounds(body: string, anchorStart: number, anchorEnd: number) {
  const LOOKAROUND = 2000;
  const backFrom = Math.max(0, anchorStart - LOOKAROUND);
  const before = body.slice(backFrom, anchorStart);
  const openIdx = Math.max(before.lastIndexOf("<tr"), before.lastIndexOf("<li"));
  const start = openIdx >= 0 ? backFrom + openIdx : Math.max(0, anchorStart - 200);

  const after = body.slice(anchorEnd, anchorEnd + LOOKAROUND);
  const closers = [after.indexOf("</tr"), after.indexOf("</li")].filter((i) => i >= 0);
  const end = closers.length
    ? anchorEnd + Math.min(...closers)
    : Math.min(body.length, anchorEnd + 200);

  return { start, end };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));
}

function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function absoluteUrl(href: string): string {
  try {
    return new URL(decodeEntities(href), BASE_URL).toString();
  } catch {
    return CONSTRUCTION_LIST_URL;
  }
}

/**
 * Extracts notices from the list HTML. Exported so it can be unit-tested
 * against a captured page without touching the network.
 */
export function parseConstructionHtml(html: string, today = taipeiToday()): {
  notices: ConstructionNotice[];
  anchorCount: number;
} {
  // Drop scripts/styles first so their contents can't be mistaken for copy.
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");

  // Detail links on these CMS pages point at a *_Content.aspx page carrying
  // an item id; that's a far more stable signal than any class name.
  const anchorRe = /<a\b[^>]*href=["']([^"']*(?:Content|Detail)\.aspx[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;

  const notices: ConstructionNotice[] = [];
  const seen = new Set<string>();
  let anchorCount = 0;
  let match: RegExpExecArray | null;

  while ((match = anchorRe.exec(body)) !== null) {
    anchorCount += 1;
    const href = match[1];
    const title = stripTags(match[2]);
    if (!title || title.length < 4) continue;

    const url = absoluteUrl(href);
    if (seen.has(url)) continue;

    // The publication date sits in the same row as the title (usually the cell
    // before it). Read only within that row — a fixed window around the anchor
    // reaches into the neighbouring row and mislabels older notices as today's.
    const anchorEnd = match.index + match[0].length;
    const { start, end } = rowBounds(body, match.index, anchorEnd);
    const date =
      lastDate(stripTags(body.slice(start, match.index))) ??
      normaliseDate(stripTags(body.slice(anchorEnd, end)));

    seen.add(url);
    notices.push({ title, date, url, isToday: date === today });
  }

  const relevant = notices.filter((n) => RELEVANT_KEYWORDS.some((kw) => n.title.includes(kw)));
  // Keep everything if the keyword filter would empty the list — a board that
  // is entirely road works shouldn't disappear because of odd phrasing.
  return { notices: relevant.length > 0 ? relevant : notices, anchorCount };
}

export async function fetchConstructionNotices(): Promise<ConstructionResult> {
  const fetchedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(CONSTRUCTION_LIST_URL, {
      signal: controller.signal,
      headers: {
        // A plain server-side fetch with no UA is what some gov CDNs reject.
        "user-agent":
          "Mozilla/5.0 (compatible; hsinchu-fab-route/0.1; +https://github.com/white91318/hsinchu-fab-route)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "zh-TW,zh;q=0.9",
      },
      next: { revalidate: REVALIDATE_S },
    });
    if (!res.ok) {
      return {
        status: "unavailable",
        fetchedAt,
        notices: [],
        todayCount: 0,
        error: `HTTP ${res.status}`,
      };
    }

    const html = await res.text();
    const { notices, anchorCount } = parseConstructionHtml(html);
    const todayCount = notices.filter((n) => n.isToday).length;

    return {
      status: notices.length > 0 ? "ok" : "unavailable",
      fetchedAt,
      notices: notices.slice(0, 20),
      todayCount,
      error: notices.length > 0 ? undefined : "頁面讀得到,但解析不到任何公告項目(版面可能已改版)",
      probe: {
        htmlLength: html.length,
        anchorCount,
        sampleTitles: notices.slice(0, 5).map((n) => n.title),
      },
    };
  } catch (err) {
    return {
      status: "unavailable",
      fetchedAt,
      notices: [],
      todayCount: 0,
      error: err instanceof Error ? err.message : "request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
