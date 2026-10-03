import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#080c14",
        surface: {
          50: "#1e293b",
          100: "#172033",
          200: "#0f172a",
          300: "#0b1120",
          400: "#070b14",
        },
        brand: {
          DEFAULT: "#6366f1",
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        score: {
          high: "#10b981",
          medium: "#f59e0b",
          low: "#ef4444",
        }
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "radial-highlight": "radial-gradient(circle at 50% 0%, rgba(99, 102, 241, 0.15), transparent 50%)",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(0, 0, 0, 0.37)",
        glow: "0 0 20px -3px rgba(99, 102, 241, 0.45)",
        "glow-emerald": "0 0 20px -3px rgba(16, 185, 129, 0.45)",
      },
    },
  },
  plugins: [],
};
export default config;
