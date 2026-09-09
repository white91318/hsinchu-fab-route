import { NextResponse } from "next/server";

import { fetchWithChainRepair } from "@/lib/net/chainRepair";

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
  // The city platform itself. Repeated across hosts and over plain HTTP,
  // because "this one host is down" and "the whole domain refuses traffic
  // from outside Taiwan" call for completely different responses, and a
  // single timeout cannot tell them apart.
  { name: "新竹市開放資料平臺", url: "https://opendata.hccg.gov.tw/" },
  { name: "新竹市開放資料平臺(HTTP)", url: "http://opendata.hccg.gov.tw/" },
  { name: "新竹市政府(主網站)", url: "https://www.hccg.gov.tw/" },
  { name: "新竹市交通處", url: "https://dep-traffic.hccg.gov.tw/" },

  // The national platform mirrors city datasets, and unlike the city's own
  // servers it is demonstrably reachable from here. If 新竹市's traffic data
  // is listed nationally, the region problem stops mattering.
  { name: "data.gov.tw 搜尋:新竹市 路況", url: "https://data.gov.tw/api/v2/rest/dataset?q=%E6%96%B0%E7%AB%B9%E5%B8%82%20%E8%B7%AF%E6%B3%81" },
  { name: "data.gov.tw 搜尋:新竹市 交通", url: "https://data.gov.tw/api/v2/rest/dataset?q=%E6%96%B0%E7%AB%B9%E5%B8%82%20%E4%BA%A4%E9%80%9A" },
  { name: "data.gov.tw 搜尋:易塞車", url: "https://data.gov.tw/api/v2/rest/dataset?q=%E6%98%93%E5%A1%9E%E8%BB%8A" },
];

/** Hosts whose certificate chain we want described rather than trusted (see certificateReport). */
const TLS_INSPECT_HOSTS = ["traffic.sipa.gov.tw"];

/**
 * Some government sites answer a default Node fetch with a reset rather than
 * a response. Identifying as a browser is how a person reading the same
 * public page would be seen; nothing here is hidden or authenticated.
 */
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

/** Library bundles never hold the site's own data endpoint — following them wastes the probe. */
const VENDOR_SCRIPT_RE = /(jquery|bootstrap|popper|modernizr|polyfill|analytics|gtag|ga\.js)/i;

const FETCH_TIMEOUT_MS = 20_000;
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

/**
 * Describes the certificate a host presents, without trusting it and without
 * reading any content over that connection.
 *
 * traffic.sipa.gov.tw failed with UNABLE_TO_VERIFY_LEAF_SIGNATURE, which does
 * not mean the site is untrustworthy — it means the server omitted the
 * intermediate certificate from the chain it sends, a very common
 * misconfiguration. The fix is to supply that intermediate ourselves and keep
 * verification fully on, and to do that we need to know which CA issued the
 * leaf and where that CA's certificate is published (the AIA extension).
 *
 * The socket below is opened only to read the certificate and is destroyed
 * immediately; nothing is fetched through it. Reading a certificate is not
 * trusting it, and no request here is ever made with verification disabled.
 */
async function certificateReport(host: string) {
  const tls = await import("node:tls");
  return new Promise<Record<string, unknown>>((resolve) => {
    const socket = tls.connect(
      { host, port: 443, servername: host, rejectUnauthorized: false, timeout: 10_000 },
      () => {
        const cert = socket.getPeerCertificate(true) as unknown as Record<string, unknown> & {
          issuerCertificate?: Record<string, unknown>;
          infoAccess?: Record<string, string[]>;
        };
        const chain: string[] = [];
        let node: typeof cert | undefined = cert;
        const seen = new Set<string>();
        while (node && !seen.has(String(node.fingerprint))) {
          seen.add(String(node.fingerprint));
          const subject = node.subject as Record<string, string> | undefined;
          chain.push(subject?.CN ?? JSON.stringify(subject ?? {}));
          node = node.issuerCertificate as typeof cert | undefined;
        }
        const issuer = cert.issuer as Record<string, string> | undefined;
        resolve({
          host,
          subjectCN: (cert.subject as Record<string, string> | undefined)?.CN,
          issuerCN: issuer?.CN,
          issuerO: issuer?.O,
          validTo: cert.valid_to,
          chainSent: chain,
          // Where the missing intermediate can be downloaded from. Certificates
          // are self-authenticating, so plain HTTP is the normal way to fetch one.
          caIssuers: cert.infoAccess?.["CA Issuers - URI"] ?? null,
        });
        socket.destroy();
      },
    );
    socket.on("timeout", () => {
      resolve({ host, error: "TLS connect timeout" });
      socket.destroy();
    });
    socket.on("error", (err: Error) => resolve({ host, error: err.message }));
  });
}

