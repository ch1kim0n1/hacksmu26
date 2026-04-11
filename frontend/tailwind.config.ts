import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      colors: {
        echofield: {
          bg: "#0A1A1F",
          surface: "#141E24",
          "surface-elevated": "#1E2A32",
          border: "#2A3A42",
          "text-primary": "#F0F5F8",
          "text-secondary": "#8B9BA5",
          "text-muted": "#5A6A75",
        },
        accent: {
          teal: "#00D9FF",
          DEFAULT: "#00D9FF",
        },
        success: {
          DEFAULT: "#10C876",
        },
        warning: {
          DEFAULT: "#F5A025",
        },
        danger: {
          DEFAULT: "#EF4444",
        },
        gold: {
          DEFAULT: "#D4AF37",
        },
        elephant: {
          DEFAULT: "#8B8680",
        },
        spectrogram: {
          low: "#0C1A2A",
          mid: "#00D9FF",
          high: "#FFD700",
          peak: "#EF4444",
        },
      },
    },
  },
  plugins: [],
};

export default config;
