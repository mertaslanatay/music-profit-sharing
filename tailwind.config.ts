import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0F1720",
          700: "#33414F",
          500: "#64748B",
          400: "#8A97A6",
          300: "#B4BEC9",
        },
        canvas: "#F1F3F5",
        card: "#FFFFFF",
        line: "#E8ECEF",
        brand: {
          50: "#E9F9F0",
          100: "#CFF3E0",
          300: "#7BD9A9",
          500: "#16A75C",
          600: "#0E8C4B",
          700: "#0A6E3B",
        },
        accent: {
          violet: "#7C6BF5",
          amber: "#F2A93B",
          rose: "#E5556E",
          sky: "#3FA9E8",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl2: "18px",
        xl3: "24px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,32,0.04), 0 1px 3px rgba(15,23,32,0.03)",
        pop: "0 12px 32px rgba(15,23,32,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
