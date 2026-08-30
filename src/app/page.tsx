"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnMap } from "@/lib/columns";
import { missingRequired } from "@/lib/columns";
import { parseFile, toRows, type ParsedFile } from "@/lib/parse";
import { compute } from "@/lib/calc";
import { exportWorkbook } from "@/lib/export";
import { loadConfig, saveConfig } from "@/lib/storage";
import { DEFAULT_CONFIG, type EngineConfig, type RawRow } from "@/lib/types";
import { money, num } from "@/lib/format";

import { Sidebar, type ViewKey } from "@/components/Sidebar";
import { Uploader } from "@/components/Uploader";
import { ColumnMapper } from "@/components/ColumnMapper";
import { SettleBar } from "@/components/SettleBar";
import { Button, Icon } from "@/components/ui";
import { Overview } from "@/components/views/Overview";
import { Payouts } from "@/components/views/Payouts";
import { Songs } from "@/components/views/Songs";
import { Labels } from "@/components/views/Labels";
import { Breakdown } from "@/components/views/Breakdown";
import { Rules } from "@/components/views/Rules";
import { ArtistPanel } from "@/components/views/ArtistPanel";

type Stage = "upload" | "map" | "ready";

const TITLES: Record<ViewKey, { title: string; sub: string }> = {
  overview: { title: "Panel", sub: "Raporun genel görünümü ve hakediş özeti" },
  payouts: { title: "Ödeme Listesi", sub: "Sanatçı bazında net hakedişler" },
  songs: { title: "Şarkılar", sub: "Şarkı ve albüm bazında gelir" },
  labels: { title: "Label", sub: "Label bazında gelir kırılımı" },
  geo: { title: "Coğrafya", sub: "Gelirin geldiği ülkeler" },
  platforms: { title: "Platformlar", sub: "Streaming servisi kırılımı" },
  rules: { title: "Kurallar", sub: "Bölüşüm ayarları, özel oranlar ve isim birleştirme" },
};

