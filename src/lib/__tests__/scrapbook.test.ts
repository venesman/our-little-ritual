import { describe, expect, it } from "vitest";
import { imagesOf, matchesType, monthKey, type Memory } from "../scrapbook";

const trip: Memory = {
  kind: "moment", ref_id: "m1", at: "2026-06-20", caption: "", title: "Summer in Sweden", authors: ["a"], starts_on: "2026-06-20", ends_on: "2026-07-18",
  photos: [{ id: "p1", path: "r/m1/a/1.jpg", taken_at: "2026-06-21T16:30:00Z" }],
};
const ritual: Memory = {
  kind: "ritual", ref_id: "w1", at: "2026-11-09T12:00:00Z", caption: "", title: "Draw Us", authors: ["a", "b"], category: "creative_corner",
  parts: [{ user_id: "a", image_path: "r/w1/a/x.png" }, { user_id: "b", body: "hi", voice_path: "r/w1/b/v.webm" }],
};

describe("scrapbook helpers", () => {
  it("collects images from trips and answers, each from the right bucket", () => {
    expect(imagesOf(trip)).toEqual([{ bucket: "moments", path: "r/m1/a/1.jpg", taken_at: "2026-06-21T16:30:00Z" }]);
    expect(imagesOf(ritual)).toEqual([{ bucket: "ritual-media", path: "r/w1/a/x.png" }]);
  });
  it("filters by type, photos, drawings and voice", () => {
    expect(matchesType(trip, "moments")).toBe(true);
    expect(matchesType(trip, "photos")).toBe(true);
    expect(matchesType(ritual, "photos")).toBe(false);
    expect(matchesType(ritual, "drawings")).toBe(true);
    expect(matchesType(ritual, "voice")).toBe(true);
    expect(matchesType(ritual, "letters")).toBe(false);
  });
  it("groups by calendar month", () => {
    expect(monthKey("2026-06-20")).toBe("2026-06");
    expect(monthKey("2026-11-09T12:00:00Z")).toBe("2026-11");
  });
});
