/** @type {import('tailwindcss').Config} */
// Our Little Ritual — "Scrapbook Passport" design tokens.
// A journal on lined cream paper: taped polaroids, soft pastel note cards,
// stamps everywhere (visa stamps for visits, postage stamps, postmarks), a
// boarding pass for your two clocks, and one airmail postcard for the next visit.
// Old token names are kept and pointed at the new palette so every screen moves at once:
//   leaf → warm brown ink · raspberry → pink (deep = coral-red hand lettering)
//   mustard → pink (chosen things, primary buttons) · tomato/tangerine → coral
//   gold → peach · lime → mint.
// Contrast: ink text on every pastel; white text only on ink; small coloured text uses the deep shades.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FBF3EA",                                                     // lined journal paper
        paper: "#FFFAF3",                                                     // passport page
        ink: { DEFAULT: "#3A2A24", soft: "#F1E6DD" },
        leaf: { DEFAULT: "#3A2A24", deep: "#2A1D18", soft: "#F1E6DD" },        // = ink
        raspberry: { DEFAULT: "#F6D3DE", soft: "#FBE9EF", deep: "#B23A14" },   // pink; deep = hand lettering
        mustard: { DEFAULT: "#F6D3DE", soft: "#FBE9EF", deep: "#8A3B57" },     // chosen things
        tomato: { DEFAULT: "#E0614F", soft: "#FBDDC6", deep: "#B23A14" },      // coral
        tangerine: { DEFAULT: "#E0614F", soft: "#FBDDC6", deep: "#B23A14" },
        gold: { DEFAULT: "#FBDDC6", soft: "#FDEEE2" },                        // peach
        peach: { DEFAULT: "#FBDDC6", soft: "#FDEEE2" },
        lime: { DEFAULT: "#DCEBE2", soft: "#EDF5F0" },                        // mint
        mint: { DEFAULT: "#DCEBE2", soft: "#EDF5F0" },
        lilac: { DEFAULT: "#E9D3E5", soft: "#F4E9F2" },
        cornflower: { DEFAULT: "#4F7FC1", soft: "#DCE6F4", deep: "#2F5A9A" },
        visa: { red: "#C8352B", blue: "#2F5A9A", green: "#3E6B4C" },          // stamp inks
        muted: "#6E5D55",  // secondary text (≈5.9:1 on cream)
        faint: "#A39389",
      },
      fontFamily: {
        display: ['"DM Serif Display"', "Georgia", "serif"],
        sans: ['"DM Sans Variable"', "system-ui", "sans-serif"],
        hand: ['"Caveat"', "cursive"],
      },
      borderRadius: { card: "22px" },
      boxShadow: {
        print: "0 8px 16px -10px rgba(58,42,36,0.45)",
        "print-sm": "0 4px 10px -6px rgba(58,42,36,0.4)",
        card: "0 10px 22px -16px rgba(58,42,36,0.5)",
        photo: "0 14px 26px -16px rgba(58,42,36,0.55)",
      },
    },
  },
  plugins: [],
};
