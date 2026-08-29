"use client";

import { useEffect, useState } from "react";
import type { ArtistAgg, Result } from "@/lib/types";
import { money, moneySmart, num, pct, topN } from "@/lib/format";
import { flagOf } from "@/lib/flags";
import { artistSummaryText } from "@/lib/export";
import { Avatar, Bar, Button, Icon, RankRow } from "../ui";

/** Sanatçı hakediş dökümü — sağdan açılan panel. */
export function ArtistPanel({
  artist,
  res,
  precise,
  onClose,
}: {
  artist: ArtistAgg;
  res: Result;
  precise: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const t = res.totals;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    const text = artistSummaryText(
      artist.name,
      artist.gross,
      artist.deduction,
      artist.net,
      t.netRate,
      artist.songs
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const countries = topN(artist.territories, 6);
  const platforms = topN(artist.retailers, 6);
  const labels = topN(artist.labels, 5);
  const collabs = topN(artist.collaborators, 6);

  return (
    <>
      <div
        className="fixed inset-0 bg-ink-900/25 z-40 fade-in no-print"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-[560px] bg-canvas z-50 slide-in overflow-y-auto scroll-thin shadow-pop">
        <div className="sticky top-0 bg-card border-b border-line px-5 py-4 flex items-start gap-3 z-10">
          <Avatar name={artist.name} size={44} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold text-ink-900 truncate">{artist.name}</h2>
            <p className="text-[12px] text-ink-400 mt-0.5">
              {num(artist.songCount)} şarkı · {num(artist.quantity)} stream ·{" "}
              {pct(t.gross ? artist.gross / t.gross : 0)} pay
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-ink-900/[0.06] flex items-center justify-center text-ink-500 transition-colors shrink-0"
            aria-label="Kapat"
          >
            <Icon name="close" size={17} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-xl2 bg-card border border-line p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-3">
              Hakediş Dökümü
            </p>
            <div className="space-y-2.5">
              <Line label="Brüt hakediş" value={money(artist.gross, true)} />
              {t.deduction !== 0 && (
                <Line
                  label={`Banka kesintisi (${pct(t.deductionRate, 2)})`}
                  value={`−${money(artist.deduction)}`}
                  tone="rose"
                />
              )}
              <div className="pt-2.5 border-t border-line flex items-baseline justify-between">
                <span className="text-[13.5px] font-semibold text-ink-900">NET ÖDEME</span>
                <span className="text-[22px] font-semibold text-brand-600 tabular">
                  {money(artist.net)}
                </span>
              </div>
            </div>

            {artist.spellings.length > 1 && (
              <div className="mt-4 pt-3.5 border-t border-line flex items-start gap-2">
                <Icon name="merge" size={14} className="text-ink-400 mt-0.5 shrink-0" />
                <p className="text-[11.5px] text-ink-500 leading-relaxed">
                  Birleştirilen yazımlar:{" "}
                  <span className="text-ink-700">{artist.spellings.join(" · ")}</span>
                </p>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button onClick={copy} variant={copied ? "primary" : "ghost"} className="flex-1">
                <Icon name={copied ? "check" : "copy"} size={15} />
                {copied ? "Kopyalandı" : "Dökümü kopyala"}
              </Button>
              <Button onClick={() => window.print()} title="Yazdır / PDF">
                <Icon name="print" size={15} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Mini label="Tek sahipli" value={moneySmart(artist.soloGross, precise)} color="#16A75C" />
            <Mini label="Ana sanatçı" value={moneySmart(artist.primaryGross, precise)} color="#7C6BF5" />
            <Mini label="Featuring" value={moneySmart(artist.featureGross, precise)} color="#F2A93B" />
          </div>

          <Section title="Şarkı bazında hakediş" sub="Bölüşüm payı dahil">
            <div className="space-y-1.5">
              {artist.songs.slice(0, 25).map((s) => (
                <div key={s.songKey} className="rounded-xl bg-ink-900/[0.02] px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium text-ink-900 truncate">{s.song}</span>
                    <span className="text-[13px] font-semibold text-ink-900 tabular shrink-0">
                      {moneySmart(s.gross, precise)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Bar value={s.gross} max={artist.songs[0]?.gross ?? 0} />
                    {s.totalArtists > 1 ? (
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                          s.position === 0
                            ? "bg-brand-50 text-brand-700"
                            : "bg-violet-50 text-accent-violet"
                        }`}
                        title={s.artistString}
                      >
                        {s.position === 0 ? "ana" : `${s.position + 1}.`} / {s.totalArtists} ·{" "}
                        {pct(s.share, 0)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-ink-300 px-1.5 shrink-0">tek</span>
                    )}
                  </div>
                  {s.totalArtists > 1 && (
                    <p className="text-[10.5px] text-ink-300 mt-1 truncate">{s.artistString}</p>
                  )}
                </div>
              ))}
              {artist.songs.length > 25 && (
                <p className="text-[11.5px] text-ink-400 pt-1.5 text-center">
                  +{artist.songs.length - 25} şarkı daha
                </p>
              )}
            </div>
          </Section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Section title="En çok dinlendiği ülkeler">
              <div className="space-y-0.5">
                {countries.map((c) => (
                  <RankRow
                    key={c.name}
                    name={c.name}
                    value={c.value}
                    max={countries[0]?.value ?? 0}
                    total={artist.gross}
                    color="#3FA9E8"
                    precise={precise}
                    prefix={<span className="text-[14px] leading-none shrink-0">{flagOf(c.name)}</span>}
                  />
                ))}
              </div>
            </Section>

            <Section title="En çok kazandığı platformlar">
              <div className="space-y-0.5">
                {platforms.map((p) => (
                  <RankRow
                    key={p.name}
                    name={p.name}
                    value={p.value}
                    max={platforms[0]?.value ?? 0}
                    total={artist.gross}
                    color="#16A75C"
                    precise={precise}
                  />
                ))}
              </div>
            </Section>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Section title="Label">
              <div className="space-y-0.5">
                {labels.map((l) => (
                  <RankRow
                    key={l.name}
                    name={l.name}
                    value={l.value}
                    max={labels[0]?.value ?? 0}
                    total={artist.gross}
                    color="#F2A93B"
                    precise={precise}
                  />
                ))}
              </div>
            </Section>

            {collabs.length > 0 && (
              <Section title="Birlikte çalıştıkları" sub="Ortak şarkı geliri">
                <div className="space-y-0.5">
                  {collabs.map((c) => (
                    <RankRow
                      key={c.name}
                      name={c.name}
                      value={c.value}
                      max={collabs[0]?.value ?? 0}
                      total={artist.gross}
                      color="#7C6BF5"
                      precise={precise}
                      prefix={<Avatar name={c.name} size={22} />}
                    />
                  ))}
                </div>
              </Section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: "rose" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] text-ink-500">{label}</span>
      <span
        className={`text-[14px] font-medium tabular ${
          tone === "rose" ? "text-accent-rose" : "text-ink-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Mini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl2 bg-card border border-line p-3.5">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-[10.5px] font-medium text-ink-400">{label}</span>
      </div>
      <p className="text-[14px] font-semibold text-ink-900 tabular">{value}</p>
    </div>
  );
}

function Section({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl2 bg-card border border-line p-5">
      <div className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">{title}</p>
        {sub && <p className="text-[11.5px] text-ink-300 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
