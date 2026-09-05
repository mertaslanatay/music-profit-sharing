import type { ReactNode } from "react";

/** Giriş, kayıt ve şifre ekranlarının ortak çerçevesi. */
export function AuthShell({
  title,
  sub,
  children,
  footer,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-10 bg-ink-900/[0.02]">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0 p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="M4NM" className="w-full h-full object-contain" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-ink-900 leading-tight">M4NM</p>
            <p className="text-[11.5px] text-ink-400 leading-tight">Pulse</p>
          </div>
        </div>

        <div className="rounded-xl2 bg-card border border-line shadow-card p-6">
          <h1 className="text-[19px] font-semibold text-ink-900 leading-tight">{title}</h1>
          {sub && <p className="text-[13px] text-ink-500 mt-1.5 leading-relaxed">{sub}</p>}
          <div className="mt-5">{children}</div>
        </div>

        {footer && <div className="mt-4 text-center text-[13px] text-ink-500">{footer}</div>}
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
      <span className="text-[12.5px] font-medium text-ink-700">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="block text-[11.5px] text-ink-400 mt-1">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full px-3.5 py-2.5 rounded-xl border border-line bg-white text-[14px] text-ink-900 " +
  "placeholder:text-ink-300 outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100 " +
  "transition-colors disabled:bg-ink-900/[0.03] disabled:text-ink-400";

export const buttonClass =
  "w-full px-4 py-2.5 rounded-xl text-[14px] font-semibold bg-brand-600 text-white " +
  "hover:bg-brand-700 active:bg-brand-700 disabled:opacity-55 disabled:cursor-not-allowed " +
  "transition-colors";

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
