import { describe, expect, it } from "vitest";
import { coupleCountries, supports, talkSegments, topicVisible, type Topic } from "../curious";

const base: Topic = {
  id: "t", code: 1, title: "T", area: "science", intro_question: "?", explore: "x", angles: [], research_minutes: 10, difficulty: "beginner",
  debate_statement: null, claims: [], split_a: null, split_b: null, countries: [], just_us: false, needs: [], fallback_explore: null,
};

describe("talkSegments", () => {
  it("follows the suggested 0–15–40–55–60 s structure for one minute", () => {
    expect(talkSegments(60).map((s) => [s.from, s.to])).toEqual([[0, 15], [15, 40], [40, 55], [55, 60]]);
  });
  it("scales to 30 s and 2 min", () => {
    expect(talkSegments(30).at(-1)!.to).toBe(30);
    expect(talkSegments(120)[1]).toMatchObject({ from: 30, to: 80 });
  });
});

describe("supports", () => {
  it("only offers formats the topic has material for", () => {
    expect(supports(base, "teach")).toBe(true);
    expect(supports(base, "debate")).toBe(false);
    expect(supports({ ...base, claims: ["x"] }, "fact_fiction")).toBe(true);
    expect(supports({ ...base, split_a: "A", split_b: "B" }, "deep_dive")).toBe(true);
  });
});

describe("Just us country tags", () => {
  const countries = coupleCountries(
    { current_country: "Malaysia", home_country: "Malaysia" },
    { current_country: " Chile ", home_country: "Sweden" },
  );
  it("collects current and home countries from both profiles", () => {
    expect(countries.sort()).toEqual(["chile", "malaysia", "sweden"]);
  });
  it("hides place topics from general draws and shows matching ones under Just us", () => {
    const chileTopic = { ...base, countries: ["chile"] };
    expect(topicVisible(chileTopic, false, countries)).toBe(false);
    expect(topicVisible(chileTopic, true, countries)).toBe(true);
    expect(topicVisible(chileTopic, true, ["sweden"])).toBe(false);
    expect(topicVisible(base, false, countries)).toBe(true);
    expect(topicVisible({ ...base, just_us: true }, true, [])).toBe(true);
  });
});
