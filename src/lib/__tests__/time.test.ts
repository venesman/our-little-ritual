import { describe, expect, it } from "vitest";
import { formatInZone, nextRelease } from "../time";

describe("nextRelease (Monday 12:00 UTC)", () => {
  it("from a Saturday goes to the coming Monday", () => {
    expect(nextRelease(new Date("2026-11-14T15:00:00Z")).toISOString()).toBe("2026-11-16T12:00:00.000Z");
  });
  it("Monday before noon UTC is the same day", () => {
    expect(nextRelease(new Date("2026-11-16T11:59:00Z")).toISOString()).toBe("2026-11-16T12:00:00.000Z");
  });
  it("exactly at release moves to next week", () => {
    expect(nextRelease(new Date("2026-11-16T12:00:00Z")).toISOString()).toBe("2026-11-23T12:00:00.000Z");
  });
  it("Sunday night in Malaysia (still Sunday UTC) is Monday", () => {
    expect(nextRelease(new Date("2026-11-15T23:30:00Z")).toISOString()).toBe("2026-11-16T12:00:00.000Z");
  });
});

describe("local display of the same instant", () => {
  const r = new Date("2026-11-16T12:00:00Z");
  it("Malaysia sees Monday 8 pm", () => expect(formatInZone(r, "Asia/Kuching")).toMatch(/Mon.*8:00\s?pm/i));
  it("Chile (summer time, UTC-3) sees Monday 9 am", () => expect(formatInZone(r, "America/Santiago")).toMatch(/Mon.*9:00\s?am/i));
  it("Chile winter (UTC-4) sees Monday 8 am", () =>
    expect(formatInZone(new Date("2026-06-15T12:00:00Z"), "America/Santiago")).toMatch(/Mon.*8:00\s?am/i));
});
