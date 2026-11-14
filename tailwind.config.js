/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Orange + green lead; pink softens; red is for small accents only.
        cream: "#FFF6EC",
        forest: { DEFAULT: "#2F5D3A", deep: "#234A2D" },
        sage: { DEFAULT: "#8DBF8F", soft: "#DDEFD8" },
        tangerine: { DEFAULT: "#F28C38", deep: "#C9601A", soft: "#FFE2C8" },
        blush: { DEFAULT: "#F4B3C2", soft: "#FDE6EC" },
        cherry: { DEFAULT: "#D7263D", soft: "#FBD9DD" },
        bark: { DEFAULT: "#85634F", soft: "#CDB09B" },
        ink: "#2B2320",
      },
      fontFamily: {
        serif: ['"DM Serif Display"', "Georgia", "serif"],
        sans: ['"Inter Variable"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        paper: "0 1px 2px rgba(53,76,60,0.06), 0 8px 24px -12px rgba(53,76,60,0.18)",
      },
    },
  },
  plugins: [],
};