export default function Page() {
  const [stage, setStage] = useState<Stage>("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [map, setMap] = useState<ColumnMap>({});
  const [rows, setRows] = useState<RawRow[]>([]);

  const [cfg, setCfg] = useState<EngineConfig>(DEFAULT_CONFIG);
  const [view, setView] = useState<ViewKey>("overview");
  const [query, setQuery] = useState("");
  const [precise, setPrecise] = useState(false);
  const [artistKey, setArtistKey] = useState<string | null>(null);

  // Kaydedilmiş kuralları geri yükle (bölüşüm ayarları, özel oranlar, birleştirmeler)
  useEffect(() => {
    setCfg(loadConfig());
  }, []);

  const updateCfg = useCallback((next: EngineConfig) => {
    setCfg(next);
    saveConfig(next);
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const p = await parseFile(file);
      if (p.matrix.length === 0) {
        setError("Dosyada veri satırı bulunamadı. Doğru sayfa mı kontrol eder misin?");
        setBusy(false);
        return;
      }
      setParsed(p);
      setMap(p.map);
      // Zorunlu alanlar otomatik eşleştiyse eşleme ekranını atla
      if (missingRequired(p.map).length === 0) {
        setRows(toRows(p, p.map));
        setStage("ready");
        setView("overview");
      } else {
        setStage("map");
      }
    } catch (e) {
      setError(
        `Dosya okunamadı: ${e instanceof Error ? e.message : "bilinmeyen hata"}. Excel veya CSV olduğundan emin ol.`
      );
    } finally {
      setBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    setStage("upload");
    setParsed(null);
    setRows([]);
    setMap({});
    setQuery("");
    setArtistKey(null);
    setError(null);
  }, []);

  const res = useMemo(() => (rows.length > 0 ? compute(rows, cfg) : null), [rows, cfg]);
  const artist = useMemo(
    () => (res && artistKey ? res.artists.find((a) => a.key === artistKey) ?? null : null),
    [res, artistKey]
  );

  if (stage === "upload") {
    return (
      <main className="min-h-screen">
        <Uploader onFile={handleFile} busy={busy} error={error} />
      </main>
    );
  }

  if (stage === "map" && parsed) {
    return (
      <main className="min-h-screen">
        <ColumnMapper
          headers={parsed.headers}
          map={map}
          onChange={setMap}
          sample={parsed.matrix}
          fileName={parsed.fileName}
          rowCount={parsed.rowCount}
          onCancel={reset}
          onConfirm={() => {
            setRows(toRows(parsed, map));
            setStage("ready");
            setView("overview");
          }}
        />
      </main>
    );
  }

  if (!res || !parsed) return null;

  const meta = TITLES[view];
  const ruleBadge =
    Object.keys(cfg.overrides).length +
    Object.keys(cfg.aliases).length +
    (res.aliasSuggestions.length > 0 ? 1 : 0);

  return (
    <main className="flex h-screen overflow-hidden">
      <Sidebar
        view={view}
        onView={(v) => {
          setView(v);
          setQuery("");
        }}
        fileName={parsed.fileName}
        artistCount={res.totals.artistCount}
        onReset={reset}
        ruleBadge={ruleBadge || undefined}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-card border-b border-line px-6 py-3.5 flex items-center gap-4 shrink-0 no-print">
          <div className="min-w-0">
            <h1 className="text-[17px] font-semibold text-ink-900 leading-tight">{meta.title}</h1>
            <p className="text-[12px] text-ink-400 leading-tight mt-0.5">{meta.sub}</p>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            {view !== "rules" && (
              <div className="relative hidden md:block">
                <Icon
                  name="search"
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Sanatçı, şarkı, ülke ara…"
                  className="w-60 rounded-xl border border-line bg-canvas pl-9 pr-3 py-2 text-[13px] outline-none focus:border-brand-500 focus:bg-white transition-all"
                />
                {query && (
                  <button
                    onClick={() => setQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-700"
                  >
                    <Icon name="close" size={14} />
                  </button>
                )}
              </div>
            )}

            <button
              onClick={() => setPrecise(!precise)}
              title="Mikro tutarlar için 4 ondalık basamak göster"
              className={`px-3 py-2 rounded-xl text-[12.5px] font-medium transition-colors border ${
                precise
                  ? "bg-ink-900 text-white border-ink-900"
                  : "bg-white border-line text-ink-500 hover:text-ink-900"
              }`}
            >
              0,0000
            </button>

            <Button onClick={() => exportWorkbook(res, parsed.fileName)} variant="primary">
              <Icon name="download" size={15} />
              <span className="hidden sm:inline">Excel indir</span>
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto scroll-thin p-6 space-y-4">
          <SettleBar
            res={res}
            received={cfg.received}
            onReceived={(v) => updateCfg({ ...cfg, received: v })}
          />

          {res.totals.negativeRows > 0 && view === "overview" && (
            <div className="rounded-xl2 bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2.5">
              <Icon name="alert" size={16} className="text-accent-amber mt-0.5 shrink-0" />
              <p className="text-[12.5px] text-amber-900">
                Raporda <b>{num(res.totals.negativeRows)}</b> negatif satır var (iade / düzeltme).
                Toplamdan düşüldüler — gizlenmediler.
              </p>
            </div>
          )}

          <div className="rise">
            {view === "overview" && (
              <Overview res={res} precise={precise} onArtist={setArtistKey} />
            )}
            {view === "payouts" && (
              <Payouts res={res} precise={precise} query={query} onArtist={setArtistKey} />
            )}
            {view === "songs" && <Songs res={res} precise={precise} query={query} />}
            {view === "labels" && (
              <Labels res={res} precise={precise} onArtist={setArtistKey} />
            )}
            {view === "geo" && (
              <Breakdown res={res} precise={precise} query={query} mode="geo" />
            )}
            {view === "platforms" && (
              <Breakdown res={res} precise={precise} query={query} mode="platform" />
            )}
            {view === "rules" && (
              <Rules res={res} cfg={cfg} onCfg={updateCfg} precise={precise} />
            )}
          </div>

          <footer className="pt-2 pb-1 flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-ink-300">
            <span>
              {num(res.totals.rowCount)} satır · {num(res.totals.artistCount)} sanatçı ·{" "}
              {num(res.totals.songCount)} şarkı · brüt {money(res.totals.gross, true)}
            </span>
            <span>Dosya tarayıcıdan çıkmaz · hesaplama tabanı: Net Dollars after Fees</span>
          </footer>
        </div>
      </div>

      {artist && (
        <ArtistPanel
          artist={artist}
          res={res}
          precise={precise}
          onClose={() => setArtistKey(null)}
        />
      )}
    </main>
  );
}
