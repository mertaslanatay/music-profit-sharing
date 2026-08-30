"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { PeriodRow, ReportRow } from "@/lib/queries";
import { money } from "@/lib/format";
import { Icon } from "./ui";

/**
 * İki farklı dönem seçici — çünkü iki farklı soru soruyorlar:
 *
 *  • Ödeme Listesi  → "hangi ödemeyi dağıtıyorum?"  Bir Virgin transferi bir
 *    Excel dosyasına karşılık gelir (P03+P04 birlikte). Tek seçim, dropdown.
 *
 *  • Diğer ekranlar → "hangi tarih aralığını inceliyorum?"  Serbest analiz;
 *    ay ve yıl çoklu seçilebilir.
 */

/* --------------------------------------------------- ödeme partisi (tekli) */

export function PayoutPicker({
  reports,
  value,
  onChange,
  pending,
}: {
  reports: ReportRow[];
  /** rapor id veya "all" */
  value: string;
  onChange: (v: string) => void;
  pending?: boolean;
}) {
  const published = reports.filter((r) => r.status !== "draft");
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-xl bg-ink-900/[0.05] flex items-center justify-center shrink-0">
        <Icon name={pending ? "clock" : "bank"} size={17} className="text-ink-700" />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-ink-400 mb-1">Ödeme partisi</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-xl border border-line px-3 py-1.5 text-[13px] font-medium bg-white outline-none focus:border-brand-500 transition-colors min-w-[240px]"
        >
          <option value="all">Tüm zamanlar</option>
          {published.map((r) => (
            <option key={r.id} value={r.id}>
              {r.periodRange}
              {r.periodDisplay ? ` — ${r.periodDisplay}` : ""}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/* ------------------------------------------------- ay / yıl (çoklu seçim) */

export function AnalysisPicker({
  periods,
  selected,
  onChange,
  pending,
}: {
  periods: PeriodRow[];
  /** seçili dönem id'leri; boş = tüm zamanlar */
  selected: string[];
  onChange: (ids: string[]) => void;
  pending?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Seçim önce yerelde birikir, menü kapanınca tek seferde uygulanır.
  // Her kutucukta sunucuya gitmek hem yavaş hem de menüyü kapatıyordu.
  const [draft, setDraft] = useState<string[]>(selected);
  const box = useRef<HTMLDivElement>(null);

  // Dışarıdan (URL'den) değişirse taslağı eşitle
  useEffect(() => { setDraft(selected); }, [selected]);

  const same = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();

  const close = () => {
    setOpen(false);
    if (!same(draft, selected)) onChange(draft);
  };

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDraft(selected); setOpen(false); }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  });

  const years = Array.from(new Set(periods.map((p) => p.year))).sort((a, b) => b - a);
  const set = new Set(draft);

  const toggle = (id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDraft(Array.from(next));
  };

  const toggleYear = (year: number) => {
    const ids = periods.filter((p) => p.year === year).map((p) => p.id);
    const allOn = ids.every((id) => set.has(id));
    const next = new Set(set);
    for (const id of ids) {
      if (allOn) next.delete(id);
      else next.add(id);
    }
    setDraft(Array.from(next));
  };

  const label =
    selected.length === 0
      ? "Tüm zamanlar"
      : selected.length === 1
        ? (periods.find((p) => p.id === selected[0])?.display ?? "1 dönem")
        : `${selected.length} dönem seçili`;
  const dirty = !same(draft, selected);

  return (
    <div className="flex items-center gap-2.5" ref={box}>
      <div className="w-9 h-9 rounded-xl bg-ink-900/[0.05] flex items-center justify-center shrink-0">
        <Icon name={pending ? "clock" : "clock"} size={17} className="text-ink-700" />
      </div>
      <div className="relative">
        <label className="block text-[11px] font-medium text-ink-400 mb-1">Tarih aralığı</label>
        <button
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          className={clsx(
            "rounded-xl border px-3 py-1.5 text-[13px] font-medium bg-white outline-none transition-colors min-w-[200px] text-left inline-flex items-center gap-2",
            open ? "border-brand-500" : "border-line hover:border-ink-300"
          )}
        >
          <span className="flex-1 truncate">{label}</span>
          <Icon name="back" size={13} className={clsx("shrink-0 opacity-50 transition-transform", open ? "rotate-90" : "-rotate-90")} />
        </button>

        {open && (
          <div className="absolute z-30 mt-1.5 w-[290px] max-h-[380px] overflow-y-auto scroll-thin rounded-xl2 bg-card border border-line shadow-pop p-2 fade-in">
            <button
              type="button"
              onClick={() => setDraft([])}
              className={clsx(
                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] transition-colors",
                draft.length === 0 ? "bg-brand-50 text-brand-700 font-medium" : "hover:bg-ink-900/[0.04] text-ink-700"
              )}
            >
              <Box checked={draft.length === 0} />
              Tüm zamanlar
            </button>

            <div className="h-px bg-line my-1.5" />

            {years.map((year) => {
              const ys = periods.filter((p) => p.year === year);
              const allOn = ys.every((p) => set.has(p.id));
              const someOn = !allOn && ys.some((p) => set.has(p.id));
              return (
                <div key={year} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggleYear(year)}
                    className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-ink-900/[0.04] transition-colors"
                  >
                    <Box checked={allOn} partial={someOn} />
                    <span className="text-[13px] font-semibold text-ink-900 flex-1 text-left">{year}</span>
                    <span className="text-[11px] text-ink-400 tabular">
                      {money(ys.reduce((a, p) => a + p.gross, 0))}
                    </span>
                  </button>
                  {ys.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggle(p.id)}
                      className="w-full flex items-center gap-2.5 pl-8 pr-2.5 py-1.5 rounded-xl hover:bg-ink-900/[0.04] transition-colors"
                    >
                      <Box checked={set.has(p.id)} />
                      <span className="text-[12.5px] text-ink-700 flex-1 text-left">{p.display}</span>
                      <span className="text-[11px] text-ink-400 tabular">{money(p.gross)}</span>
                    </button>
                  ))}
                </div>
              );
            })}

            <div className="h-px bg-line my-1.5" />
            <div className="flex items-center gap-2 px-1 pb-0.5">
              <button
                type="button"
                onClick={() => setDraft([])}
                disabled={draft.length === 0}
                className="text-[12px] text-ink-500 hover:text-accent-rose py-1.5 transition-colors disabled:opacity-40"
              >
                Temizle
              </button>
              <button
                type="button"
                onClick={close}
                className={clsx(
                  "ml-auto px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors",
                  dirty ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-ink-900/[0.05] text-ink-500"
                )}
              >
                {dirty ? "Uygula" : "Kapat"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Box({ checked, partial }: { checked: boolean; partial?: boolean }) {
  return (
    <span
      className={clsx(
        "w-4 h-4 rounded-[5px] border shrink-0 flex items-center justify-center transition-colors",
        checked ? "bg-brand-500 border-brand-500"
          : partial ? "bg-brand-100 border-brand-300"
          : "bg-white border-ink-300"
      )}
    >
      {checked && <Icon name="check" size={11} className="text-white" strokeWidth={3} />}
      {partial && !checked && <span className="w-1.5 h-0.5 rounded bg-brand-600" />}
    </span>
  );
}
