import { describe, expect, it } from "vitest";
import { cameTrue, formatPrice, type Whim } from "../whims";

const w = (p: Partial<Whim>): Whim => ({ id: "1", kind: "little_want", created_by: "a", name: "x", link: null, price: null, currency: null, message: "",
  photo_path: null, status: "new", status_by: null, status_at: "", response_note: "", surprise: false, revealed_at: null, archived: false, created_at: "", ...p });

describe("whims", () => {
  it("formats prices per currency", () => {
    expect(formatPrice(89.9, "RM")).toBe("RM 89.90");
    expect(formatPrice(15000, "SEK")).toBe("SEK 15,000");
    expect(formatPrice(19990.4, "CLP")).toBe("CLP 19,990");
    expect(formatPrice(null, "RM")).toBeNull();
  });
  it("knows when a wish came true", () => {
    expect(cameTrue(w({ status: "bought" }))).toBe(true);
    expect(cameTrue(w({ status: "bought", surprise: true }))).toBe(false);   // still a secret
    expect(cameTrue(w({ kind: "shared_wish", status: "done" }))).toBe(true);
    expect(cameTrue(w({ status: "in_the_works" }))).toBe(false);
  });
});
