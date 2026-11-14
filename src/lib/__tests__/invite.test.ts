import { describe, expect, it } from "vitest";
import { tokenFromHash } from "../invite";

describe("tokenFromHash", () => {
  it("reads a valid token", () => expect(tokenFromHash("#t=abcDEF123_-abcDEF123_-abc")).toBe("abcDEF123_-abcDEF123_-abc"));
  it("rejects short tokens", () => expect(tokenFromHash("#t=abc")).toBeNull());
  it("rejects injected characters", () => expect(tokenFromHash("#t=abcdefghijklmnopqrstu'%3B")).toBeNull());
  it("ignores empty hash", () => expect(tokenFromHash("")).toBeNull());
});

import { shapeFor, starterPrompts, hostOf } from "../answerShape";
import { fitWithin } from "../image";
describe("answer shapes", () => {
  it("text asks for words", () => expect(shapeFor({ code: 1, response_type: "text" }).text).toBe("required"));
  it("photo needs a photo", () => expect(shapeFor({ code: 28, response_type: "photo" }).photo).toBe("required"));
  it("who-is-more-likely uses name buttons", () => expect(shapeFor({ code: 39, response_type: "choices" }).prompts?.mode).toBe("who"));
  it("guess-my-answer adds guesses", () => expect(shapeFor({ code: 36, response_type: "choices_text" }).prompts?.mode).toBe("guess"));
  it("draw-or-write lets you choose", () => expect(shapeFor({ code: 12, response_type: "drawing_or_text" }).eitherDrawOrWrite).toBe(true));
  it("pads prompts to three", () => expect(starterPrompts(["A?"]).length).toBe(3));
  it("shows a link's site", () => expect(hostOf("https://www.youtube.com/watch?v=1")).toBe("youtube.com"));
});
describe("photo shrinking", () => {
  it("keeps small photos", () => expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 }));
  it("shrinks big portrait photos", () => expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 }));
});
