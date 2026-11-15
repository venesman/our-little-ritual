import { describe, expect, it } from "vitest";
import { catLabel, scoreLine, verdict } from "../quiz";

describe("quiz helpers", () => {
  it("writes the score with mine first", () => {
    expect(scoreLine({ a: 12, b: 10 }, "a", "Vee", "Mateo")).toBe("Vee 12 – 10 Mateo");
    expect(scoreLine({ a: 12, b: 10 }, "b", "Mateo", "Vee")).toBe("Mateo 10 – 12 Vee");
    expect(scoreLine(null, "a", "Vee", "Mateo")).toBe("");
  });
  it("says who won, kindly", () => {
    expect(verdict(3, 1, "Mateo")).toMatch(/You won/);
    expect(verdict(1, 3, "Mateo")).toMatch(/Mateo won/);
    expect(verdict(2, 2, "Mateo")).toMatch(/draw/);
  });
  it("labels categories", () => {
    expect(catLabel("malaysia")).toBe("Malaysia & Borneo");
    expect(catLabel(null)).toBe("Not picked yet");
  });
});
