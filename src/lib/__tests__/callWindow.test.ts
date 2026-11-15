import { describe, expect, it } from "vitest";
import { nextSharedWindow, zonedToUtc, windowsAround, formatRange } from "../callWindow";

const iso = (ms: number) => new Date(ms).toISOString();

describe("zonedToUtc", () => {
  it("Kuching 8 pm = 12:00 UTC", () => expect(iso(zonedToUtc(2026, 11, 16, 20, 0, "Asia/Kuching"))).toBe("2026-11-16T12:00:00.000Z"));
  it("Santiago 9 am in November (summer, UTC-3) = 12:00 UTC", () =>
    expect(iso(zonedToUtc(2026, 11, 16, 9, 0, "America/Santiago"))).toBe("2026-11-16T12:00:00.000Z"));
  it("Santiago 8 am in June (winter, UTC-4) = 12:00 UTC", () =>
    expect(iso(zonedToUtc(2026, 6, 15, 8, 0, "America/Santiago"))).toBe("2026-06-15T12:00:00.000Z"));
});

describe("windowsAround", () => {
  it("handles a window that crosses midnight", () => {
    const w = windowsAround(new Date("2026-11-16T05:00:00Z"), "Asia/Kuching", "22:00", "01:00");
    expect(w.every((x) => x.end - x.start === 3 * 3600 * 1000)).toBe(true);
  });
});

describe("nextSharedWindow — Kuching ↔ Santiago", () => {
  const vee = { timeZone: "Asia/Kuching", from: "20:00", to: "23:30" };
  const mateoSummer = { timeZone: "America/Santiago", from: "08:00", to: "10:00" };

  it("in November finds 8–9 pm Kuching / 9–10 am Santiago", () => {
    const w = nextSharedWindow(new Date("2026-11-16T03:00:00Z"), vee, mateoSummer)!;
    expect(iso(w.start)).toBe("2026-11-16T12:00:00.000Z");
    expect(iso(w.end)).toBe("2026-11-16T13:00:00.000Z");
    expect(formatRange(w, "Asia/Kuching")).toMatch(/8:00\s?pm – 9:00\s?pm/i);
    expect(formatRange(w, "America/Santiago")).toMatch(/9:00\s?am – 10:00\s?am/i);
    expect(w.isNow).toBe(false);
  });

  it("in June the overlap grows to two hours (Chile on winter time)", () => {
    const w = nextSharedWindow(new Date("2026-06-15T03:00:00Z"), vee, mateoSummer)!;
    expect(iso(w.start)).toBe("2026-06-15T12:00:00.000Z");
    expect(iso(w.end)).toBe("2026-06-15T14:00:00.000Z");
  });

  it("reports when the window is happening now", () => {
    const w = nextSharedWindow(new Date("2026-11-16T12:30:00Z"), vee, mateoSummer)!;
    expect(w.isNow).toBe(true);
  });

  it("returns null when the windows never meet", () => {
    expect(nextSharedWindow(new Date("2026-11-16T03:00:00Z"), vee, { timeZone: "America/Santiago", from: "13:00", to: "15:00" })).toBeNull();
  });

  it("returns null until both have set their hours", () => {
    expect(nextSharedWindow(new Date(), vee, { timeZone: "America/Santiago", from: null, to: null })).toBeNull();
  });
});

describe("Vee's real hours (reported 15 Nov)", () => {
  it("7 pm–12 am Kuching and 6 am–12 pm Santiago overlap 7–11 pm / 8 am–12 pm", () => {
    const w = nextSharedWindow(new Date("2026-11-15T02:11:00Z"),
      { timeZone: "Asia/Kuching", from: "19:00", to: "00:00" },
      { timeZone: "America/Santiago", from: "06:00", to: "12:00" })!;
    expect(new Date(w.start).toISOString()).toBe("2026-11-15T11:00:00.000Z");
    expect(new Date(w.end).toISOString()).toBe("2026-11-15T15:00:00.000Z");
    expect(formatRange(w, "Asia/Kuching")).toMatch(/7:00\s?pm – 11:00\s?pm/i);
    expect(formatRange(w, "America/Santiago")).toMatch(/8:00\s?am – 12:00\s?pm/i);
  });
});
