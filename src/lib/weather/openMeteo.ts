import type { WeatherReading, WeatherResult, WeatherState } from "@/lib/weather/types";

const FETCH_TIMEOUT_MS = 6000;
/** Weather moves slowly next to traffic; ten minutes is fresh enough and stays polite. */
const REVALIDATE_S = 600;

/** Hsinchu Science Park, roughly the 新安路 main gate. */
const LATITUDE = 24.7736;
const LONGITUDE = 121.0177;

/**
 * Open-Meteo — no API key, no attribution requirement for non-commercial use,
 * and (unlike every *.hsinchu.gov.tw host) actually reachable from Vercel:
 * measured at 117ms from iad1. The CWA (中央氣象署) API is reachable too and
 * would be the authoritative Taiwanese source, but it needs a free key; this
 * module is written so swapping the source only means replacing `fetchWeather`.
 */
export const OPEN_METEO_URL =
  `https://api.open-meteo.com/v1/forecast?latitude=${LATITUDE}&longitude=${LONGITUDE}` +
  "&current=temperature_2m,precipitation,weather_code,is_day&timezone=Asia%2FTaipei";

/**
 * WMO 4677 present-weather codes, grouped into the three backdrops.
 *
 * Snow (71-77, 85-86) is grouped with rain: it effectively never falls at sea
 * level in Hsinchu, and if it somehow did, "there is stuff coming out of the
 * sky" is the right thing to show a commuter.
 */
const RAIN_CODES = new Set([
  51, 53, 55, 56, 57, // drizzle, incl. freezing
  61, 63, 65, 66, 67, // rain, incl. freezing
  71, 73, 75, 77, // snow
  80, 81, 82, // rain showers
  85, 86, // snow showers
  95, 96, 99, // thunderstorm
]);
const CLOUDY_CODES = new Set([3, 45, 48]); // overcast, fog, depositing rime fog
const CLEAR_CODES = new Set([0, 1, 2]); // clear, mainly clear, partly cloudy

const CODE_DESCRIPTIONS: Record<number, string> = {
  0: "晴朗",
  1: "大致晴朗",
  2: "多雲時晴",
  3: "陰天",
  45: "有霧",
  48: "霧淞",
  51: "毛毛雨",
  53: "毛毛雨",
  55: "強毛毛雨",
  56: "凍毛毛雨",
  57: "強凍毛毛雨",
  61: "小雨",
  63: "中雨",
  65: "大雨",
  66: "凍雨",
  67: "強凍雨",
  71: "小雪",
  73: "中雪",
  75: "大雪",
  77: "雪珠",
  80: "陣雨",
  81: "強陣雨",
  82: "劇烈陣雨",
  85: "陣雪",
  86: "強陣雪",
  95: "雷雨",
  96: "雷雨夾冰雹",
  99: "強雷雨夾冰雹",
};

/**
 * Maps a WMO code to a backdrop. An unknown code falls back to "cloudy" — the
 * neutral one — rather than guessing sunshine or rain from a code we don't
 * recognise.
 */
export function stateFromWmoCode(code: number): WeatherState {
  if (RAIN_CODES.has(code)) return "rain";
  if (CLEAR_CODES.has(code)) return "clear";
  if (CLOUDY_CODES.has(code)) return "cloudy";
  return "cloudy";
}

export function describeWmoCode(code: number): string {
  return CODE_DESCRIPTIONS[code] ?? "天氣不明";
}

interface OpenMeteoResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    precipitation?: number;
    weather_code?: number;
    is_day?: number;
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Exported for testing: turns a parsed payload into a reading, or null if unusable. */
export function readingFromPayload(payload: unknown, fetchedAt: string): WeatherReading | null {
  const current = (payload as OpenMeteoResponse | null)?.current;
  if (!current) return null;

  const code = num(current.weather_code);
  // Without a weather code there is no state to pick, and inventing one would
  // put a sunny sky over a rainy commute.
  if (code === null) return null;

  return {
    state: stateFromWmoCode(code),
    code,
    description: describeWmoCode(code),
    temperatureC: num(current.temperature_2m),
    precipitationMm: num(current.precipitation),
    isDay: current.is_day !== 0,
    observedAt: typeof current.time === "string" ? current.time : fetchedAt,
  };
}

/**
 * Never throws. On any failure the caller keeps whatever backdrop is already
 * showing rather than snapping to a default — same contract as the traffic
 * sources.
 */
export async function fetchWeather(): Promise<WeatherResult> {
  const fetchedAt = new Date().toISOString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(OPEN_METEO_URL, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      next: { revalidate: REVALIDATE_S },
    });
    if (!res.ok) {
      return { status: "unavailable", fetchedAt, error: `HTTP ${res.status}` };
    }
    const reading = readingFromPayload(await res.json(), fetchedAt);
    if (!reading) {
      return { status: "unavailable", fetchedAt, error: "回應中沒有可用的天氣代碼" };
    }
    return { status: "ok", fetchedAt, reading };
  } catch (err) {
    return {
      status: "unavailable",
      fetchedAt,
      error: err instanceof Error ? err.message : "request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
