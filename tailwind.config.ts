import type { Config } from "tailwindcss";

/**
 * Ledger tasarım sistemi.
 *
 * Bütün renkler globals.css'teki CSS değişkenlerinden (RGB kanalları) gelir;
 * koyu/açık tema <html data-theme="…"> ile değişir. Böylece mevcut sınıf
 * adları (ink-900, brand-500, line…) hiç değişmeden iki temada da çalışır ve
 * Tailwind'in saydamlık ekleri (bg-ink-900/[0.04]) korunur.
 *
 * Eski yeşil "brand" ölçeği artık kobalt; varsayılan rose/amber/violet/
 * emerald paletleri de temaya bağlandı — koyu temada açık pembe kutular
 * kalmasın diye.
 */
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const scale = (prefix: string, steps: (string | number)[]) =>
  Object.fromEntries(steps.map((s) => [s, v(`${prefix}-${s}`)]));

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: scale("ink", [900, 800, 700, 600, 500, 400, 300]),
        canvas: v("canvas"),
        card: v("card"),
        side: v("side"),
        line: v("line"),
        "line-strong": v("line-strong"),
        brand: scale("brand", [50, 100, 200, 300, 400, 500, 600, 700]),
        accent: {
          violet: v("orange"),
          amber: v("sun"),
          rose: v("warn"),
          sky: v("sky"),
          orange: v("orange"),
          sun: v("sun"),
          warn: v("warn"),
        },
        rose: scale("rose", [50, 100, 200, 600, 700]),
        amber: scale("amber", [50, 100, 200, 700, 800, 900]),
        violet: scale("violet", [50, 100]),
        emerald: scale("emerald", [50, 200, 600, 700]),
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Inter Tight", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl2: "20px",
        xl3: "26px",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
        accent: "var(--shadow-accent)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(.16,1,.3,1)",
      },
    },
  },
  plugins: [],
};

export default config;
