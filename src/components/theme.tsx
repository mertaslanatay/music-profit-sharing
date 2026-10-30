"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import AOS from "aos";
import "aos/dist/aos.css";

export type Theme = "dark" | "light";
const KEY = "pulse-theme";

/**
 * <head> içinde, boyamadan ÖNCE çalışan küçük betik: kayıtlı temayı uygular.
 * Böylece açık temayı seçen biri sayfa açılırken koyu bir parlama görmez.
 * Varsayılan koyu (Ledger koyu öncelikli tasarlandı).
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${KEY}");if(t!=="light"&&t!=="dark")t="dark";document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`;

function readTheme(): Theme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>("dark");
  useEffect(() => setThemeState(readTheme()), []);
  const setTheme = (t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* gizli pencere: yalnızca bu oturum */
    }
    setThemeState(t);
  };
  return [theme, setTheme];
}

const Sun = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const Moon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
);

/** Açık / koyu tema seçici — iki seçenekli hap. */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useTheme();
  const seg = (on: boolean) =>
    clsx(
      "w-[38px] h-[38px] rounded-full grid place-items-center transition-colors duration-300 ease-out",
      on ? "bg-brand-500 text-white" : "text-ink-400 hover:text-ink-900"
    );
  return (
    <div
      role="group"
      aria-label="Tema"
      className={clsx("inline-flex p-[3px] rounded-full border border-line bg-card shrink-0", className)}
    >
      <button type="button" className={seg(theme === "light")} aria-pressed={theme === "light"}
        aria-label="Açık tema" title="Açık tema" onClick={() => setTheme("light")}>
        <Sun />
      </button>
      <button type="button" className={seg(theme === "dark")} aria-pressed={theme === "dark"}
        aria-label="Koyu tema" title="Koyu tema" onClick={() => setTheme("dark")}>
        <Moon />
      </button>
    </div>
  );
}

/**
 * AOS (Animate On Scroll) — tasarım sistemindeki değerlerle.
 * mutationObserver sayesinde sonradan gelen kartlar da yakalanır; her
 * sayfa geçişinde yeniden taranır. "Hareketi azalt" açıkken tamamen kapalı.
 */
export function AosInit() {
  const pathname = usePathname();
  useEffect(() => {
    AOS.init({
      duration: 900,
      easing: "ease-out-cubic",
      once: true,
      offset: 40,
      disable: () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    });
  }, []);
  useEffect(() => {
    AOS.refreshHard();
  }, [pathname]);
  return null;
}

/** M4NM logosu + altında küçük PULSE. Pulse hiçbir zaman logodan büyük değil. */
export function Logo({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const h = { sm: 30, md: 38, lg: 64 }[size];
  const w = Math.round((h * 640) / 538);
  const label = { sm: "text-[9px] mt-1", md: "text-[10px] mt-1.5", lg: "text-[12px] mt-2.5" }[size];
  return (
    <span className={clsx("inline-flex flex-col items-center leading-none", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-white.png" alt="M4NM" width={w} height={h} className="logo-on-dark" style={{ width: w, height: h }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" aria-hidden width={w} height={h} className="logo-on-light" style={{ width: w, height: h }} />
      <span className={clsx("font-semibold uppercase tracking-[0.34em] pl-[0.34em] text-brand-700", label)}>
        Pulse
      </span>
    </span>
  );
}
