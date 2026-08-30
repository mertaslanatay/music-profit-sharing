"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Result } from "@/lib/types";
import type { PeriodRow, ReportRow } from "@/lib/queries";
import { exportWorkbook } from "@/lib/export";
import { money, num, pct } from "@/lib/format";

import { Sidebar, type ViewKey } from "./Sidebar";
import { AnalysisPicker, PayoutPicker } from "./PeriodPicker";
import { Button, Icon } from "./ui";
import { Overview } from "./views/Overview";
import { Payouts } from "./views/Payouts";
import { Songs } from "./views/Songs";
import { Labels } from "./views/Labels";
import { Breakdown } from "./views/Breakdown";
import { ArtistPanel } from "./views/ArtistPanel";

const TITLES: Record<ViewKey, { title: string; sub: string }> = {
  overview: { title: "Panel", sub: "Genel görünüm ve hakediş özeti" },
  payouts: { title: "Ödeme Listesi", sub: "Sanatçı bazında net hakedişler" },
  songs: { title: "Şarkılar", sub: "Şarkı ve albüm bazında gelir" },
  labels: { title: "Label", sub: "Label bazında gelir kırılımı" },
  geo: { title: "Coğrafya", sub: "Gelirin geldiği ülkeler" },
  platforms: { title: "Platformlar", sub: "Streaming servisi kırılımı" },
  rules: { title: "Kurallar", sub: "Bölüşüm ayarları" },
};

