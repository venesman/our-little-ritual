import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarUrl } from "../calendar";
import { sharedWindowsAhead } from "../callWindow";

const ev = { title: "Call with Mateo, Our Little Ritual", start: Date.parse("2026-11-15T11:00:00Z"), end: Date.parse("2026-11-15T15:00:00Z"), description: "7:00 pm for you\n8:00 am for Mateo" };

describe("calendar export", () => {
  it("builds a valid single-event .ics in UTC", () => {
    const ics = buildIcs(ev, Date.parse("2026-11-15T02:00:00Z"));
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20261115T110000Z");
    expect(ics).toContain("DTEND:20261115T150000Z");
    expect(ics).toContain("SUMMARY:Call with Mateo\\, Our Little Ritual");
    expect(ics).toContain("DESCRIPTION:7:00 pm for you\\n8:00 am for Mateo");
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });
  it("builds a Google Calendar link", () => {
    const url = new URL(googleCalendarUrl(ev));
    expect(url.hostname).toBe("calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20261115T110000Z/20261115T150000Z");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
  });
});

describe("planning a call date", () => {
  it("finds one shared window a day for the next 7 days", () => {
    const w = sharedWindowsAhead(new Date("2026-11-15T02:11:00Z"),
      { timeZone: "Asia/Kuching", from: "19:00", to: "00:00" },
      { timeZone: "America/Santiago", from: "06:00", to: "12:00" }, 7);
    expect(w.length).toBe(7);
    expect(w.every((x) => x.end - x.start === 4 * 3600000)).toBe(true);
  });
});
