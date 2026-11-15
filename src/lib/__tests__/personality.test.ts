import { describe, expect, it } from "vitest";
import { PERSONALITY, resultFor } from "../personality";

describe("personality quizzes", () => {
  it("has 12 complete quizzes", () => {
    expect(PERSONALITY).toHaveLength(12);
    for (const q of PERSONALITY) {
      expect(q.questions).toHaveLength(6);
      expect(q.results).toHaveLength(4);
      q.questions.forEach((x) => expect(x.a.every((a) => a.trim().length > 0)).toBe(true));
    }
    expect(new Set(PERSONALITY.map((q) => q.code)).size).toBe(12);
  });
  it("picks the result you lean to most, ties to the first", () => {
    expect(resultFor([0, 1, 1, 2, 3, 1])).toBe(1);
    expect(resultFor([0, 0, 1, 1, 2, 3])).toBe(0);
    expect(resultFor([3, 3, 3, 2, 2, 2])).toBe(2);
  });
});
