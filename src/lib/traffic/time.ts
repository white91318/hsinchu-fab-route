export function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function isWeekdayNow(): boolean {
  const d = new Date().getDay();
  return d >= 1 && d <= 5;
}

export function fmtMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return String(h).padStart(2, "0") + ":" + String(mm).padStart(2, "0");
}

export function hourFloat(m: number): number {
  return m / 60;
}
