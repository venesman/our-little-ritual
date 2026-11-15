import { describe, expect, it } from "vitest";
import { formatInZone, nextRelease } from "../time";

describe("nextRelease (Monday 11:00 UTC = 7 pm Kuching)", () => {
  it("from a Saturday goes to the coming Monday", () => {
    expect(nextRelease(new Date("2026-11-14T15:00:00Z")).toISOString()).toBe("2026-11-16T11:00:00.000Z");
  });
  it("Monday before 11:00 UTC is the same day", () => {
    expect(nextRelease(new Date("2026-11-16T10:59:00Z")).toISOString()).toBe("2026-11-16T11:00:00.000Z");
  });
  it("exactly at release moves to next week", () => {
    expect(nextRelease(new Date("2026-11-16T11:00:00Z")).toISOString()).toBe("2026-11-23T11:00:00.000Z");
  });
  it("Sunday night in Malaysia (still Sunday UTC) is Monday", () => {
    expect(nextRelease(new Date("2026-11-15T23:30:00Z")).toISOString()).toBe("2026-11-16T11:00:00.000Z");
  });
});

describe("local display of the same instant", () => {
  const r = new Date("2026-11-16T11:00:00Z");
  it("Malaysia sees Monday 7 pm", () => expect(formatInZone(r, "Asia/Kuching")).toMatch(/Mon.*7:00\s?pm/i));
  it("Chile (summer time, UTC-3) sees Monday 8 am", () => expect(formatInZone(r, "America/Santiago")).toMatch(/Mon.*8:00\s?am/i));
  it("Chile winter (UTC-4) sees Monday 7 am", () =>
    expect(formatInZone(new Date("2026-06-15T11:00:00Z"), "America/Santiago")).toMatch(/Mon.*7:00\s?am/i));
});

import { placeFromZone } from "../time";
describe("placeFromZone", () => {
  it("takes the city part", () => expect(placeFromZone("America/Santiago")).toBe("Santiago"));
  it("handles underscores", () => expect(placeFromZone("Asia/Kuala_Lumpur")).toBe("Kuala Lumpur"));
});

import { gmtLabel, zoneLabel } from "../time";
describe("time zone labels", () => {
  it("Kuching is GMT+8", () => expect(gmtLabel("Asia/Kuching", new Date("2026-11-15T00:00:00Z"))).toBe("GMT+8"));
  it("Santiago is GMT-3 in November", () => expect(gmtLabel("America/Santiago", new Date("2026-11-15T00:00:00Z"))).toBe("GMT-3"));
  it("Santiago is GMT-4 in June", () => expect(gmtLabel("America/Santiago", new Date("2026-06-15T00:00:00Z"))).toBe("GMT-4"));
  it("combines place and offset", () => expect(zoneLabel("America/Santiago", new Date("2026-11-15T00:00:00Z"))).toBe("Santiago · GMT-3"));
});

import { suggestZones } from "../time";
describe("suggestZones", () => {
  const zones = ["Asia/Kuching", "Asia/Kuala_Lumpur", "America/Santiago", "America/Punta_Arenas", "Pacific/Easter", "Europe/Stockholm"];
  it("matches the city first, then the country list", () => {
    expect(suggestZones("Kuching", "Malaysia", zones)).toEqual(["Asia/Kuching", "Asia/Kuala_Lumpur"]);
    expect(suggestZones("Santiago", "Chile", zones)[0]).toBe("America/Santiago");
  });
  it("suggests nothing when it doesn't know", () => {
    expect(suggestZones("", "Atlantis", zones)).toEqual([]);
  });
});
