import { describe, expect, it } from "vitest";
import { tokenFromHash } from "../invite";

describe("tokenFromHash", () => {
  it("reads a valid token", () => expect(tokenFromHash("#t=abcDEF123_-abcDEF123_-abc")).toBe("abcDEF123_-abcDEF123_-abc"));
  it("rejects short tokens", () => expect(tokenFromHash("#t=abc")).toBeNull());
  it("rejects injected characters", () => expect(tokenFromHash("#t=abcdefghijklmnopqrstu'%3B")).toBeNull());
  it("ignores empty hash", () => expect(tokenFromHash("")).toBeNull());
});