export function Dashboard({
  result,
  periods,
  reports,
  view,
  reportId,
  periodIds,
}: {
  result: Result;
  periods: PeriodRow[];
  reports: ReportRow[];
  view: ViewKey;
  /** Ödeme Listesi kapsamı: rapor id veya "all" */
  reportId: string;
  /** Diğer ekranların kapsamı: seçili dönem id'leri (boş = tüm zamanlar) */
  periodIds: string[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [precise, setPrecise] = useState(false);
  const [artistKey, setArtistKey] = useState<string | null>(null);

  const nav = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => router.push(qs ? `/?${qs}` : "/"));
  };

  const setView = (v: ViewKey) => {
    setQuery("");
    nav({ v: v === "overview" ? null : v });
  };

  const artist = useMemo(
    () => (artistKey ? result.artists.find((a) => a.key === artistKey) ?? null : null),
    [result.artists, artistKey]
  );

  const isPayouts = view === "payouts";
  const scopeLabel = isPayouts
    ? (reportId === "all"
        ? "Tüm zamanlar"
        : (() => {
            const r = reports.find((x) => x.id === reportId);
            return r ? `${r.periodRange}${r.periodDisplay ? ` (${r.periodDisplay})` : ""}` : "Ödeme partisi";
          })())
    : periodIds.length === 0
      ? "Tüm zamanlar"
      : periodIds.length === 1
        ? (periods.find((p) => p.id === periodIds[0])?.display ?? "1 dönem")
        : `${periodIds.length} dönem`;

  const meta = TITLES[view];
  const t = result.totals;

  return (
    <main className="flex h-screen overflow-hidden">
      <Sidebar
        view={view}
        onView={setView}
        onReset={() => router.push("/admin")}
        hideRules
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-card border-b border-line px-6 py-3.5 flex items-center gap-4 shrink-0 no-print">
          <div className="min-w-0">
            <h1 className="text-[17px] font-semibold text-ink-900 leading-tight">{meta.title}</h1>
            <p className="text-[12px] text-ink-400 leading-tight mt-0.5">{meta.sub}</p>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <div className="relative hidden md:block">
              <Icon name="search" size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Sanatçı, şarkı, ülke ara…"
                className="w-56 rounded-xl border border-line bg-canvas pl-9 pr-3 py-2 text-[13px] outline-none focus:border-brand-500 focus:bg-white transition-all"
              />
              {query && (
                <button onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-700">
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>

            <button
              onClick={() => setPrecise(!precise)}
              title="Mikro tutarlar için 4 ondalık"
              className={`px-3 py-2 rounded-xl text-[12.5px] font-medium transition-colors border ${
                precise ? "bg-ink-900 text-white border-ink-900"
                        : "bg-white border-line text-ink-500 hover:text-ink-900"
              }`}
            >
              0,0000
            </button>

            <Button onClick={() => exportWorkbook(result, scopeLabel)} variant="primary">
              <Icon name="download" size={15} />
              <span className="hidden sm:inline">Excel indir</span>
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto scroll-thin p-6 space-y-4">
          {/* ------------------------------------------------ dönem seçici */}
          <div className={`rounded-xl2 bg-card border border-line shadow-card p-4 flex flex-wrap items-center gap-x-6 gap-y-3 transition-opacity ${pending ? "opacity-60" : ""}`}>
            {isPayouts ? (
              <PayoutPicker
                reports={reports}
                value={reportId}
                onChange={(v) => nav({ r: v === "all" ? null : v })}
                pending={pending}
              />
            ) : (
              <AnalysisPicker
                periods={periods}
                selected={periodIds}
                onChange={(ids) => nav({ p: ids.length ? ids.join(",") : null })}
                pending={pending}
              />
            )}

            {isPayouts && (
              <p className="text-[11.5px] text-ink-400 max-w-[220px] leading-snug hidden xl:block">
                Bir ödeme partisi = bankana yatan bir transfer. Excel&apos;deki dönemleri birlikte kapsar.
              </p>
            )}

            <div className="ml-auto flex items-center gap-4">
              <Field label="Brüt" value={money(t.gross, true)} />
              <Field label="SWIFT kesintisi" value={t.deduction ? money(t.deduction) : "—"}
                tone={t.deduction ? "rose" : "muted"} />
              <Field label="Kesinti oranı" value={t.deduction ? pct(t.deductionRate, 2) : "—"}
                tone={t.deduction ? "rose" : "muted"} />
              <div className="rounded-xl bg-brand-50 px-3.5 py-2 relative">
                {pending && (
                  <span className="absolute inset-0 rounded-xl bg-brand-50 flex items-center justify-center">
                    <span className="text-[11px] text-brand-700/60">hesaplanıyor…</span>
                  </span>
                )}
                <p className="text-[10.5px] font-medium text-brand-700/70 leading-tight">DAĞITILACAK NET</p>
                <p className="text-[17px] font-semibold text-brand-700 tabular leading-tight mt-0.5">
                  {money(t.received)}
                </p>
              </div>
            </div>
          </div>

          {t.negativeRows > 0 && view === "overview" && (
            <div className="rounded-xl2 bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2.5">
              <Icon name="alert" size={16} className="text-accent-amber mt-0.5 shrink-0" />
              <p className="text-[12.5px] text-amber-900">
                Bu kapsamda <b>{num(t.negativeRows)}</b> negatif satır var (iade / düzeltme).
                Toplamdan düşüldüler — gizlenmediler.
              </p>
            </div>
          )}

          <div className="rise" key={`${view}-${reportId}-${periodIds.join(",")}`}>
            {view === "overview" && <Overview res={result} precise={precise} onArtist={setArtistKey} />}
            {view === "payouts" && <Payouts res={result} precise={precise} query={query} onArtist={setArtistKey} />}
            {view === "songs" && <Songs res={result} precise={precise} query={query} />}
            {view === "labels" && <Labels res={result} precise={precise} onArtist={setArtistKey} />}
            {view === "geo" && <Breakdown res={result} precise={precise} query={query} mode="geo" />}
            {view === "platforms" && <Breakdown res={result} precise={precise} query={query} mode="platform" />}
          </div>

          <footer className="pt-2 pb-1 flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-ink-300">
            <span>
              {scopeLabel} · {num(t.rowCount)} satır · {num(t.artistCount)} sanatçı ·{" "}
              {num(t.songCount)} şarkı · brüt {money(t.gross, true)}
            </span>
            <Link href="/admin" className="hover:text-ink-700 transition-colors">
              Yönetim →
            </Link>
          </footer>
        </div>
      </div>

      {artist && (
        <ArtistPanel artist={artist} res={result} precise={precise} onClose={() => setArtistKey(null)} />
      )}
    </main>
  );
}

function Field({ label, value, tone = "default" }: {
  label: string; value: string; tone?: "default" | "rose" | "muted";
}) {
  const color = { default: "text-ink-900", rose: "text-accent-rose", muted: "text-ink-300" }[tone];
  return (
    <div className="hidden lg:block">
      <p className="text-[11px] font-medium text-ink-400 mb-1">{label}</p>
      <p className={`text-[14px] font-semibold tabular ${color}`}>{value}</p>
    </div>
  );
}