/**
 * data.gov.tw answered "Method not allowed. Must be one of: POST" — the
 * endpoint is there and reachable, we just asked wrongly. This matters more
 * than it sounds: the city's own platform refuses connections entirely, so
 * the national mirror is the only route to a 新竹市 dataset from a server.
 */
async function probeDataGovTw() {
  const attempts: Array<{ method: string; url: string; body?: string }> = [
    { method: "POST", url: "https://data.gov.tw/api/v2/rest/dataset", body: JSON.stringify({ q: "新竹市 路況" }) },
    { method: "POST", url: "https://data.gov.tw/api/v2/rest/dataset", body: JSON.stringify({ keyword: "易塞車" }) },
    { method: "GET", url: "https://data.gov.tw/api/v1/rest/dataset?q=%E6%96%B0%E7%AB%B9%E5%B8%82%20%E8%B7%AF%E6%B3%81" },
    { method: "GET", url: "https://data.gov.tw/api/v1/rest/dataset/166031" },
  ];

  const out = [];
  for (const attempt of attempts) {
    await wait(GAP_MS);
    try {
      const res = await fetch(attempt.url, {
        method: attempt.method,
        cache: "no-store",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "user-agent": BROWSER_UA,
        },
        body: attempt.body,
      });
      const text = (await res.text()).slice(0, MAX_BYTES);
      out.push({
        method: attempt.method,
        url: attempt.url,
        status: res.status,
        contentType: res.headers.get("content-type"),
        bytes: text.length,
        snippet: text.replace(/\s+/g, " ").slice(0, 900),
      });
    } catch (err) {
      out.push({
        method: attempt.method,
        url: attempt.url,
        status: "error" as const,
        contentType: null,
        bytes: 0,
        snippet: err instanceof Error ? err.message : "fetch failed",
      });
    }
  }
  return out;
}

/**
 * The Science Park administration's traffic system, reached through the
 * repaired certificate chain. This is the one host that might carry 園區二路
 * and 篤行路 — the roads TDX has nothing for.
 */
async function probeSipa() {
  const pageUrl = "https://traffic.sipa.gov.tw/PAGE/map/currenttraffic/index/";
  try {
    const page = await fetchWithChainRepair(pageUrl, {
      headers: { accept: "text/html,*/*", "accept-language": "zh-TW,zh;q=0.9", "user-agent": BROWSER_UA },
    });
    const scripts = extractScriptSrcs(page.body, pageUrl).slice(0, 4);
    const fromScripts = [];
    for (const src of scripts) {
      await wait(GAP_MS);
      try {
        const js = await fetchWithChainRepair(src, { headers: { "user-agent": BROWSER_UA } });
        fromScripts.push({ script: src, status: js.status, endpoints: extractEndpoints(js.body).slice(0, 30) });
      } catch (err) {
        fromScripts.push({
          script: src,
          status: "error" as const,
          endpoints: [],
          error: err instanceof Error ? err.message : "fetch failed",
        });
      }
    }
    return {
      url: pageUrl,
      chainRepair: "ok",
      status: page.status,
      contentType: page.contentType,
      bytes: page.body.length,
      links: extractLinks(page.body, pageUrl).slice(0, 30),
      endpoints: extractEndpoints(page.body).slice(0, 40),
      snippet: page.body.replace(/\s+/g, " ").slice(0, 700),
      fromScripts,
    };
  } catch (err) {
    return {
      url: pageUrl,
      chainRepair: "failed",
      error: err instanceof Error ? err.message : "fetch failed",
    };
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

  const dataGovTw = await probeDataGovTw();
  const sipa = await probeSipa();

  const certificates = [];
  for (const host of TLS_INSPECT_HOSTS) {
    certificates.push(await certificateReport(host));
  }

  return NextResponse.json(
    { checkedAt: new Date().toISOString(), results, dataGovTw, sipa, certificates },
    { headers: { "Cache-Control": "no-store" } },
  );
}
