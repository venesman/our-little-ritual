/** @type {import('tailwindcss').Config} */
// Our Little Ritual — "Par Avion" design tokens (postcards & stamps).
// Cream paper dominates; ink is text and structure; lime is for buttons and
// chosen things; tangerine + cornflower are the airmail accents; mustard and
// lilac are tile colours. Token names from the first design are kept and
// pointed at the new palette so every screen moves over at once:
//   leaf → ink · raspberry → tangerine (hand-lettering, accents) · mustard → lime
//   (interactive) · tomato → tangerine (emphasis).
// Contrast: ink text on every colour; cream text only large on tangerine/blue;
// small coloured text uses the deep shades (tangerine-deep, blue-deep).
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FCF2E8",                                                     // warm cream — page ground
        paper: "#FFFAF3",                                                     // postcard paper
        ink: { DEFAULT: "#0C1020", soft: "#E9E4EE" },
        leaf: { DEFAULT: "#0C1020", deep: "#000000", soft: "#EFE6EC" },        // = ink (structure + text)
        raspberry: { DEFAULT: "#EA572C", soft: "#FBE1D6", deep: "#B23A14" },   // = tangerine accents
        mustard: { DEFAULT: "#DBDE49", soft: "#F2F3C6", deep: "#575A00" },     // = lime (interactive)
        tomato: { DEFAULT: "#EA572C", soft: "#FBE1D6", deep: "#B23A14" },      // = tangerine (emphasis)
        tangerine: { DEFAULT: "#EA572C", soft: "#FBE1D6", deep: "#B23A14" },
        lime: { DEFAULT: "#DBDE49", soft: "#F2F3C6" },
        gold: { DEFAULT: "#C3B20D", soft: "#F1EBB8" },                        // the moodboard's mustard
        lilac: { DEFAULT: "#E1C3DB", soft: "#F3E6F0" },
        cornflower: { DEFAULT: "#4F7FC1", soft: "#DCE6F4", deep: "#2F5A9A" },
        muted: "#4A4E5E",  // secondary text (≈7:1 on cream)
        faint: "#8A8D99",  // placeholders, hairlines
      },
      fontFamily: {
        display: ['"DM Serif Display"', "Georgia", "serif"],
        sans: ['"DM Sans Variable"', "system-ui", "sans-serif"],
        hand: ['"Caveat"', "cursive"],
      },
      borderRadius: {
        card: "2px",
      },
      boxShadow: {
        // printed, offset shadows for things you press; soft lift for paper
        print: "3px 3px 0 0 #0C1020",
        "print-sm": "2px 2px 0 0 #0C1020",
        card: "0 1px 0 rgba(12,16,32,0.06), 0 10px 22px -14px rgba(12,16,32,0.45)",
        photo: "0 6px 14px -8px rgba(12,16,32,0.5)",
      },
    },
  },
  plugins: [],
};
