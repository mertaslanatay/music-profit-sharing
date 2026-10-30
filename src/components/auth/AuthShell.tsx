import type { ReactNode } from "react";

import { Logo, ThemeToggle } from "../theme";
import { AuthSwitch } from "./AuthSwitch";

/** Giriş, kayıt ve şifre ekranlarının ortak çerçevesi (Ledger). */
export function AuthShell({
  title,
  sub,
  children,
  footer,
  mode,
  steps,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Verilirse üstte Giriş yap / Kayıt ol anahtarı çıkar. */
  mode?: "login" | "register";
  /** Kayıt adımları şeridi — 1 tabanlı etkin adım. */
  steps?: { labels: string[]; active: number };
}) {
  return (
    <main className="relative min-h-screen overflow-hidden flex flex-col bg-canvas">
      <span aria-hidden className="orb bg-brand-500 opacity-40 [html[data-theme=light]_&]:opacity-20"
        style={{ width: 520, height: 520, left: "50%", top: "14%", marginLeft: -470 }} />
      <span aria-hidden className="orb bg-accent-orange opacity-30 [html[data-theme=light]_&]:opacity-[0.16]"
        style={{ width: 380, height: 380, left: "50%", top: "40%", marginLeft: 90, animationDelay: "-6s" }} />

      <header className="relative flex justify-end px-5 sm:px-10 pt-6">
        <ThemeToggle />
      </header>

      <div className="relative flex-1 flex flex-col items-center px-4 pb-14 pt-2">
        <div data-aos="fade-up" className="mb-7">
          <Logo size="lg" />
        </div>

        <div
          data-aos="fade-up"
          data-aos-delay="100"
          className="w-full max-w-[460px] rounded-[26px] bg-card border border-line p-6 sm:p-10"
          style={{ boxShadow: "var(--shadow-float)" }}
        >
          {mode && (
            <div className="mb-7">
              <AuthSwitch mode={mode} />
            </div>
          )}
          <h1 className="font-display text-[30px] sm:text-[34px] font-bold tracking-[-0.035em] text-ink-900 leading-[1.05]">
            {title}
          </h1>
          {sub && <p className="text-[15px] text-ink-500 mt-2.5 leading-relaxed">{sub}</p>}

          {steps && (
            <ol aria-label="Kayıt adımları" className="mt-5 flex flex-wrap gap-x-5 gap-y-2.5 rounded-2xl bg-canvas px-4 py-3.5">
              {steps.labels.map((l, i) => {
                const on = i + 1 === steps.active;
                return (
                  <li key={l} className={`flex items-center gap-2 text-[12.5px] ${on ? "text-ink-900 font-semibold" : "text-ink-500"}`}>
                    <span className={`w-[22px] h-[22px] rounded-full grid place-items-center text-[11px] font-bold ${
                      on ? "bg-brand-500 text-white" : "border border-line-strong"}`}>
                      {i + 1}
                    </span>
                    {l}
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-6">{children}</div>
        </div>

        {footer && <div className="mt-5 text-center text-[13.5px] text-ink-500">{footer}</div>}
      </div>
    </main>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink-800">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <span className="block text-[12px] text-ink-400 mt-1.5 leading-relaxed">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full h-12 px-3.5 rounded-xl border border-line-strong bg-card text-[15px] text-ink-900 " +
  "placeholder:text-ink-400 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 " +
  "transition-[border-color,box-shadow] duration-200 disabled:bg-ink-900/[0.03] disabled:text-ink-400";

export const buttonClass =
  "w-full h-[50px] px-4 rounded-full text-[15px] font-semibold bg-brand-500 text-white shadow-accent " +
  "hover:brightness-110 hover:-translate-y-px active:translate-y-0 disabled:opacity-55 disabled:cursor-not-allowed " +
  "disabled:hover:translate-y-0 disabled:hover:brightness-100 transition-all duration-300 ease-out";

export function Alert({ tone, children }: { tone: "error" | "ok" | "info"; children: ReactNode }) {
  const cls =
    tone === "error"
      ? "bg-rose-50 border-rose-200 text-accent-rose"
      : tone === "ok"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : "bg-brand-50 border-brand-100 text-brand-700";
  return (
    <div className={`rounded-xl border px-3.5 py-2.5 text-[12.5px] leading-relaxed ${cls}`}>
      {children}
    </div>
  );
}
