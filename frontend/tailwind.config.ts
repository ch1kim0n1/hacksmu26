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
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
        mono: ["Courier New", "Courier", "monospace"],
      },
      colors: {
        echofield: {
          bg: "var(--echofield-bg)",
          surface: "var(--echofield-surface)",
          "surface-elevated": "var(--echofield-surface-elevated)",
          border: "var(--echofield-border)",
          "text-primary": "var(--echofield-text-primary)",
          "text-secondary": "var(--echofield-text-secondary)",
          "text-muted": "var(--echofield-text-muted)",
        },
        accent: {
          teal: "var(--accent-teal)",
          DEFAULT: "var(--accent-teal)",
        },
        success: {
          DEFAULT: "var(--success)",
          light: "#22DD88",
        },
        warning: {
          DEFAULT: "var(--warning)",
        },
        danger: {
          DEFAULT: "var(--danger)",
        },
        gold: {
          DEFAULT: "var(--gold)",
        },
        elephant: {
          DEFAULT: "var(--elephant)",
        },
        spectrogram: {
          low: "var(--spectrogram-low)",
          mid: "var(--spectrogram-mid)",
          high: "var(--spectrogram-high)",
          peak: "var(--spectrogram-peak)",
        },
      },
      borderRadius: {
        sm: "0.25rem",
        DEFAULT: "0.5rem",
        md: "0.5rem",
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        glow: "0 0 20px rgba(0, 217, 255, 0.15)",
        "glow-lg": "0 0 40px rgba(0, 217, 255, 0.2)",
        "glow-success": "0 0 20px rgba(16, 200, 118, 0.2)",
        "glow-gold": "0 0 20px rgba(212, 175, 55, 0.15)",
        card: "0 2px 8px rgba(0, 0, 0, 0.3)",
        "card-hover": "0 4px 16px rgba(0, 0, 0, 0.4)",
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
        88: "22rem",
      },
      backgroundImage: {
        "gradient-spectrogram":
          "linear-gradient(to right, var(--spectrogram-low), var(--spectrogram-mid), var(--spectrogram-high), var(--spectrogram-peak))",
        "gradient-success":
          "linear-gradient(135deg, var(--success), #22DD88)",
        "gradient-radial-teal":
          "radial-gradient(circle, rgba(0,217,255,0.08) 0%, transparent 70%)",
        "gradient-radial-gold":
          "radial-gradient(circle, rgba(212,175,55,0.06) 0%, transparent 70%)",
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
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 8px rgba(0, 217, 255, 0.2)" },
          "50%": { boxShadow: "0 0 20px rgba(0, 217, 255, 0.4)" },
        },
      },
      animation: {
        shimmer: "shimmer 2s ease-in-out infinite",
        "fade-in": "fade-in 0.3s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
