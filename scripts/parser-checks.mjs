/**
 * Parser checks for the two live-data sources.
 *
 * Neither TDX nor publicworks.hsinchu.gov.tw is reachable from the dev
 * sandbox (every *.tw domain is blocked by its egress policy), so these
 * exercise the parsing/matching logic against synthetic payloads shaped like
 * each documented/plausible response. They prove the parser handles both the
 * bare-array and enveloped forms and both date conventions — they do NOT
 * prove the real payloads look like this. That check happens against
 * /api/diagnostics on a real deployment.
 *
 * Run: npm run check:parsers   (from the repo root)
 */
import assert from "node:assert/strict";

import { FREEWAY_SEGMENT_MATCHERS } from "../src/lib/live/freewayConfig.ts";
import {
  normaliseDate,
  parseConstructionHtml,
  taipeiToday,
} from "../src/lib/live/constructionClient.ts";
import {
  matchesSegment,
  sectionDescriptiveText,
  unwrapRecords,
} from "../src/lib/live/tdx/freeway.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("TDX payload shape handling");

check("bare array is unwrapped", () => {
  assert.equal(unwrapRecords([{ SectionID: "a" }, { SectionID: "b" }]).length, 2);
});

check("enveloped array is unwrapped (unknown wrapper key)", () => {
  const payload = { UpdateTime: "2026-09-04T08:00:00+08:00", LiveTraffics: [{ SectionID: "a" }] };
  assert.equal(unwrapRecords(payload).length, 1);
});

check("longest array wins over incidental ones", () => {
  const payload = { Notes: [{ SectionID: "x" }], Sections: [{ SectionID: "a" }, { SectionID: "b" }] };
  assert.equal(unwrapRecords(payload).length, 2);
});

check("garbage yields no records rather than throwing", () => {
  assert.deepEqual(unwrapRecords(null), []);
  assert.deepEqual(unwrapRecords("nope"), []);
  assert.deepEqual(unwrapRecords({ a: 1 }), []);
});

check("nested RoadSection {Start,End} is flattened into matchable text", () => {
  const text = sectionDescriptiveText({ RoadSection: { Start: "竹北", End: "新竹" } });
  assert.ok(text.includes("竹北") && text.includes("新竹"), text);
});

console.log("Freeway segment matching");

check("竹北—新竹 matches N1_MID", () => {
  assert.equal(matchesSegment("竹北 | 新竹", FREEWAY_SEGMENT_MATCHERS.N1_MID), true);
});

check("新竹—新竹系統 does NOT match N1_MID (prefix trap)", () => {
  assert.equal(matchesSegment("新竹 | 新竹系統", FREEWAY_SEGMENT_MATCHERS.N1_MID), true === false);
});

check("新竹—新竹系統 matches N1_SOUTH", () => {
  assert.equal(matchesSegment("新竹 | 新竹系統", FREEWAY_SEGMENT_MATCHERS.N1_SOUTH), true);
});

check("湖口—竹北 matches N1_NORTH", () => {
  assert.equal(matchesSegment("湖口 | 竹北", FREEWAY_SEGMENT_MATCHERS.N1_NORTH), true);
});

check("新竹系統—竹南 matches N3_ZHUNAN", () => {
  assert.equal(matchesSegment("新竹系統 | 竹南", FREEWAY_SEGMENT_MATCHERS.N3_ZHUNAN), true);
});

check("an unrelated section matches nothing", () => {
  const anyMatch = Object.values(FREEWAY_SEGMENT_MATCHERS).some((m) =>
    matchesSegment("台北 | 基隆", m),
  );
  assert.equal(anyMatch, false);
});

console.log("Construction date normalisation");

check("Gregorian date", () => assert.equal(normaliseDate("公告 2026-09-04 施工"), "2026-09-04"));
check("slash separated", () => assert.equal(normaliseDate("2026/9/4"), "2026-09-04"));
check("ROC-era year is converted", () => assert.equal(normaliseDate("115-09-04"), "2026-09-04"));
check("no date yields null", () => assert.equal(normaliseDate("近期道路施工"), null));

console.log("Construction list parsing");

const today = taipeiToday();
const sampleHtml = `
<html><body>
<script>var x = "<a href='News_Content.aspx?n=1'>不該被當成公告</a>";</script>
<table class="Table_style">
  <tr><th>日期</th><th>標題</th></tr>
  <tr>
    <td>${today}</td>
    <td><a href="News_Content.aspx?n=538&amp;s=101">光復路二段道路施工交通管制公告</a></td>
  </tr>
  <tr>
    <td>2026-08-30</td>
    <td><a href="/News_Content.aspx?n=538&amp;s=102">園區三路車道封閉工程</a></td>
  </tr>
  <tr>
    <td>2026-08-28</td>
    <td><a href="News_Content.aspx?n=538&amp;s=103">市民活動中心報名須知</a></td>
  </tr>
</table>
</body></html>`;

