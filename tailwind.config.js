/** @type {import('tailwindcss').Config} */
// Our Little Ritual — "Retro Travel Journal" design tokens.
// Balance: cream dominates, leaf is structure + text, raspberry is the playful
// accent, mustard is for interactive elements, tomato is occasional emphasis.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#F4E7DE",                                                  // Caesar Cream — page background
        paper: "#FBF5F0",                                                  // lighter cream for cards
        leaf: { DEFAULT: "#20492F", deep: "#163522", soft: "#DCE3D6" },    // Salad Leaf
        raspberry: { DEFAULT: "#E480B4", soft: "#F8DCEA", deep: "#9E3A71" },
        mustard: { DEFAULT: "#ECB53D", soft: "#F8E6BC", deep: "#7E5A10" },
        tomato: { DEFAULT: "#DD3B26", soft: "#F8D5CE", deep: "#A82815" },
        muted: "#4F6354", // secondary text on cream (≈6:1)
        faint: "#8C978D", // placeholders, hairlines
      },
      fontFamily: {
        display: ['"Fraunces Variable"', "Georgia", "serif"],
        sans: ['"Inter Variable"', "system-ui", "sans-serif"],
        hand: ['"Caveat"', "cursive"],
      },
      boxShadow: {
        // flat, printed-looking offset shadows instead of soft blurs
        print: "3px 3px 0 0 #20492F",
        "print-sm": "2px 2px 0 0 #20492F",
        card: "0 1px 0 rgba(32,73,47,0.08), 0 10px 24px -16px rgba(32,73,47,0.35)",
      },
    },
  },
  plugins: [],
};
