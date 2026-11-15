import { describe, expect, it } from "vitest";
import { daysInclusive, enteredBy, fmtPrecise, overviewText, togetherByMonth, togetherDays } from "../record";
import { buildRecord, mergeRanges, wordsAllowed } from "../exportRecord";
import type { Visit } from "../visits";
import type { Milestone } from "../story";
import type { Memory } from "../scrapbook";

const A = { id: "a", display_name: "Vee", current_city: "Kuching", current_country: "Malaysia", home_country: "Malaysia" };
const B = { id: "b", display_name: "Mateo", current_city: "Santiago", current_country: "Chile", home_country: "Sweden" };

describe("days together", () => {
  it("counts first and last day", () => {
    expect(daysInclusive("2025-04-10", "2025-04-17")).toBe(8);
    expect(daysInclusive("2025-04-10")).toBe(1);
  });
  it("never double-counts overlapping trips and visits", () => {
    const d = togetherDays([{ from: "2025-04-10", until: "2025-04-17" }, { from: "2025-04-15", until: "2025-04-20" }]);
    expect(d.size).toBe(11);
  });
  it("clips to the reporting period and splits by month", () => {
    const d = togetherDays([{ from: "2025-12-28", until: "2026-01-03" }], "2025-12-30");
    expect(d.size).toBe(5);
    expect(togetherByMonth(d)).toEqual({ "2025-12": 2, "2026-01": 3 });
  });
});

describe("dates as exactly as they're known", () => {
  it("formats by precision", () => {
    expect(fmtPrecise("2024-11-14")).toBe("14 November 2024");
    expect(fmtPrecise("2024-11-14", "month")).toBe("November 2024");
    expect(fmtPrecise("2024-11-14", "year")).toBe("2024");
  });
  it("labels hand-entered things honestly", () => {
    expect(enteredBy("Vee", "2026-12-03T10:00:00Z")).toBe("Entered by Vee on 3 Dec 2026");
    expect(enteredBy(null)).toBe("Entered by hand");
  });
});

describe("overview", () => {
  it("is short and factual", () => {
    const t = overviewText({ names: ["Vee", "Mateo"], start: { on: "2024-11-01", precision: "month" }, firstMet: null,
      meetings: [{ from: "x" }, { from: "y" }, { from: "z" }], totalDays: 30, countries: ["Germany", "Malaysia"], familyVisits: 1, homes: [] });
    expect(t).toContain("relationship began in November 2024");
    expect(t).toContain("3 times in Germany and Malaysia, 30 days in total");
    expect(t).toContain("One of these visits included time with family");
  });
});

const visit = (v: Partial<Visit>): Visit => ({ id: "v1", place: "Family home", starts_on: "2025-12-20", ends_on: "2026-01-03", note: "", created_by: "a", created_at: "2026-11-15T00:00:00Z", stay_type: "visit", travel: "one", travelled_by: "b", with_family: true, family_note: "Christmas", city: "Kuching", country: "Malaysia", title: "", ...v });
const base = { from: "2024-01-01", to: "2026-11-15", today: "2026-11-15", people: [A, B], myId: "a", feed: [] as Memory[], docs: [], months: null, oldMonths: [], excluded: new Set<string>() };

describe("the record", () => {
  it("builds visits, family and totals, with overlaps counted once", () => {
    const r = buildRecord({ ...base, milestones: [], visits: [visit({}), visit({ id: "v2", starts_on: "2025-04-10", ends_on: "2025-04-17", with_family: false, travel: "both", country: "Germany", city: "Berlin" })] });
    expect(r.visits.map((v) => v.travelled)).toEqual(["We both travelled", "Mateo travelled to Vee"]);
    expect(r.totalDays).toBe(8 + 15);
    expect(r.family).toHaveLength(1);
    expect(r.countries).toEqual(["Germany", "Malaysia"]);
  });
  it("never calls a holiday living together", () => {
    const r = buildRecord({ ...base, milestones: [], visits: [visit({ stay_type: "holiday" })] });
    expect(r.visits[0].kind).toBe("Holiday together");
  });
  it("leaves out what you leave out — including from the total", () => {
    const r = buildRecord({ ...base, milestones: [], visits: [visit({})], excluded: new Set(["v:v1"]) });
    expect(r.totalDays).toBe(0);
  });
  it("splits future milestones into plans and shows date precision", () => {
    const ms: Milestone[] = [
      { id: "m1", kind: "milestone", title: "Our relationship began", happened_on: "2024-11-01", note: "", tag: "relationship_start", date_precision: "month", created_by: "a" },
      { id: "m2", kind: "milestone", title: "Our wedding", happened_on: "2027-06-01", note: "", tag: "marriage", date_precision: "month", created_by: "b" },
    ];
    const r = buildRecord({ ...base, visits: [], milestones: ms });
    expect(r.timeline[0].date).toBe("November 2024");
    expect(r.timeline[0].source).toContain("Entered by Vee");
    expect(r.plans[0].title).toBe("Our wedding");
    expect(r.start).toEqual({ on: "2024-11-01", precision: "month" });
  });
  it("letters are counted per writer", () => {
    const r = buildRecord({ ...base, visits: [], milestones: [], months: [{ month: "2025-05-01", rituals_both: 2, checkins_both: 0, letters_by: { a: 3, b: 1 }, call_days: 4, games: 0, creations: 0, research: 0, missions_both: 0, songs: 1 }] });
    expect(r.months[0].letters).toBe("Vee 3 · Mateo 1");
    expect(r.months[0].activities).toBe("4 days with a call activity");
  });
});

describe("written words", () => {
  const ritual: Memory = { kind: "ritual", ref_id: "r", at: "2025-01-01", caption: "", title: "T", authors: ["a", "b"], parts: [{ user_id: "a", body: "mine" }, { user_id: "b", body: "his" }] };
  it("keeps the partner's words out until they allow it", () => {
    expect(wordsAllowed(ritual, "a", {})!.parts!.map((p) => p.body)).toEqual(["mine"]);
    expect(wordsAllowed(ritual, "a", { b: true })!.parts).toHaveLength(2);
    expect(wordsAllowed({ ...ritual, kind: "letter", authors: ["b"] }, "a", {})).toBeNull();
  });
});

describe("meetings", () => {
  it("a trip and a visit on the same days are one meeting", () => {
    expect(mergeRanges([{ from: "2025-04-10", until: "2025-04-17" }, { from: "2025-04-10", until: "2025-04-17" }, { from: "2025-12-20", until: "2026-01-03" }])).toHaveLength(2);
  });
});

import { statTiles } from "../keepsake";
describe("keepsake tiles", () => {
  it("shows only what happened, with the right words", () => {
    expect(statTiles({ rituals: 1, checkins: 0, letters: 12, call_days: 0, games: 0, creations: 0, research: 0, missions: 0, songs: 3 }))
      .toEqual([{ n: 1, label: "weekly ritual" }, { n: 12, label: "letters" }, { n: 3, label: "songs shared" }]);
  });
});
