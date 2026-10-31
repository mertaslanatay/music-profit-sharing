"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { initials } from "@/lib/format";
import { SORT_LABELS, type CatalogSort } from "@/lib/catalog";
import { Icon } from "../ui";

export type Layout = "grid" | "list";

/**
 * Grid / liste tercihi — ekran başına tarayıcıda hatırlanır.
 * localStorage özel pencerede veya engelliyse sessizce varsayılana düşer.
 */
export function useLayout(storageKey: string, fallback: Layout = "grid") {
  const [layout, setLayout] = useState<Layout>(fallback);
  useEffect(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === "grid" || v === "list") setLayout(v);
    } catch { /* depolama kapalı */ }
  }, [storageKey]);
  const change = (v: Layout) => {
    setLayout(v);
    try { localStorage.setItem(storageKey, v); } catch { /* depolama kapalı */ }
  };
  return [layout, change] as const;
}

export function CatalogToolbar({
  query,
  onQuery,
  placeholder,
  filterLabel,
  filterValue,
  filterOptions,
  onFilter,
  sort,
  onSort,
  layout,
  onLayout,
  count,
  noun,
}: {
  query: string;
  onQuery: (v: string) => void;
  placeholder: string;
  filterLabel: string;
  filterValue: string;
  filterOptions: { value: string; label: string }[];
  onFilter: (v: string) => void;
  sort: CatalogSort;
  onSort: (v: CatalogSort) => void;
  layout: Layout;
  onLayout: (v: Layout) => void;
  count: number;
  noun: string;
}) {
  return (
    <div className="rounded-[22px] bg-card border border-line p-3 sm:p-4 flex flex-wrap items-center gap-2.5">
      <div className="relative flex-1 min-w-[200px]">
        <Icon name="search" size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full h-10 rounded-xl border border-line bg-canvas pl-9 pr-9 text-[13.5px] text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 transition-all"
        />
        {query && (
          <button type="button" onClick={() => onQuery("")} aria-label="Aramayı temizle"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-700">
            <Icon name="close" size={14} />
          </button>
        )}
      </div>

      <label className="sr-only" htmlFor={`f-${noun}`}>{filterLabel}</label>
      <select
        id={`f-${noun}`}
        value={filterValue}
        onChange={(e) => onFilter(e.target.value)}
        className="h-10 max-w-[220px] rounded-xl border border-line bg-canvas px-3 text-[13px] text-ink-800"
      >
        <option value="">{filterLabel}: Tümü</option>
        {filterOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <label className="sr-only" htmlFor={`s-${noun}`}>Sıralama</label>
      <select
        id={`s-${noun}`}
        value={sort}
        onChange={(e) => onSort(e.target.value as CatalogSort)}
        className="h-10 rounded-xl border border-line bg-canvas px-3 text-[13px] text-ink-800"
      >
        {(Object.keys(SORT_LABELS) as CatalogSort[]).map((k) => (
          <option key={k} value={k}>{SORT_LABELS[k]}</option>
        ))}
      </select>

      <div className="inline-flex rounded-xl border border-line bg-canvas p-1" role="group" aria-label="Görünüm">
        {(["grid", "list"] as const).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => onLayout(l)}
            aria-pressed={layout === l}
            title={l === "grid" ? "Grid görünümü" : "Liste görünümü"}
            className={clsx(
              "w-9 h-8 rounded-lg grid place-items-center transition-colors",
              layout === l ? "bg-brand-500 text-white" : "text-ink-400 hover:text-ink-800"
            )}
          >
            <Icon name={l === "grid" ? "dashboard" : "list"} size={16} />
          </button>
        ))}
      </div>

      <span className="text-[12px] text-ink-400 tabular whitespace-nowrap sm:ml-1">
        {count.toLocaleString("tr-TR")} {noun}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- kapak */

/**
 * Albüm kapağı. Veride gerçek kapak görseli yok; addan kararlı (her seferinde
 * aynı) bir renk ikilisi ve plak çizgileri üretiyoruz. Palet Ledger
 * kurallarına uygun: kobalt, turuncu, gök, güneş, mercan — yeşil ve mor yok.
 */
const COVER_PAIRS: [string, string][] = [
  ["#3D5CFF", "#22B8F5"],
  ["#FF7A2F", "#FFC234"],
  ["#2438B0", "#3D5CFF"],
  ["#FF6B57", "#FF7A2F"],
  ["#22B8F5", "#7FD4FF"],
  ["#FFC234", "#FF9F7A"],
  ["#1B2470", "#FF7A2F"],
  ["#3D5CFF", "#FF6B57"],
  ["#0E1A4F", "#22B8F5"],
  ["#D29A4A", "#FFC234"],
];

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

export function Cover({ name, size, className }: { name: string; size?: number; className?: string }) {
  const h = hash(name);
  const [a, b] = COVER_PAIRS[h % COVER_PAIRS.length];
  const angle = (h >> 4) % 360;
  const cx = 30 + ((h >> 8) % 40);
  const cy = 30 + ((h >> 12) % 40);
  return (
    <div
      className={clsx("relative overflow-hidden select-none shrink-0", size ? "rounded-xl" : "rounded-2xl aspect-square w-full", className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(${angle}deg, ${a}, ${b})`,
      }}
      aria-hidden
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: `repeating-radial-gradient(circle at ${cx}% ${cy}%, rgba(255,255,255,.35) 0 1px, transparent 1px 7px)`,
        }}
      />
      <div className="absolute inset-0 grid place-items-center">
        <span
          className="font-display font-bold text-white/95 tracking-[-0.04em] drop-shadow-sm"
          style={{ fontSize: size ? Math.max(11, Math.round(size * 0.36)) : "clamp(22px, 4vw, 40px)" }}
        >
          {initials(name)}
        </span>
      </div>
    </div>
  );
}

export function NoResults({ onClear }: { onClear?: () => void }) {
  return (
    <div className="rounded-[22px] bg-card border border-line py-16 text-center">
      <div className="inline-flex w-12 h-12 rounded-2xl bg-ink-900/[0.04] items-center justify-center text-ink-400 mb-3">
        <Icon name="search" />
      </div>
      <p className="text-[14px] font-medium text-ink-700">Sonuç bulunamadı</p>
      <p className="text-[12.5px] text-ink-400 mt-1">Aramayı veya filtreyi değiştirmeyi dene.</p>
      {onClear && (
        <button type="button" onClick={onClear}
          className="mt-4 text-[12.5px] font-medium text-brand-700 hover:underline">
          Filtreleri temizle
        </button>
      )}
    </div>
  );
}
