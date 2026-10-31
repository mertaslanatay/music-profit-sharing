"use client";

import { useMemo, useState } from "react";
import type { Result } from "@/lib/types";
import type { PeriodRow } from "@/lib/queries";
import { buildAlbums, sortCatalog, type AlbumAgg, type CatalogSort } from "@/lib/catalog";
import { foldKey } from "@/lib/normalize";
import { countryTr } from "@/lib/flags";
import { money, num, pct, topN } from "@/lib/format";
import { Drawer, Td, Th } from "../ui";
import { CatalogToolbar, Cover, NoResults, useLayout } from "./catalog-ui";

/**
 * Albümler — şarkılar albüm adına göre gruplanır (büyük/küçük harf ve Türkçe
 * karakter farkı yok sayılır). Gelir, Şarkılar ekranındaki gibi bölüşüm
 * ÖNCESİ şarkı geliridir.
 */
export function Albums({
  res,
  periods,
  precise,
  onArtist,
  openableArtistKeys,
}: {
  res: Result;
  periods: PeriodRow[];
  precise: boolean;
  onArtist: (key: string) => void;
  /**
   * Verilirse yalnızca bu sanatçıların dökümü açılabilir (sanatçı hesabı:
   * albümdeki diğer sanatçıların net hakedişine buradan ulaşılmasın).
   */
  openableArtistKeys?: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [artist, setArtist] = useState("");
  const [sort, setSort] = useState<CatalogSort>("gross");
  const [layout, setLayout] = useLayout("pulse-layout-albums");
  const [open, setOpen] = useState<AlbumAgg | null>(null);

  const displayBySort = useMemo(() => new Map(periods.map((p) => [p.sort, p.display])), [periods]);
  const all = useMemo(() => buildAlbums(res), [res]);
  const artistKeyByName = useMemo(() => new Map(res.artists.map((a) => [a.name, a.key])), [res.artists]);

  const artistOptions = useMemo(() => {
    const names = new Set<string>();
    for (const a of all) for (const n of a.artists) names.add(n);
    return [...names].sort((a, b) => a.localeCompare(b, "tr")).map((n) => ({ value: n, label: n }));
  }, [all]);

  const rows = useMemo(() => {
    const q = foldKey(query);
    let list = all;
    if (q) {
      list = list.filter((a) =>
        foldKey(a.name).includes(q) ||
        foldKey(a.artistLine).includes(q) ||
        a.artists.some((n) => foldKey(n).includes(q)) ||
        a.songs.some((s) => foldKey(s.song).includes(q))
      );
    }
    if (artist) list = list.filter((a) => a.artists.includes(artist));
    return sortCatalog(list, sort, {
      name: (a) => a.name,
      gross: (a) => a.gross,
      first: (a) => a.firstSort,
    });
  }, [all, query, artist, sort]);

  const period = (s: number | null) => (s == null ? "—" : displayBySort.get(s) ?? "—");
  const clear = () => { setQuery(""); setArtist(""); };

  return (
    <div className="space-y-4">
      <CatalogToolbar
        query={query} onQuery={setQuery}
        placeholder="Albüm, sanatçı veya şarkı ara…"
        filterLabel="Sanatçı" filterValue={artist} filterOptions={artistOptions} onFilter={setArtist}
        sort={sort} onSort={setSort}
        layout={layout} onLayout={setLayout}
        count={rows.length} noun="albüm"
      />

      {rows.length === 0 ? (
        <NoResults onClear={query || artist ? clear : undefined} />
      ) : layout === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5 gap-3.5">
          {rows.map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={() => setOpen(a)}
              className="group text-left rounded-[22px] bg-card border border-line p-3 hover:border-line-strong hover:-translate-y-0.5 transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30"
            >
              <Cover name={a.name} />
              <div className="px-1 pt-3 pb-1">
                <p className="font-display text-[15px] font-semibold text-ink-900 truncate tracking-[-0.015em]" title={a.name}>
                  {a.name}
                </p>
                <p className="text-[12px] text-ink-400 truncate mt-0.5" title={a.artistLine}>{a.artistLine}</p>
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 mt-2.5">
                  <span className="font-semibold text-[13.5px] text-ink-900 tabular">{money(a.gross, precise)}</span>
                  <span className="text-[11.5px] text-ink-400 whitespace-nowrap">
                    {a.songCount} şarkı · {period(a.firstSort)}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-[22px] bg-card border border-line overflow-hidden">
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[820px]">
              <thead className="bg-ink-900/[0.02] border-b border-line">
                <tr>
                  <Th className="w-10">#</Th>
                  <Th>Albüm</Th>
                  <Th>Sanatçı</Th>
                  <Th>Label</Th>
                  <Th align="right">Şarkı</Th>
                  <Th>İlk gelir</Th>
                  <Th align="right">Stream</Th>
                  <Th align="right">Gelir</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((a, i) => (
                  <tr key={a.key} onClick={() => setOpen(a)}
                    className="hover:bg-ink-900/[0.02] cursor-pointer transition-colors">
                    <Td className="text-ink-300 tabular text-[12px]">{i + 1}</Td>
                    <Td>
                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(a); }}
                        className="flex items-center gap-3 text-left">
                        <Cover name={a.name} size={36} />
                        <span className="font-medium text-ink-900 truncate max-w-[240px]">{a.name}</span>
                      </button>
                    </Td>
                    <Td className="text-ink-500 truncate max-w-[200px]">{a.artistLine}</Td>
                    <Td className="text-ink-500 truncate max-w-[150px]">{a.label}</Td>
                    <Td align="right">{num(a.songCount)}</Td>
                    <Td className="text-ink-500 whitespace-nowrap">{period(a.firstSort)}</Td>
                    <Td align="right">{num(a.quantity)}</Td>
                    <Td align="right" className="font-semibold text-ink-900">{money(a.gross, precise)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AlbumDrawer
        album={open}
        precise={precise}
        period={period}
        onClose={() => setOpen(null)}
        onArtist={(name) => {
          const key = artistKeyByName.get(name);
          if (!key) return;
          setOpen(null);
          onArtist(key);
        }}
        canOpenArtist={(name) => {
          const key = artistKeyByName.get(name);
          return !!key && (!openableArtistKeys || openableArtistKeys.has(key));
        }}
      />
    </div>
  );
}

function AlbumDrawer({
  album,
  precise,
  period,
  onClose,
  onArtist,
  canOpenArtist,
}: {
  album: AlbumAgg | null;
  precise: boolean;
  period: (s: number | null) => string;
  onClose: () => void;
  onArtist: (name: string) => void;
  canOpenArtist: (name: string) => boolean;
}) {
  const a = album;
  const max = a?.songs[0]?.gross ?? 0;
  return (
    <Drawer
      open={!!a}
      onClose={onClose}
      title={a?.name ?? ""}
      sub={a ? `${a.artistLine} · ${a.label}` : undefined}
      width={600}
    >
      {a && (
        <div className="space-y-5">
          <div className="flex gap-4 items-start">
            <Cover name={a.name} size={112} />
            <dl className="grid grid-cols-2 gap-x-5 gap-y-3 flex-1">
              <Fact label="Gelir" value={money(a.gross, precise)} strong />
              <Fact label="Stream" value={num(a.quantity)} />
              <Fact label="Şarkı" value={num(a.songCount)} />
              <Fact
                label="Gelir dönemi"
                value={a.firstSort === a.lastSort ? period(a.firstSort) : `${period(a.firstSort)} – ${period(a.lastSort)}`}
              />
            </dl>
          </div>

          <div>
            <p className="eyebrow mb-2">Sanatçılar</p>
            <div className="flex flex-wrap gap-1.5">
              {a.artists.map((n) =>
                canOpenArtist(n) ? (
                  <button key={n} type="button" onClick={() => onArtist(n)}
                    className="px-3 min-h-[32px] rounded-full text-[12.5px] font-medium bg-ink-900/[0.05] text-ink-800 hover:bg-brand-500 hover:text-white transition-colors">
                    {n}
                  </button>
                ) : (
                  <span key={n} className="px-3 min-h-[32px] inline-flex items-center rounded-full text-[12.5px] bg-ink-900/[0.04] text-ink-500">{n}</span>
                )
              )}
            </div>
          </div>

          <div className="rounded-[18px] border border-line overflow-hidden">
            <table className="w-full">
              <thead className="bg-ink-900/[0.02] border-b border-line">
                <tr>
                  <Th className="w-8">#</Th>
                  <Th>Şarkı</Th>
                  <Th align="right">Stream</Th>
                  <Th align="right">Gelir</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {a.songs.map((s, i) => {
                  const country = topN(s.territories, 1)[0];
                  return (
                    <tr key={s.key}>
                      <Td className="text-ink-300 tabular text-[12px]">{i + 1}</Td>
                      <Td>
                        <p className="font-medium text-ink-900 truncate max-w-[260px]">{s.song}</p>
                        <p className="text-[11.5px] text-ink-400 truncate max-w-[260px]">
                          {s.artistString}{country ? ` · ${countryTr(country.name)}` : ""}
                        </p>
                        <div className="mt-1.5 h-1 rounded-full bg-ink-900/[0.06] overflow-hidden max-w-[260px]">
                          <div className="h-full rounded-full bg-brand-500"
                            style={{ width: `${max > 0 ? Math.max(2, (s.gross / max) * 100) : 0}%` }} />
                        </div>
                      </Td>
                      <Td align="right">{num(s.quantity)}</Td>
                      <Td align="right" className="whitespace-nowrap">
                        <span className="font-semibold text-ink-900">{money(s.gross, precise)}</span>
                        <span className="block text-[11px] text-ink-400">{pct(a.gross ? s.gross / a.gross : 0)}</span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11.5px] text-ink-400 leading-relaxed">
            Gelir bölüşüm öncesi şarkı geliridir; sanatçı payları için sanatçı adına tıkla.
            Dönem bilgisi ilk ve son gelir dönemidir — veride yayın tarihi yok.
          </p>
        </div>
      )}
    </Drawer>
  );
}

function Fact({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-ink-400">{label}</dt>
      <dd className={strong
        ? "font-display text-[20px] font-bold text-ink-900 tabular tracking-[-0.03em] leading-tight mt-0.5"
        : "text-[14px] font-semibold text-ink-900 tabular mt-0.5"}>{value}</dd>
    </div>
  );
}
