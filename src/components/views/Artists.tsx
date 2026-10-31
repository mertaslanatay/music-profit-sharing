"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import type { ArtistAgg, Result } from "@/lib/types";
import type { PeriodRow } from "@/lib/queries";
import { buildArtistRows, sortCatalog, type CatalogSort } from "@/lib/catalog";
import { foldKey } from "@/lib/normalize";
import { money, num, compact } from "@/lib/format";
import { Avatar, Icon, Td, Th } from "../ui";
import { CatalogToolbar, NoResults, useLayout } from "./catalog-ui";

/**
 * Sanatçılar — kapsamdaki tüm sanatçılar, kart veya tablo olarak.
 * Rakamlar NET hakediş (banka kesintisi düşülmüş), Ödeme Listesi ile aynı.
 */
export function Artists({
  res,
  periods,
  precise,
  onArtist,
  onViewAs,
}: {
  res: Result;
  periods: PeriodRow[];
  precise: boolean;
  onArtist: (key: string) => void;
  /** Yalnızca yöneticide verilir — "Gözünden gör" düğmesini açar. */
  onViewAs?: (artist: ArtistAgg) => void;
}) {
  const [query, setQuery] = useState("");
  const [label, setLabel] = useState("");
  const [sort, setSort] = useState<CatalogSort>("gross");
  const [layout, setLayout] = useLayout("pulse-layout-artists");

  const sortByLabel = useMemo(() => new Map(periods.map((p) => [p.label, p.sort])), [periods]);
  const displayBySort = useMemo(() => new Map(periods.map((p) => [p.sort, p.display])), [periods]);
  const all = useMemo(() => buildArtistRows(res, sortByLabel), [res, sortByLabel]);

  const labelOptions = useMemo(
    () => res.labels.map((l) => ({ value: l.label, label: l.label })),
    [res.labels]
  );

  const rows = useMemo(() => {
    const q = foldKey(query);
    let list = all;
    if (q) {
      list = list.filter((r) =>
        foldKey(r.artist.name).includes(q) ||
        r.artist.spellings.some((s) => foldKey(s).includes(q)) ||
        r.artist.songs.some((s) => foldKey(s.album ?? "").includes(q))
      );
    }
    if (label) list = list.filter((r) => (r.artist.labels[label] ?? 0) !== 0);
    return sortCatalog(list, sort, {
      name: (r) => r.artist.name,
      gross: (r) => r.artist.net,
      first: (r) => r.firstSort,
    });
  }, [all, query, label, sort]);

  const period = (s: number | null) => (s == null ? "—" : displayBySort.get(s) ?? "—");
  const clear = () => { setQuery(""); setLabel(""); };

  return (
    <div className="space-y-4">
      <CatalogToolbar
        query={query} onQuery={setQuery}
        placeholder="Sanatçı veya albüm ara…"
        filterLabel="Label" filterValue={label} filterOptions={labelOptions} onFilter={setLabel}
        sort={sort} onSort={setSort}
        layout={layout} onLayout={setLayout}
        count={rows.length} noun="sanatçı"
      />

      {rows.length === 0 ? (
        <NoResults onClear={query || label ? clear : undefined} />
      ) : layout === "grid" ? (
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3.5">
          {rows.map((r) => (
            <article
              key={r.artist.key}
              className="group rounded-[22px] bg-card border border-line p-4 flex flex-col gap-3.5 hover:border-line-strong transition-colors"
            >
              <button
                type="button"
                onClick={() => onArtist(r.artist.key)}
                className="flex items-center gap-3 text-left min-w-0 rounded-xl -m-1 p-1 hover:bg-ink-900/[0.03] transition-colors"
              >
                <Avatar name={r.artist.name} size={48} />
                <span className="min-w-0">
                  <span className="block font-display text-[16px] font-semibold text-ink-900 truncate tracking-[-0.015em]">
                    {r.artist.name}
                  </span>
                  <span className="block text-[12px] text-ink-400 truncate mt-0.5">{r.topLabel}</span>
                </span>
              </button>

              <div className="flex items-end justify-between gap-2">
                <div>
                  <p className="eyebrow">Net hakediş</p>
                  <p className="font-display text-[22px] font-bold text-ink-900 tabular tracking-[-0.03em] leading-tight mt-1">
                    {money(r.artist.net, precise)}
                  </p>
                </div>
                <p className="text-[11.5px] text-ink-400 text-right leading-snug">
                  İlk gelir<br /><span className="text-ink-700 font-medium">{period(r.firstSort)}</span>
                </p>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-center">
                <Mini label="Şarkı" value={num(r.artist.songCount)} />
                <Mini label="Albüm" value={num(r.albumCount)} />
                <Mini label="Stream" value={compact(r.artist.quantity).replace("$", "")} />
              </dl>

              <div className="flex gap-2 mt-auto">
                <button
                  type="button"
                  onClick={() => onArtist(r.artist.key)}
                  className="flex-1 min-h-[38px] rounded-full text-[12.5px] font-semibold bg-ink-900/[0.06] text-ink-800 hover:bg-ink-900/[0.1] transition-colors"
                >
                  Döküm
                </button>
                {onViewAs && r.artist.id && (
                  <button
                    type="button"
                    onClick={() => onViewAs(r.artist)}
                    title={`${r.artist.name} panelini onun gözünden gör`}
                    className="flex-1 min-h-[38px] rounded-full text-[12.5px] font-semibold border border-line text-ink-800 hover:bg-brand-500 hover:text-white hover:border-brand-500 transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    <Icon name="eye" size={14} /> Gözünden gör
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-[22px] bg-card border border-line overflow-hidden">
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[820px]">
              <thead className="bg-ink-900/[0.02] border-b border-line">
                <tr>
                  <Th className="w-10">#</Th>
                  <Th>Sanatçı</Th>
                  <Th>Label</Th>
                  <Th align="right">Şarkı</Th>
                  <Th align="right">Albüm</Th>
                  <Th>İlk gelir</Th>
                  <Th align="right">Stream</Th>
                  <Th align="right">Net hakediş</Th>
                  {onViewAs && <Th align="right"><span className="sr-only">Eylem</span></Th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => (
                  <tr key={r.artist.key} className="hover:bg-ink-900/[0.02] transition-colors">
                    <Td className="text-ink-300 tabular text-[12px]">{i + 1}</Td>
                    <Td>
                      <button type="button" onClick={() => onArtist(r.artist.key)}
                        className="flex items-center gap-2.5 text-left hover:text-brand-700">
                        <Avatar name={r.artist.name} size={30} />
                        <span className="font-medium text-ink-900 truncate max-w-[220px]">{r.artist.name}</span>
                      </button>
                    </Td>
                    <Td className="text-ink-500 truncate max-w-[160px]">{r.topLabel}</Td>
                    <Td align="right">{num(r.artist.songCount)}</Td>
                    <Td align="right">{num(r.albumCount)}</Td>
                    <Td className="text-ink-500 whitespace-nowrap">{period(r.firstSort)}</Td>
                    <Td align="right">{num(r.artist.quantity)}</Td>
                    <Td align="right" className="font-semibold text-ink-900">{money(r.artist.net, precise)}</Td>
                    {onViewAs && (
                      <Td align="right">
                        {r.artist.id && (
                          <button type="button" onClick={() => onViewAs(r.artist)}
                            title={`${r.artist.name} panelini onun gözünden gör`}
                            className={clsx(
                              "inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-[12px] font-medium",
                              "border border-line text-ink-700 hover:bg-brand-500 hover:text-white hover:border-brand-500 transition-colors"
                            )}>
                            <Icon name="eye" size={13} /> Gözünden gör
                          </button>
                        )}
                      </Td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink-900/[0.035] py-2">
      <dt className="text-[10.5px] font-medium text-ink-400 uppercase tracking-wide">{label}</dt>
      <dd className="text-[14px] font-semibold text-ink-900 tabular mt-0.5">{value}</dd>
    </div>
  );
}
