import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#333333",
        "on-primary": "#ffffff",
        secondary: "#5c5a54",
        tertiary: "#66a05f",
        "on-tertiary": "#1d1d1b",
        neutral: "#e2eedd",
        surface: "#f6fbf3",
        "on-surface": "#1d1d1b",
        "app-mid": "#d5e8cf",
        "app-end": "#b9dfae",
        "accent-soft": "#cfe7c7",
        focus: "#2f5a29",
      },
      borderRadius: {
        sm: "10px",
        md: "12px",
        card: "28px",
        app: "38px",
      },
      fontFamily: {
        headline: ["var(--font-outfit)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
