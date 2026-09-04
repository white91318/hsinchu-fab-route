/** The three backdrops the map can wear. */
export type WeatherState = "rain" | "cloudy" | "clear";

export interface WeatherReading {
  state: WeatherState;
  /** WMO code the state was derived from, kept so the UI can name the weather. */
  code: number;
  /** Human-readable Chinese description of that code. */
  description: string;
  temperatureC: number | null;
  /** Precipitation in the last interval, mm. */
  precipitationMm: number | null;
  isDay: boolean;
  /** Local (Asia/Taipei) observation time as reported upstream. */
  observedAt: string;
}

export type WeatherResult =
  | { status: "ok"; fetchedAt: string; reading: WeatherReading }
  | { status: "unavailable"; fetchedAt: string; error: string };
