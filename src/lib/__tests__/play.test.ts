import { describe, expect, it } from "vitest";
import { formatClock, secondsLeft } from "../play";

describe("shared timer maths", () => {
  const now = Date.parse("2026-11-15T12:00:00Z");
  it("counts down from the server's end time", () =>
    expect(secondsLeft({ duration_s: 600, ends_at: "2026-11-15T12:05:00Z", remaining_s: null }, 0, now)).toBe(300));
  it("corrects for a phone clock that runs 30 s slow", () =>
    expect(secondsLeft({ duration_s: 600, ends_at: "2026-11-15T12:05:00Z", remaining_s: null }, 30000, now)).toBe(270));
  it("never goes below zero", () =>
    expect(secondsLeft({ duration_s: 60, ends_at: "2026-11-15T11:59:00Z", remaining_s: null }, 0, now)).toBe(0));
  it("shows the paused remainder", () =>
    expect(secondsLeft({ duration_s: 600, ends_at: null, remaining_s: 123 }, 0, now)).toBe(123));
  it("formats as m:ss", () => expect(formatClock(605)).toBe("10:05"));
});
