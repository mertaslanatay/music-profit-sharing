"use client";

import clsx from "clsx";
import { useEffect, type ReactNode } from "react";
import { colorFor, initials, money, moneySmart, num, pct } from "@/lib/format";

export function Card({
  className,
  children,
  pad = true,
}: {
  className?: string;
  children: ReactNode;
  pad?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-xl2 bg-card border border-line shadow-card",
        pad && "p-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHead({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink-900 leading-tight">{title}</h3>
        {sub && <p className="text-[12.5px] text-ink-500 mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  badge,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: string;
  tone?: "neutral" | "up" | "down" | "brand" | "violet";
  icon?: ReactNode;
}) {
  const badgeTone = {
    neutral: "bg-ink-900/5 text-ink-700",
    up: "bg-brand-50 text-brand-700",
    down: "bg-rose-50 text-accent-rose",
    brand: "bg-brand-50 text-brand-700",
    violet: "bg-violet-50 text-accent-violet",
  }[tone];

  return (
    <Card className="rise">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-ink-500">{label}</p>
        {icon}
      </div>
      <div className="flex items-end gap-2 mt-2 flex-wrap">
        <span className="text-[27px] leading-none font-semibold text-ink-900 tabular tracking-tight">
          {value}
        </span>
        {badge && (
          <span className={clsx("text-[11px] font-semibold px-2 py-0.5 rounded-full", badgeTone)}>
            {badge}
          </span>
        )}
      </div>
      {sub && <p className="text-[12px] text-ink-400 mt-2">{sub}</p>}
    </Card>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const bg = colorFor(name);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold text-white shrink-0 select-none"
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: Math.max(10, Math.round(size * 0.38)),
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Bar({ value, max, color = "#16A75C" }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.max(1.5, (Math.max(value, 0) / max) * 100) : 0;
  return (
    <div className="h-1.5 rounded-full bg-ink-900/[0.06] overflow-hidden w-full">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${w}%`, background: color }} />
    </div>
  );
}

export function Pill({
  active,
  children,
  onClick,
  title,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={clsx(
        "px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors whitespace-nowrap",
        active
          ? "bg-ink-900 text-white"
          : "bg-ink-900/[0.04] text-ink-700 hover:bg-ink-900/[0.08]"
      )}
    >
      {children}
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = "ghost",
  className,
  disabled,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "soft";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
  title?: string;
}) {
  const styles = {
    primary: "bg-brand-500 text-white hover:bg-brand-600 shadow-sm",
    ghost: "bg-white border border-line text-ink-700 hover:bg-ink-900/[0.03]",
    soft: "bg-ink-900/[0.05] text-ink-700 hover:bg-ink-900/[0.09]",
    danger: "bg-white border border-rose-200 text-accent-rose hover:bg-rose-50",
  }[variant];
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]",
        styles,
        className
      )}
    >
      {children}
    </button>
  );
}

export function Empty({ title, sub, icon }: { title: string; sub?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-2xl bg-ink-900/[0.04] flex items-center justify-center text-ink-400 mb-3">
        {icon ?? <Icon name="search" />}
      </div>
      <p className="text-[14px] font-medium text-ink-700">{title}</p>
      {sub && <p className="text-[12.5px] text-ink-400 mt-1 max-w-sm">{sub}</p>}
    </div>
  );
}

/** Ad + gelir + oransal bar içeren kompakt liste satırı. */
export function RankRow({
  rank,
  name,
  value,
  max,
  total,
  color,
  prefix,
  onClick,
  precise,
}: {
  rank?: number;
  name: string;
  value: number;
  max: number;
  total: number;
  color?: string;
  prefix?: ReactNode;
  onClick?: () => void;
  precise?: boolean;
}) {
  const Wrapper: "button" | "div" = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={clsx(
        "w-full text-left flex items-center gap-3 py-2 px-2 -mx-2 rounded-xl transition-colors",
        onClick && "hover:bg-ink-900/[0.03] cursor-pointer"
      )}
    >
      {rank !== undefined && (
        <span className="w-5 text-[12px] font-semibold text-ink-300 tabular shrink-0">{rank}</span>
      )}
      {prefix}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium text-ink-900 truncate">{name}</span>
          <span className="text-[13px] font-semibold text-ink-900 tabular shrink-0">
            {moneySmart(value, precise)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <Bar value={value} max={max} color={color} />
          <span className="text-[11px] text-ink-400 tabular w-11 text-right shrink-0">
            {pct(total > 0 ? value / total : 0)}
          </span>
        </div>
      </div>
    </Wrapper>
  );
}

export function Th({
  children,
  align = "left",
  className,
  onClick,
  active,
  dir,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  onClick?: () => void;
  active?: boolean;
  dir?: "asc" | "desc";
}) {
  return (
    <th
      onClick={onClick}
      className={clsx(
        "px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400 whitespace-nowrap select-none",
        align === "right" && "text-right",
        align === "center" && "text-center",
        onClick && "cursor-pointer hover:text-ink-700 transition-colors",
        active && "text-ink-900",
        className
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active && <span className="text-[9px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </span>
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
  colSpan,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={clsx(
        "px-3 py-2.5 text-[13px] text-ink-700",
        align === "right" && "text-right tabular",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </td>
  );
}

const PATHS: Record<string, string> = {
  dashboard: "M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z",
  wallet: "M3 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM16 12h3",
  music: "M9 18V5l10-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  tag: "M3 7v6l8 8 8-8-8-8H5a2 2 0 0 0-2 2zM7.5 8.5h.01",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18",
  play: "M5 3l14 9-14 9z",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  upload: "M12 16V4m0 0L7 9m5-5l5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  download: "M12 4v12m0 0l5-5m-5 5l-5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  close: "M6 6l12 12M18 6L6 18",
  check: "M4 12l5 5L20 6",
  bank: "M3 10l9-6 9 6M5 10v9M19 10v9M9 10v9M15 10v9M3 21h18",
  users: "M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM21 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  copy: "M9 9h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  alert: "M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  merge: "M7 21V9a4 4 0 0 1 4-4h6M17 5l-3-3M17 5l-3 3",
  split: "M6 3v6a4 4 0 0 0 4 4h8M18 13l-3-3M18 13l-3 3",
  trash: "M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13",
  save: "M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 3v6h7M8 21v-6h8v6",
  print: "M7 9V3h10v6M7 19H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 15h10v6H7z",
  back: "M15 18l-6-6 6-6",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM22 6l-10 7L2 6",
};

export function Icon({
  name,
  size = 17,
  className,
  strokeWidth = 1.8,
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const d = PATHS[name] ?? PATHS.dashboard;
  const filled = name === "play";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}


/* ------------------------------------------------------------------ Drawer */

/**
 * Sağdan açılan panel.
 *
 * Bu desen uygulamada üç yerde elle tekrar ediliyordu (sanatçı dökümü, cari
 * hesap, bildirimler). Ortak bileşene çekildi: aynı animasyon, aynı gölge,
 * aynı Escape davranışı ve aynı arka plan karartması her yerde geçerli olsun.
 * Mevcut iki drawer'ın görsel çıktısı birebir korunacak şekilde yazıldı.
 */
export function Drawer({
  open,
  onClose,
  title,
  sub,
  width = 560,
  headerRight,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  /** Panel genişliği (px). Varsayılan 560. */
  width?: number;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  // Escape her zaman kapatır — fare kullanmayan biri de çıkabilmeli.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-ink-900/25 z-40 fade-in no-print"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed right-0 top-0 bottom-0 w-full bg-canvas z-50 slide-in overflow-y-auto scroll-thin shadow-pop no-print"
        style={{ maxWidth: width }}
      >
        <div className="sticky top-0 bg-canvas/95 backdrop-blur border-b border-line px-5 py-3.5 flex items-center gap-3 z-10">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink-900 leading-tight truncate">{title}</p>
            {sub && <p className="text-[11.5px] text-ink-400 leading-tight mt-0.5">{sub}</p>}
          </div>
          {headerRight}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-ink-400 hover:bg-ink-900/[0.05] hover:text-ink-700 transition-colors shrink-0"
            title="Kapat (Esc)"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </>
  );
}

export { money, moneySmart, num, pct };
