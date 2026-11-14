/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FAF7F0",
        sage: { DEFAULT: "#A9BDA5", soft: "#DCE5D9" },
        forest: { DEFAULT: "#354C3C", deep: "#2A3D30" },
        blush: { DEFAULT: "#E9C9C6", soft: "#F5E6E4" },
        bark: { DEFAULT: "#8B7768", soft: "#B8A99D" },
        ink: "#2B2723",
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