const parsed = parseConstructionHtml(sampleHtml, today);

check("script contents are not parsed as notices", () => {
  assert.equal(
    parsed.notices.some((n) => n.title.includes("不該被當成公告")),
    false,
  );
});

check("road-works items are kept, unrelated ones filtered", () => {
  const titles = parsed.notices.map((n) => n.title);
  assert.ok(titles.some((t) => t.includes("光復路二段")), titles.join(" / "));
  assert.ok(titles.some((t) => t.includes("園區三路")), titles.join(" / "));
  assert.equal(titles.some((t) => t.includes("報名須知")), false);
});

check("today's item is flagged isToday", () => {
  const todays = parsed.notices.filter((n) => n.isToday);
  assert.equal(todays.length, 1);
  assert.ok(todays[0].title.includes("光復路二段"));
});

check("relative hrefs become absolute", () => {
  assert.ok(
    parsed.notices.every((n) => n.url.startsWith("https://publicworks.hsinchu.gov.tw/")),
    JSON.stringify(parsed.notices.map((n) => n.url)),
  );
});

check("HTML entities in titles/urls are decoded", () => {
  assert.ok(parsed.notices.every((n) => !n.title.includes("&amp;")));
  assert.ok(parsed.notices.some((n) => n.url.includes("s=101")));
});

check("markup we've never seen yields nothing rather than junk", () => {
  const { notices } = parseConstructionHtml("<html><body><p>沒有連結</p></body></html>", today);
  assert.deepEqual(notices, []);
});


console.log("Route label shortening");

const { pathLabel } = await import("../src/lib/routing/computePath.ts");

function fakePath(names) {
  return {
    segs: [],
    display: names.map((name, i) => ({ id: `S${i}`, name, level: "good", reason: "", minutes: 1, base: 1 })),
    total: 1,
    worst: {},
    edgeIds: [],
  };
}

check("full-width parenthetical is stripped", () => {
  assert.equal(pathLabel(fakePath(["力行路（園區主幹道）"])), "力行路");
});

check("half-width parenthetical is stripped too", () => {
  assert.equal(pathLabel(fakePath(["力行路(園區主幹道)"])), "力行路");
});

check("a name with no qualifier is left alone", () => {
  assert.equal(pathLabel(fakePath(["光復路"])), "光復路");
});

check("legs are joined with an arrow", () => {
  assert.equal(pathLabel(fakePath(["光復路", "新安路（施工中）"])), "光復路 → 新安路");
});

console.log("Weather state mapping");

const { stateFromWmoCode, readingFromPayload } = await import("../src/lib/weather/openMeteo.ts");

check("drizzle / rain / showers / thunderstorm are all rain", () => {
  for (const code of [51, 55, 61, 65, 80, 82, 95, 99]) {
    assert.equal(stateFromWmoCode(code), "rain", `code ${code}`);
  }
});

check("snow counts as rain (something is falling)", () => {
  for (const code of [71, 75, 85, 86]) {
    assert.equal(stateFromWmoCode(code), "rain", `code ${code}`);
  }
});

check("clear and partly cloudy are clear", () => {
  for (const code of [0, 1, 2]) {
    assert.equal(stateFromWmoCode(code), "clear", `code ${code}`);
  }
});

check("overcast and fog are cloudy", () => {
  for (const code of [3, 45, 48]) {
    assert.equal(stateFromWmoCode(code), "cloudy", `code ${code}`);
  }
});

check("an unknown code falls back to cloudy, not to sun or rain", () => {
  assert.equal(stateFromWmoCode(4), "cloudy");
  assert.equal(stateFromWmoCode(-1), "cloudy");
});

check("the real payload we measured maps to rain", () => {
  // Captured from Open-Meteo for Hsinchu at 2026-09-04T13:00 (Asia/Taipei).
  const payload = {
    current: { time: "2026-09-04T13:00", temperature_2m: 27.4, precipitation: 0.1, weather_code: 51, is_day: 1 },
  };
  const reading = readingFromPayload(payload, "2026-09-04T05:00:00.000Z");
  assert.equal(reading.state, "rain");
  assert.equal(reading.description, "毛毛雨");
  assert.equal(reading.temperatureC, 27.4);
  assert.equal(reading.isDay, true);
  assert.equal(reading.observedAt, "2026-09-04T13:00");
});

check("a payload with no weather code yields no reading", () => {
  assert.equal(readingFromPayload({ current: { temperature_2m: 27 } }, "t"), null);
  assert.equal(readingFromPayload({}, "t"), null);
  assert.equal(readingFromPayload(null, "t"), null);
});

check("is_day 0 is night", () => {
  const r = readingFromPayload({ current: { weather_code: 0, is_day: 0 } }, "t");
  assert.equal(r.isDay, false);
});

console.log(`\n${passed} checks passed.`);
