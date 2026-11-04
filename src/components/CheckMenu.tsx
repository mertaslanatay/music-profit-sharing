"use client";

import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { Icon } from "./ui";

/**
 * Kutucuklu açılır menü — PeriodPicker'daki dönem seçicisiyle aynı dil
 * (kart zemin, shadow-pop, Box kutucuğu, Temizle).
 *
 * Seçim ANINDA uygulanır: bu menüler istemci tarafında süzüyor, sunucuya
 * gitmiyor — "Uygula" adımı gereksiz tıklama olurdu.
 */
export interface CheckOption {
  value: string;
  label: string;
  /** Sağda küçük gri yazı (ör. tutar, sayı). */
  hint?: string;
}

export function CheckMenu({
  icon,
  allLabel,
  unit,
  options,
  selected,
  onChange,
  title,
  align = "left",
  width = 260,
  badge = false,
  empty,
}: {
  icon: string;
  /** Hiçbir şey seçili değilken düğme yazısı — ör. "Tüm label'lar". */
  allLabel: string;
  /** Çoklu seçimde: "3 {unit} seçili". */
  unit: string;
  options: CheckOption[];
  selected: string[];
  onChange: (v: string[]) => void;
  /** Menünün üst başlığı. */
  title?: string;
  align?: "left" | "right";
  width?: number;
  /** true: düğmede sabit yazı + seçim sayısı rozeti (Filtre düğmesi). */
  badge?: boolean;
  /** Seçenek yokken menüde gösterilecek metin. */
  empty?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const set = new Set(selected);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (v: string) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    onChange(options.map((o) => o.value).filter((x) => next.has(x)));
  };

  const text = badge
    ? allLabel
    : selected.length === 0
      ? allLabel
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? `1 ${unit}`
        : `${selected.length} ${unit} seçili`;
  const active = selected.length > 0;

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={menuId}
        className={clsx(
          "h-9 rounded-xl border px-3 text-[13px] font-medium bg-card outline-none transition-colors inline-flex items-center gap-2 max-w-[220px]",
          open ? "border-brand-500 ring-4 ring-brand-500/20" : active ? "border-brand-500/60" : "border-line hover:border-ink-300",
          active ? "text-ink-900" : "text-ink-700"
        )}
      >
        <Icon name={icon} size={15} className={clsx("shrink-0", active ? "text-brand-600" : "text-ink-400")} />
        <span className="truncate">{text}</span>
        {badge && active && (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10.5px] font-bold tabular inline-flex items-center justify-center">
            {selected.length}
          </span>
        )}
        <Icon name="back" size={12} className={clsx("shrink-0 opacity-50 transition-transform", open ? "rotate-90" : "-rotate-90")} />
      </button>

      {open && (
        <div
          id={menuId}
          className={clsx(
            "absolute z-30 mt-1.5 max-h-[380px] overflow-y-auto scroll-thin rounded-xl2 bg-card border border-line shadow-pop p-2 fade-in",
            align === "right" ? "left-0 sm:left-auto sm:right-0" : "left-0"
          )}
          style={{ width }}
        >
          {title && <p className="eyebrow px-2.5 pt-1 pb-2">{title}</p>}
          {!badge && (
            <>
              <button
                type="button"
                onClick={() => onChange([])}
                className={clsx(
                  "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] transition-colors",
                  selected.length === 0 ? "bg-brand-50 text-brand-700 font-medium" : "hover:bg-ink-900/[0.04] text-ink-700"
                )}
              >
                <Box checked={selected.length === 0} />
                {allLabel}
              </button>
              <div className="h-px bg-line my-1.5" />
            </>
          )}
          {options.length === 0 && empty && (
            <p className="px-2.5 py-2 text-[12.5px] text-ink-400">{empty}</p>
          )}
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemcheckbox"
              aria-checked={set.has(o.value)}
              onClick={() => toggle(o.value)}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-ink-900/[0.04] transition-colors"
            >
              <Box checked={set.has(o.value)} />
              <span className="text-[12.5px] text-ink-700 flex-1 text-left truncate">{o.label}</span>
              {o.hint && <span className="text-[11px] text-ink-400 tabular shrink-0">{o.hint}</span>}
            </button>
          ))}
          <div className="h-px bg-line my-1.5" />
          <div className="flex items-center gap-2 px-1 pb-0.5">
            <button
              type="button"
              onClick={() => onChange([])}
              disabled={selected.length === 0}
              className="text-[12px] text-ink-500 hover:text-accent-rose py-1.5 transition-colors disabled:opacity-40"
            >
              Temizle
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium bg-ink-900/[0.05] text-ink-600 hover:bg-ink-900/[0.08] transition-colors"
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Box({ checked, partial }: { checked: boolean; partial?: boolean }) {
  return (
    <span
      className={clsx(
        "w-4 h-4 rounded-[5px] border shrink-0 flex items-center justify-center transition-colors",
        checked ? "bg-brand-500 border-brand-500"
          : partial ? "bg-brand-100 border-brand-300"
          : "bg-card border-ink-300"
      )}
    >
      {checked && <Icon name="check" size={11} className="text-white" strokeWidth={3} />}
      {partial && !checked && <span className="w-1.5 h-0.5 rounded bg-brand-600" />}
    </span>
  );
}
