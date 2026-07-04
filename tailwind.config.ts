import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Modern-friendly palette: calm teal, clean surfaces, warm accent.
        ink: "#16363a", // deep teal-charcoal text
        muted: "#5d7679", // cool muted text
        line: "#dde6e6", // cool border
        soft: "#eef4f4", // light cool surface
        paper: "#ffffff", // card
        dark: "#0e5e63", // deep teal (headers / banners)
        brand: "#0f8f86", // teal primary
        accent: "#f08a4b", // warm highlight
        gain: "#15976b", // teal-green
        loss: "#d2553a", // terracotta red
        bh: "#5b86b3", // muted blue (buy & hold)
        sky: "#aef3e8",
        cream: "#eafffb",
      },
    },
  },
  plugins: [],
};

export default config;
