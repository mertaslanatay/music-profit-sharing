"use client";

import { useMemo, useState } from "react";
import type { ArtistAgg, Result } from "@/lib/types";
import { foldKey } from "@/lib/normalize";
import { money, moneySmart, num, pct, topN } from "@/lib/format";
import { Avatar, Bar, Card, Empty, Icon, Td, Th } from "../ui";

type SortKey = "net" | "gross" | "name" | "songCount" | "quantity" | "featureGross";

export function Payouts({
  res,
  precise,
  query,
  onArtist,
}: {
  res: Result;
  precise: boolean;
  query: string;
  onArtist: (key: string) => void;
}) {
  const [sort, setSort] = useState<SortKey>("net");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [labelFilter, setLabelFilter] = useState<string>("");

  const rows = useMemo(() => {
    const q = foldKey(query);
    let list = res.artists;
    if (q) list = list.filter((a) => foldKey(a.name).includes(q) || a.spellings.some((s) => foldKey(s).includes(q)));
    if (labelFilter) list = list.filter((a) => (a.labels[labelFilter] ?? 0) > 0);

    const sorted = [...list].sort((a, b) => {
      let r = 0;
      if (sort === "name") r = a.name.localeCompare(b.name, "tr");
      else r = (a[sort] as number) - (b[sort] as number);
      return dir === "asc" ? r : -r;
    });
    return sorted;
  }, [res.artists, query, sort, dir, labelFilter]);

  const shown = rows.reduce(
    (acc, a) => ({ gross: acc.gross + a.gross, net: acc.net + a.net, ded: acc.ded + a.deduction }),
    { gross: 0, net: 0, ded: 0 }
  );

  const maxNet = rows[0]?.net ?? 0;

  const head = (key: SortKey, label: string, align: "left" | "right" = "right") => (
    <Th
      align={align}
      active={sort === key}
      dir={dir}
      onClick={() => {
        if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
        else {
          setSort(key);
          setDir(key === "name" ? "asc" : "desc");
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
          <h3 className="text-[15px] font-semibold text-ink-900">Ödeme Listesi</h3>
          <p className="text-[12.5px] text-ink-500 mt-0.5">
            {rows.length === res.artists.length
              ? `${num(res.artists.length)} sanatçı`
              : `${num(rows.length)} / ${num(res.artists.length)} sanatçı`}
            {" · "}
            gösterilen toplam <b className="text-ink-700">{money(shown.net)}</b>
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setLabelFilter("")}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
              !labelFilter ? "bg-ink-900 text-white" : "bg-ink-900/[0.04] text-ink-700 hover:bg-ink-900/[0.08]"
            }`}
          >
            Tümü
          </button>
          {res.labels.map((l) => (
            <button
              key={l.label}
              onClick={() => setLabelFilter(labelFilter === l.label ? "" : l.label)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                labelFilter === l.label
                  ? "bg-ink-900 text-white"
                  : "bg-ink-900/[0.04] text-ink-700 hover:bg-ink-900/[0.08]"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty title="Sonuç yok" sub="Arama veya label filtresini değiştirmeyi dene." />
      ) : (
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[880px]">
            <thead className="bg-ink-900/[0.02] border-b border-line">
              <tr>
                <Th align="left" className="w-10">
                  #
                </Th>
                {head("name", "Sanatçı", "left")}
                {head("gross", "Brüt")}
                <Th align="right">Kesinti</Th>
                {head("net", "Net Ödeme")}
                <Th align="left" className="w-32">
                  Pay
                </Th>
                {head("featureGross", "Feat.")}
                {head("songCount", "Şarkı")}
                {head("quantity", "Stream")}
                <Th align="left">Ana Ülke / Platform</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((a, i) => (
                <Row
                  key={a.key}
                  a={a}
                  i={i}
                  maxNet={maxNet}
                  total={res.totals.received}
                  precise={precise}
                  onClick={() => onArtist(a.key)}
                />
              ))}
            </tbody>
            <tfoot className="bg-ink-900/[0.02] border-t-2 border-line">
              <tr>
                <Td />
                <Td className="font-semibold text-ink-900">TOPLAM</Td>
                <Td align="right" className="font-semibold text-ink-900">
                  {money(shown.gross, precise)}
                </Td>
                <Td align="right" className="font-semibold text-accent-rose">
                  {money(shown.ded)}
                </Td>
                <Td align="right" className="font-semibold text-brand-600">
                  {money(shown.net)}
                </Td>
                <Td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}

function Row({
  a,
  i,
  maxNet,
  total,
  precise,
  onClick,
}: {
  a: ArtistAgg;
  i: number;
  maxNet: number;
  total: number;
  precise: boolean;
  onClick: () => void;
}) {
  const country = topN(a.territories, 1)[0];
  const platform = topN(a.retailers, 1)[0];
  const featShare = a.gross > 0 ? a.featureGross / a.gross : 0;

  return (
    <tr onClick={onClick} className="hover:bg-brand-50/40 cursor-pointer transition-colors group">
      <Td className="text-ink-300 tabular text-[12px]">{i + 1}</Td>
      <Td>
        <div className="flex items-center gap-2.5">
          <Avatar name={a.name} size={30} />
          <div className="min-w-0">
            <p className="font-medium text-ink-900 truncate max-w-[190px]">{a.name}</p>
            {a.spellings.length > 1 && (
              <p className="text-[10.5px] text-ink-300 truncate max-w-[190px]">
                {a.spellings.length} yazım birleştirildi
              </p>
            )}
          </div>
          <Icon
            name="back"
            size={14}
            className="text-ink-300 rotate-180 opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0"
          />
        </div>
      </Td>
      <Td align="right">{moneySmart(a.gross, precise)}</Td>
      <Td align="right" className="text-accent-rose">
        {a.deduction !== 0 ? moneySmart(a.deduction, precise) : "—"}
      </Td>
      <Td align="right" className="font-semibold text-ink-900">
        {money(a.net)}
      </Td>
      <Td>
        <div className="flex items-center gap-2">
          <Bar value={a.net} max={maxNet} />
          <span className="text-[10.5px] text-ink-400 tabular w-10 text-right shrink-0">
            {pct(total > 0 ? a.gross / total : 0)}
          </span>
        </div>
      </Td>
      <Td align="right" className={featShare > 0.5 ? "text-accent-violet font-medium" : "text-ink-400"}>
        {a.featureGross > 0 ? moneySmart(a.featureGross, precise) : "—"}
      </Td>
      <Td align="right">{num(a.songCount)}</Td>
      <Td align="right" className="text-ink-500">
        {num(a.quantity)}
      </Td>
      <Td className="text-[12px] text-ink-500">
        <span className="truncate block max-w-[170px]">
          {country?.name ?? "—"} · {platform?.name ?? "—"}
        </span>
      </Td>
    </tr>
  );
}
