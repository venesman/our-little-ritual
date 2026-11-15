import { describe, expect, it } from "vitest";
import { fillTokens, orList, personalise } from "../tokens";

const vee = {
  current_city: "Kuching", current_country: "Malaysia", home_country: "Malaysia", institution: null,
  situation: "business development & events", languages_spoken: ["English", "Malay", "Iban"], languages_learning: [],
};
const him = {
  current_city: "Santiago", current_country: "Chile", home_country: "Sweden", institution: "Lund University",
  situation: "exchange year", languages_spoken: ["Swedish", "English"], languages_learning: ["Spanish"],
};

describe("orList", () => {
  it("formats lists naturally and drops duplicates", () => {
    expect(orList([])).toBeNull();
    expect(orList(["Spanish"])).toBe("Spanish");
    expect(orList(["Spanish", "Swedish", "Iban", "Spanish"])).toBe("Spanish, Swedish or Iban");
  });
});

describe("fillTokens", () => {
  it("uses the reader's profile for 'your' and the partner's for 'their'", () => {
    expect(fillTokens("Walk around [your current city].", vee, him)).toBe("Walk around Kuching.");
    expect(fillTokens("Walk around [your current city].", him, vee)).toBe("Walk around Santiago.");
    expect(fillTokens("Something from [their home country].", vee, him)).toBe("Something from Sweden.");
  });
  it("never uses home country or university as the current location", () => {
    const noCity = { ...him, current_city: null };
    expect(fillTokens("[your current city]", noCity, vee)).toBeNull();
  });
  it("fills language tokens from both partners", () => {
    expect(fillTokens("[a language one of you is learning]", vee, him)).toBe("Spanish");
    expect(fillTokens("[a language your partner speaks or is learning]", him, vee)).toBe("English, Malay or Iban");
    expect(fillTokens("[a language you speak or are learning]", vee, him)).toBe("English, Malay, Iban, Swedish or Spanish");
    expect(fillTokens("[a language you're learning]", vee, him)).toBeNull();
  });
});

describe("personalise", () => {
  it("passes general activities through", () => {
    expect(personalise("Draw a cat.", null, vee, him)).toEqual({ text: "Draw a cat.", personal: false });
  });
  it("uses the fallback when anything is missing (e.g. partner not joined)", () => {
    expect(personalise("Tour [your current city] for [their current city].", "Give a home tour.", vee, null))
      .toEqual({ text: "Give a home tour.", personal: false });
  });
  it("marks filled text as personal", () => {
    expect(personalise("Tour [your current city].", "x", vee, him)).toEqual({ text: "Tour Kuching.", personal: true });
  });
});
