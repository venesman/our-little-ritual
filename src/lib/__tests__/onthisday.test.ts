import { describe, expect, it } from "vitest";
import { onThisDay } from "../../components/HomeMemories";
import type { Memory } from "../scrapbook";

const mk = (at: string, title: string): Memory => ({ kind: "milestone", ref_id: title, at, caption: "", title, authors: [] });

describe("onThisDay", () => {
  const today = new Date("2026-11-15T09:00:00Z");
  it("prefers the same date in an earlier year", () => {
    expect(onThisDay([mk("2026-10-15", "month"), mk("2025-11-15", "year")], today)).toMatchObject({ label: "A year ago today", m: { title: "year" } });
  });
  it("falls back to the same day in an earlier month", () => {
    expect(onThisDay([mk("2026-09-15", "two months")], today)).toMatchObject({ label: "2 months ago today" });
  });
  it("ignores today and the future, and returns nothing when there's no match", () => {
    expect(onThisDay([mk("2026-11-15", "today"), mk("2026-11-02", "other")], today)).toBeNull();
  });
});
