"use client";

import { useMemo, useState } from "react";
import type { Result } from "@/lib/types";
import { foldKey } from "@/lib/normalize";
import { money, moneySmart, num, pct, topN } from "@/lib/format";
import { Bar, Card, Empty, Td, Th } from "../ui";

type SortKey = "gross" | "quantity" | "song" | "artists";

export function Songs({
  res,
  precise,
  query,
}: {
  res: Result;
  precise: boolean;
  query: string;
}) {
  const [sort, setSort] = useState<SortKey>("gross");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [onlyShared, setOnlyShared] = useState(false);

  const rows = useMemo(() => {
    const q = foldKey(query);
    let list = res.songs;
    if (q)
      list = list.filter(
        (s) =>
          foldKey(s.song).includes(q) ||
          foldKey(s.artistString).includes(q) ||
          foldKey(s.album).includes(q)
      );
    if (onlyShared) list = list.filter((s) => s.artists.length > 1);

    return [...list].sort((a, b) => {
      let r = 0;
      if (sort === "song") r = a.song.localeCompare(b.song, "tr");
      else if (sort === "artists") r = a.artists.length - b.artists.length;
      else r = (a[sort] as number) - (b[sort] as number);
      return dir === "asc" ? r : -r;
    });
  }, [res.songs, query, sort, dir, onlyShared]);

  const shownTotal = rows.reduce((a, s) => a + s.gross, 0);
  const max = rows[0]?.gross ?? 0;

  const head = (key: SortKey, label: string, align: "left" | "right" = "right") => (
    <Th
      align={align}
      active={sort === key}
      dir={dir}
      onClick={() => {
        if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
        else {
          setSort(key);
          setDir(key === "song" ? "asc" : "desc");
        }
      }}
    >
      {label}
    </Th>
  );

  return (
    <Card pad={false} className="overflow-hidden">
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-line">
        <div>
          <h3 className="text-[15px] font-semibold text-ink-900">Şarkılar</h3>
          <p className="text-[12.5px] text-ink-500 mt-0.5">
            {num(rows.length)} kayıt · toplam <b className="text-ink-700">{money(shownTotal, precise)}</b>{" "}
            · bölüşüm öncesi şarkı geliri
          </p>
        </div>
        <button
          onClick={() => setOnlyShared(!onlyShared)}
          className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
            onlyShared ? "bg-ink-900 text-white" : "bg-ink-900/[0.04] text-ink-700 hover:bg-ink-900/[0.08]"
          }`}
        >
          Sadece ortak yapımlar
        </button>
      </div>

      {rows.length === 0 ? (
        <Empty title="Şarkı bulunamadı" sub="Aramayı değiştirmeyi dene." />
      ) : (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[860px]">
            <thead className="bg-ink-900/[0.02] border-b border-line">
              <tr>
                <Th align="left" className="w-10">
                  #
                </Th>
                {head("song", "Şarkı", "left")}
                <Th align="left">Sanatçılar</Th>
                {head("artists", "Kişi")}
                <Th align="left">Label</Th>
                {head("gross", "Gelir")}
                <Th align="left" className="w-28">
                  Pay
                </Th>
                {head("quantity", "Stream")}
                <Th align="left">Ana Ülke</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.slice(0, 400).map((s, i) => {
                const country = topN(s.territories, 1)[0];
                return (
                  <tr key={s.key} className="hover:bg-ink-900/[0.02] transition-colors">
                    <Td className="text-ink-300 tabular text-[12px]">{i + 1}</Td>
                    <Td>
                      <p className="font-medium text-ink-900 truncate max-w-[220px]">{s.song}</p>
                      {s.album && s.album !== s.song && (
                        <p className="text-[11px] text-ink-300 truncate max-w-[220px]">{s.album}</p>
                      )}
                    </Td>
                    <Td>
                      <span className="text-[12px] text-ink-500 truncate block max-w-[220px]" title={s.artistString}>
                        {s.artistString}
                      </span>
                    </Td>
                    <Td align="right">
                      {s.artists.length > 1 ? (
                        <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-accent-violet">
                          {s.artists.length}
                        </span>
                      ) : (
                        <span className="text-ink-300">1</span>
                      )}
                    </Td>
                    <Td className="text-[12px] text-ink-500">{s.label}</Td>
                    <Td align="right" className="font-semibold text-ink-900">
                      {moneySmart(s.gross, precise)}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Bar value={s.gross} max={max} color="#7C6BF5" />
                        <span className="text-[10.5px] text-ink-400 tabular w-9 text-right shrink-0">
                          {pct(res.totals.gross ? s.gross / res.totals.gross : 0)}
                        </span>
                      </div>
                    </Td>
                    <Td align="right" className="text-ink-500">
                      {num(s.quantity)}
                    </Td>
                    <Td className="text-[12px] text-ink-500 truncate max-w-[130px]">
                      {country?.name ?? "—"}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {rows.length > 400 && (
            <p className="text-center text-[12px] text-ink-400 py-3 border-t border-line">
              İlk 400 şarkı gösteriliyor · tamamı için Excel dışa aktar
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
