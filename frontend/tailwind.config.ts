import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-cormorant)", "Georgia", "serif"],
        accent: ["var(--font-instrument)", "Georgia", "serif"],
        sans: ["var(--font-jakarta)", "system-ui", "sans-serif"],
      },
      colors: {
        ev: {
          charcoal: "#2C2926",
          "charcoal-light": "#4A453F",
          elephant: "#6B6560",
          "warm-gray": "#8A837B",
          dust: "#B5ADA4",
          sand: "#D4CCC3",
          cream: "#F0EBE3",
          ivory: "#F8F5F0",
        },
        accent: {
          savanna: "#C4A46C",
          gold: "#A8873B",
          "deep-gold": "#8B6E2F",
        },
        nature: {
          sage: "#7A8B6F",
          "deep-sage": "#5A6B4F",
          earth: "#6B4F3A",
          terracotta: "#C4785A",
          sunset: "#D4956B",
        },
        background: {
          page: "#F8F5F0",
          surface: "#F0EBE3",
          elevated: "#FFFFFF",
          dark: "#2C2926",
          "dark-surface": "#4A453F",
        },
        success: {
          DEFAULT: "#10C876",
          light: "#22DD88",
        },
        warning: {
          DEFAULT: "#F5A025",
        },
        danger: {
          DEFAULT: "#EF4444",
        },
        spectrogram: {
          low: "#0C1A2A",
          mid: "#00D9FF",
          high: "#FFD700",
          peak: "#EF4444",
        },
      },
      borderColor: {
        DEFAULT: "#D4CCC3",
      },
      borderRadius: {
        sm: "0.125rem",
        DEFAULT: "0.5rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "0.75rem",
        "2xl": "1rem",
      },
      backgroundImage: {
        "gradient-spectrogram":
          "linear-gradient(to right, #0C1A2A, #00D9FF, #FFD700, #EF4444)",
      },
      boxShadow: {
        glow: "0 0 20px rgba(196, 164, 108, 0.15)",
        "glow-lg": "0 0 40px rgba(196, 164, 108, 0.2)",
        card: "0 1px 3px rgba(44, 41, 38, 0.05), 0 4px 16px rgba(44, 41, 38, 0.03)",
        "card-hover":
          "0 8px 25px rgba(44, 41, 38, 0.08), 0 2px 8px rgba(44, 41, 38, 0.04)",
        "card-elevated":
          "0 12px 40px rgba(44, 41, 38, 0.1), 0 4px 12px rgba(44, 41, 38, 0.06)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.92)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "glow-pulse": {
          "0%, 100%": {
            boxShadow: "0 0 0 0 rgba(196, 164, 108, 0)",
          },
          "50%": {
            boxShadow: "0 0 24px 4px rgba(196, 164, 108, 0.12)",
          },
        },
      },
      animation: {
        shimmer: "shimmer 2s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out",
        float: "float 4s ease-in-out infinite",
        "slide-up": "slide-up 0.5s ease-out",
        "scale-in": "scale-in 0.4s ease-out",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
