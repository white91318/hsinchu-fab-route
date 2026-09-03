import type { CandidateDataset } from "@/lib/live/types";

const FETCH_TIMEOUT_MS = 6000;

/**
 * Hsinchu City open-data platform (opendata.hccg.gov.tw) — diagnostic search only.
 *
 * PRD §7 already flags city/park road data as "待確認資料集與頻率" (dataset and
 * update frequency unconfirmed) — there is no known confirmed live traffic
 * dataset for city roads yet, so this does NOT attempt to overlay any segment
 * data. It searches the portal's dataset catalog (CKAN's standard
 * `package_search` action, the same API path data.gov.tw and most Taiwanese
 * city open-data portals use) for traffic-related datasets and reports what
 * it finds, so a human can decide which (if any) are worth wiring up next.
 *
 * UNVERIFIED like the freeway client: this session's sandbox blocks
 * opendata.hccg.gov.tw, so the CKAN assumption itself hasn't been confirmed
 * live. If the portal isn't CKAN-based this will just fail closed (empty
 * candidate list, health "unavailable") — never throws.
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
