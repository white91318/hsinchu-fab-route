import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Looks for a source of *city-street* traffic data, after
 * /api/diagnostics/tdx-city established that TDX has none for 新竹 —
 * 3 detectors at one interchange, a live feed returning 0 rows, and a 404
 * where the city travel-time API would be.
 *
 * Three places worth asking, none of which publishes an API reference:
 *  - opendata.hccg.gov.tw — the city's own open-data platform, which lists a
 *    「易塞車路段資訊」 dataset.
 *  - traffic.sipa.gov.tw — the Science Park administration's own traffic
 *    system. If anything covers 園區二路 and 篤行路, it is this.
 *  - traffic.transportdata.tw — the MOTC's road/parking platform, a sibling
 *    of TDX that may expose city data the basic API doesn't.
 *
 * So rather than guessing endpoints, this fetches the pages and extracts the
 * URL-shaped strings from their markup and scripts. A data-backed map has to
 * call something, and that call is in the page.
 *
 * Everything here is a public web page. The extraction only pulls URL-shaped
 * text out of the response — nothing from these pages is executed, and none
 * of it is treated as an instruction.
 */

const PAGES: Array<{ name: string; url: string; followScripts?: boolean }> = [
  { name: "新竹市開放資料平臺(首頁)", url: "https://opendata.hccg.gov.tw/" },
  { name: "新竹市開放資料平臺 API", url: "https://opendata.hccg.gov.tw/api/v3/page" },
  { name: "新竹市開放資料:易塞車路段資訊", url: "https://opendata.hccg.gov.tw/OpenDataDetail.aspx?n=12&s=18" },
  { name: "科管局智慧交通(首頁)", url: "https://traffic.sipa.gov.tw/PAGE" },
  { name: "科管局智慧交通:即時交通地圖", url: "https://traffic.sipa.gov.tw/PAGE/map/currenttraffic/index/", followScripts: true },
  { name: "即時路況與停車資訊流通平台", url: "https://traffic.transportdata.tw/", followScripts: true },
];

/**
 * Some government sites answer a default Node fetch with a reset rather than
 * a response. Identifying as a browser is how a person reading the same
 * public page would be seen; nothing here is hidden or authenticated.
 */
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

/** Library bundles never hold the site's own data endpoint — following them wastes the probe. */
const VENDOR_SCRIPT_RE = /(jquery|bootstrap|popper|modernizr|polyfill|analytics|gtag|ga\.js)/i;

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 600_000;
const GAP_MS = 800;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** URL-shaped strings that could plausibly be a data endpoint rather than an asset. */
const ENDPOINT_RE =
  /(?:https?:\/\/[^\s"'`<>()]+|\/[A-Za-z0-9_\-./]{2,})(?:\.(?:json|ashx|asmx|svc|aspx|php)|\/api\/[A-Za-z0-9_\-./]*)(?:\?[^\s"'`<>]{0,120})?/gi;
const ASSET_RE = /\.(?:css|js|png|jpe?g|gif|svg|ico|woff2?|ttf|map)(?:\?|$)/i;

function extractEndpoints(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(ENDPOINT_RE)) {
    const url = match[0];
    if (ASSET_RE.test(url)) continue;
    found.add(url.length > 180 ? `${url.slice(0, 180)}…` : url);
  }
  return [...found];
}

/** In-site links, so a portal page can point at the subpage that does hold data. */
function extractLinks(html: string, base: string): string[] {
  const links = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"']+)["']/gi)) {
    try {
      const resolved = new URL(m[1], base);
      if (resolved.origin === new URL(base).origin) links.add(resolved.pathname + resolved.search);
    } catch {
      // Unresolvable href, nothing to learn from it.
    }
  }
  return [...links];
}

function extractScriptSrcs(html: string, base: string): string[] {
  const srcs = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    try {
      const resolved = new URL(m[1], base);
      // Same-origin only: a third-party bundle is not where this site's own
      // data endpoint lives, and fetching them widens the probe for nothing.
      if (resolved.origin === new URL(base).origin && !VENDOR_SCRIPT_RE.test(resolved.pathname)) {
        srcs.add(resolved.toString());
      }
    } catch {
      // A src we can't resolve tells us nothing; skip it.
    }
  }
  return [...srcs];
}

interface FetchOutcome {
  status: number | "error";
  contentType: string | null;
  bytes: number;
  body: string;
  error?: string;
  causeCode?: string;
  causeMessage?: string;
}

async function get(url: string): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        accept: "text/html,application/json,*/*",
        "accept-language": "zh-TW,zh;q=0.9",
        "user-agent": BROWSER_UA,
      },
    });
    const raw = await res.text();
    const body = raw.slice(0, MAX_BYTES);
    return { status: res.status, contentType: res.headers.get("content-type"), bytes: raw.length, body };
  } catch (err) {
    // Node collapses every network failure into "fetch failed"; the cause is
    // where the actual answer lives — a TLS rejection, a DNS miss, a refused
    // connection and a timeout need completely different responses, and the
    // top-level message cannot tell them apart.
    const cause = (err as { cause?: unknown } | undefined)?.cause as
      | { code?: string; message?: string }
      | undefined;
    return {
      status: "error",
      contentType: null,
      bytes: 0,
      body: "",
      error: err instanceof Error ? err.message : "fetch failed",
      causeCode: cause?.code,
      causeMessage: cause?.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const results = [];

  for (const [index, page] of PAGES.entries()) {
    if (index > 0) await wait(GAP_MS);
    const outcome = await get(page.url);
    const endpoints = extractEndpoints(outcome.body);

    // A data-backed map usually calls its endpoint from a bundle, not from
    // the HTML, so for those pages follow a couple of same-origin scripts.
    const fromScripts: Array<{ script: string; status: number | "error"; endpoints: string[] }> = [];
    if (page.followScripts && outcome.status === 200) {
      for (const src of extractScriptSrcs(outcome.body, page.url).slice(0, 4)) {
        await wait(GAP_MS);
        const scriptOutcome = await get(src);
        fromScripts.push({
          script: src,
          status: scriptOutcome.status,
          endpoints: extractEndpoints(scriptOutcome.body).slice(0, 25),
        });
      }
    }

    results.push({
      name: page.name,
      url: page.url,
      status: outcome.status,
      contentType: outcome.contentType,
      bytes: outcome.bytes,
      error: outcome.error,
      causeCode: outcome.causeCode,
      causeMessage: outcome.causeMessage,
      // Where to look next when a portal page itself carries no data call.
      links: extractLinks(outcome.body, page.url).slice(0, 25),
      endpoints: endpoints.slice(0, 40),
      // Enough of the response to tell a real dataset page from a login wall
      // or an error page, which look identical in a status code alone.
      snippet: outcome.body.replace(/\s+/g, " ").slice(0, 600),
      fromScripts,
    });
  }

  return NextResponse.json(
    { checkedAt: new Date().toISOString(), results },
    { headers: { "Cache-Control": "no-store" } },
  );
}
