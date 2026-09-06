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
  label = "Ödeme partisi",
  offLabel = "Tüm zamanlar",
  icon = "bank",
}: {
  reports: ReportRow[];
  /** rapor id veya "all" */
  value: string;
  onChange: (v: string) => void;
  pending?: boolean;
  /** Etiket metni — aynı seçiciyi farklı bağlamda (ör. gelir devri) kullanmak için. */
  label?: string;
  /** "all" seçeneğinin görünen adı. */
  offLabel?: string;
  icon?: string;
}) {
  // Sıra: "Tüm zamanlar" → en yeni ödeme dönemi → … → en eski.
  // Sunucu (listReports) zaten döneme göre sıralı döndürüyor; burada tekrar
  // sıralamamızın sebebi, listenin başka bir yerden (ör. önbellek, farklı bir
  // çağrı) gelmesi hâlinde de sıranın garanti olması. Dönemi çözülememiş
  // rapor (periodSort=0) en sona düşer, kendi içinde yükleme tarihine göre.
  const published = reports
    .filter((r) => r.status !== "draft")
    .slice()
    .sort(
      (a, b) =>
        b.periodSort - a.periodSort ||
        (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)
    );
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-xl bg-ink-900/[0.05] flex items-center justify-center shrink-0">
        <Icon name={pending ? "clock" : icon} size={17} className="text-ink-700" />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-ink-400 mb-1">{label}</label>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-xl border border-line px-3 py-1.5 text-[13px] font-medium bg-white outline-none focus:border-brand-500 transition-colors min-w-[240px]"
        >
          <option value="all">{offLabel}</option>
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

/* ------------------------------------------------- yıl / dönem (iki ayrı dropdown) */

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
  // Seçim önce yerelde birikir, menü kapanınca tek seferde uygulanır.
  // Her kutucukta sunucuya gitmek hem yavaş hem de menüyü kapatıyordu.
  const [draft, setDraft] = useState<string[]>(selected);
  const [openWhich, setOpenWhich] = useState<"year" | "period" | null>(null);
  const box = useRef<HTMLDivElement>(null);

  // Dışarıdan (URL'den) değişirse taslağı eşitle
  useEffect(() => { setDraft(selected); }, [selected]);

  const same = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();

  const close = () => {
    setOpenWhich(null);
    if (!same(draft, selected)) onChange(draft);
  };

  useEffect(() => {
    if (!openWhich) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDraft(selected); setOpenWhich(null); }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  });

  const years = Array.from(new Set(periods.map((p) => p.year))).sort((a, b) => b - a);
  const sortedPeriods = [...periods].sort((a, b) => b.sort - a.sort);
  const set = new Set(draft);
  const dirty = !same(draft, selected);

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

  const toggleOpen = (which: "year" | "period") => {
    if (openWhich === which) close();
    else setOpenWhich(which);
  };

  const selectedYears = years.filter((y) => periods.some((p) => p.year === y && set.has(p.id)));
  const yearLabel =
    selectedYears.length === 0
      ? "Tüm yıllar"
      : selectedYears.length === 1
        ? String(selectedYears[0])
        : `${selectedYears.length} yıl seçili`;

  const periodLabel =
    selected.length === 0
      ? "Tüm dönemler"
      : selected.length === 1
        ? (periods.find((p) => p.id === selected[0])?.display ?? "1 dönem")
        : `${selected.length} dönem seçili`;

  return (
    <div className="flex items-center gap-2.5" ref={box}>
      <div className="w-9 h-9 rounded-xl bg-ink-900/[0.05] flex items-center justify-center shrink-0">
        <Icon name="clock" size={17} className="text-ink-700" />
      </div>

      {/* --- Yıl dropdown --- */}
      <div className="relative">
        <label className="block text-[11px] font-medium text-ink-400 mb-1">Yıl</label>
        <button
          type="button"
          onClick={() => toggleOpen("year")}
          className={clsx(
            "rounded-xl border px-3 py-1.5 text-[13px] font-medium bg-white outline-none transition-colors min-w-[130px] text-left inline-flex items-center gap-2",
            openWhich === "year" ? "border-brand-500" : "border-line hover:border-ink-300"
          )}
        >
          <span className="flex-1 truncate">{yearLabel}</span>
          <Icon name="back" size={13} className={clsx("shrink-0 opacity-50 transition-transform", openWhich === "year" ? "rotate-90" : "-rotate-90")} />
        </button>

        {openWhich === "year" && (
          <div className="absolute z-30 mt-1.5 w-[240px] max-h-[380px] overflow-y-auto scroll-thin rounded-xl2 bg-card border border-line shadow-pop p-2 fade-in">
            <button
              type="button"
              onClick={() => setDraft([])}
              className={clsx(
                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] transition-colors",
                draft.length === 0 ? "bg-brand-50 text-brand-700 font-medium" : "hover:bg-ink-900/[0.04] text-ink-700"
              )}
            >
              <Box checked={draft.length === 0} />
              Tüm yıllar
            </button>
            <div className="h-px bg-line my-1.5" />
            {years.map((year) => {
              const ys = periods.filter((p) => p.year === year);
              const allOn = ys.every((p) => set.has(p.id));
              const someOn = !allOn && ys.some((p) => set.has(p.id));
              return (
                <button
                  key={year}
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
              );
            })}
            <PickerFooter dirty={dirty} draft={draft} onClear={() => setDraft([])} onDone={close} />
          </div>
        )}
      </div>

      {/* --- Dönem dropdown --- */}
      <div className="relative">
        <label className="block text-[11px] font-medium text-ink-400 mb-1">
          Dönem{pending ? " · hesaplanıyor…" : ""}
        </label>
        <button
          type="button"
          onClick={() => toggleOpen("period")}
          className={clsx(
            "rounded-xl border px-3 py-1.5 text-[13px] font-medium bg-white outline-none transition-colors min-w-[170px] text-left inline-flex items-center gap-2",
            openWhich === "period" ? "border-brand-500" : "border-line hover:border-ink-300"
          )}
        >
          <span className="flex-1 truncate">{periodLabel}</span>
          <Icon name="back" size={13} className={clsx("shrink-0 opacity-50 transition-transform", openWhich === "period" ? "rotate-90" : "-rotate-90")} />
        </button>

        {openWhich === "period" && (
          <div className="absolute z-30 mt-1.5 w-[260px] max-h-[380px] overflow-y-auto scroll-thin rounded-xl2 bg-card border border-line shadow-pop p-2 fade-in">
            <button
              type="button"
              onClick={() => setDraft([])}
              className={clsx(
                "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[13px] transition-colors",
                draft.length === 0 ? "bg-brand-50 text-brand-700 font-medium" : "hover:bg-ink-900/[0.04] text-ink-700"
              )}
            >
              <Box checked={draft.length === 0} />
              Tüm dönemler
            </button>
            <div className="h-px bg-line my-1.5" />
            {sortedPeriods.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-ink-900/[0.04] transition-colors"
              >
                <Box checked={set.has(p.id)} />
                <span className="text-[12.5px] text-ink-700 flex-1 text-left">{p.display}</span>
                <span className="text-[11px] text-ink-400 tabular">{money(p.gross)}</span>
              </button>
            ))}
            <PickerFooter dirty={dirty} draft={draft} onClear={() => setDraft([])} onDone={close} />
          </div>
        )}
      </div>
    </div>
  );
}

function PickerFooter({
  dirty,
  draft,
  onClear,
  onDone,
}: {
  dirty: boolean;
  draft: string[];
  onClear: () => void;
  onDone: () => void;
}) {
  return (
    <>
      <div className="h-px bg-line my-1.5" />
      <div className="flex items-center gap-2 px-1 pb-0.5">
        <button
          type="button"
          onClick={onClear}
          disabled={draft.length === 0}
          className="text-[12px] text-ink-500 hover:text-accent-rose py-1.5 transition-colors disabled:opacity-40"
        >
          Temizle
        </button>
        <button
          type="button"
          onClick={onDone}
          className={clsx(
            "ml-auto px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors",
            dirty ? "bg-brand-500 text-white hover:bg-brand-600" : "bg-ink-900/[0.05] text-ink-500"
          )}
        >
          {dirty ? "Uygula" : "Kapat"}
        </button>
      </div>
    </>
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
