import type { CandidateDataset } from "@/lib/live/types";

const FETCH_TIMEOUT_MS = 6000;

/**
 * Hsinchu City open-data platform (opendata.hccg.gov.tw) — diagnostic search only.
 *
 * PRD §7 already flags city/park road data as "待確認資料集與頻率" (dataset and
 * update frequency unconfirmed) — there is no known confirmed live traffic
 * dataset for city roads yet, so this does NOT attempt to overlay any segment
 * data. It searches the portal's dataset catalog (CKAN's standard
 * `package_search` action) for traffic-related datasets and reports what it
 * finds, so a human can decide which (if any) are worth wiring up next.
 *
 * CONFIRMED UNREACHABLE from this deployment (tested live, not a guess):
 * opendata.hccg.gov.tw — and every other *.hccg.gov.tw host, including the
 * one that actually hosts the "新竹市易塞車路段資訊" dataset's files
 * (odws.hccg.gov.tw) — returned a connection-level "fetch failed" from both
 * a US-East and a Tokyo Vercel region. These Hsinchu city domains appear to
 * block cloud/datacenter IPs outright. Separately, dep-traffic.hccg.gov.tw
 * (the "最新消息" page that actually carries construction announcements) IS
 * reachable but sits behind a Cloudflare JS challenge that blocks a plain
 * server-side fetch. Bottom line: no city-road or construction data is
 * gettable from this hosting setup without a fundamentally different
 * approach (a Taiwan-based fetcher, or a headless-browser solve of the
 * Cloudflare challenge — not attempted here). This function is left in
 * place because it fails closed exactly like everything else in src/lib/live,
 * not because it's expected to succeed.
 */
const SEARCH_URL =
  "https://opendata.hccg.gov.tw/api/3/action/package_search?q=%E8%B7%AF%E6%B3%81+%E4%BA%A4%E9%80%9A+%E8%BB%8A%E6%B5%81+%E6%96%BD%E5%B7%A5&rows=15";

interface CkanPackage {
  title?: string;
  name?: string;
  notes?: string;
}

interface CkanSearchResponse {
  success?: boolean;
  result?: { results?: CkanPackage[] };
}

export async function findCityTrafficDatasets(): Promise<{
  status: "candidates-found" | "no-candidates" | "unavailable";
  candidateDatasets: CandidateDataset[];
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(SEARCH_URL, {
      signal: controller.signal,
      headers: { "User-Agent": "hsinchu-fab-route/0.1 (POC; +https://github.com/white91318/hsinchu-fab-route)" },
      // The dataset catalog barely changes — cache the search for an hour.
      next: { revalidate: 3600 },
    });
    clearTimeout(timer);
    if (!res.ok) {
      return { status: "unavailable", candidateDatasets: [], error: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as CkanSearchResponse;
    const results = body.result?.results ?? [];
    const candidateDatasets: CandidateDataset[] = results
      .filter((p) => p.name)
      .map((p) => ({
        title: p.title ?? p.name ?? "(未命名資料集)",
        url: `https://opendata.hccg.gov.tw/dataset/${p.name}`,
      }));
    return {
      status: candidateDatasets.length > 0 ? "candidates-found" : "no-candidates",
      candidateDatasets,
    };
  } catch (err) {
    return {
      status: "unavailable",
      candidateDatasets: [],
      error: err instanceof Error ? err.message : "request failed",
    };
  }
}
