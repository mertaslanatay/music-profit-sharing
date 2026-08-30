"use client";

import { useMemo, useState } from "react";
import type { Result } from "@/lib/types";
import { foldKey } from "@/lib/normalize";
import { money, moneySmart, num, pct } from "@/lib/format";
import { flagOf } from "@/lib/flags";
import { Bar, Card, CardHead, Empty, Stat } from "../ui";
import { CHART_COLORS, Donut, HBar } from "../charts";

/**
 * Ülke ve platform ekranları aynı yapıyı paylaşır: genel kırılım + sanatçı seçimiyle
 * "bu sanatçı en çok nereden kazanıyor" görünümü.
 */
export function Breakdown({
  res,
  precise,
  query,
  mode,
}: {
  res: Result;
  precise: boolean;
  query: string;
  mode: "geo" | "platform";
}) {
  const [artistKey, setArtistKey] = useState<string>("");

  const isGeo = mode === "geo";
  const artist = res.artists.find((a) => a.key === artistKey) ?? null;
  const source = artist
    ? isGeo
      ? artist.territories
      : artist.retailers
    : isGeo
      ? res.territories
      : res.retailers;

  const total = artist ? artist.gross : res.totals.gross;

  const all = useMemo(() => {
    const q = foldKey(query);
    return Object.entries(source)
      .map(([name, value]) => ({ name, value, share: total ? value / total : 0 }))
      .filter((d) => (q ? foldKey(d.name).includes(q) : true))
      .sort((a, b) => b.value - a.value);
  }, [source, total, query]);

  const top = all.slice(0, 12);
  const rest = all.slice(12);
  const restSum = rest.reduce((a, d) => a + d.value, 0);
  const donutData = restSum > 0 ? [...all.slice(0, 7), { name: "Diğer", value: restSum, share: total ? restSum / total : 0 }] : all.slice(0, 8);

  const title = isGeo ? "Coğrafya" : "Platformlar";
  const unitLabel = isGeo ? "ülke" : "platform";
  const color = isGeo ? "#3FA9E8" : "#16A75C";

  const concentration = all.length > 0 ? all[0].value / (total || 1) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat
          label={`Toplam ${unitLabel}`}
          value={num(all.length)}
          sub={artist ? `${artist.name} için` : "tüm katalog"}
          tone="neutral"
        />
        <Stat
          label={`En büyük ${unitLabel}`}
          value={all[0]?.name ?? "—"}
          badge={all[0] ? pct(concentration) : undefined}
          tone="up"
          sub={all[0] ? money(all[0].value, precise) : undefined}
        />
        <Stat
          label="İlk 3'ün payı"
          value={pct(total ? all.slice(0, 3).reduce((a, d) => a + d.value, 0) / total : 0)}
          sub={all.slice(0, 3).map((d) => d.name).join(" · ")}
          tone="violet"
        />
        <Stat
          label="Gösterilen gelir"
          value={money(all.reduce((a, d) => a + d.value, 0), precise)}
          sub={artist ? `${artist.name} hakedişi` : "tüm sanatçılar"}
          tone="brand"
        />
      </div>

      <Card>
        <CardHead
          title={`${title} — sanatçı filtresi`}
          sub="Bir sanatçı seç, o sanatçının kırılımını gör"
          right={
            <select
              value={artistKey}
              onChange={(e) => setArtistKey(e.target.value)}
              className="rounded-xl border border-line px-3 py-1.5 text-[12.5px] bg-white outline-none focus:border-brand-500 transition-colors max-w-[220px]"
            >
              <option value="">Tüm sanatçılar</option>
              {res.artists.slice(0, 120).map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name}
                </option>
              ))}
            </select>
          }
        />
        {all.length === 0 ? (
          <Empty title="Kayıt yok" sub="Arama filtresini temizlemeyi dene." />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <HBar
                data={top.map((d) => ({
                  ...d,
                  name: d.name.length > 20 ? d.name.slice(0, 19) + "…" : d.name,
                }))}
                height={Math.max(240, top.length * 30)}
                color={color}
                precise={precise}
              />
            </div>
            <div className="lg:col-span-2">
              <Donut
                data={donutData}
                height={228}
                centerValue={money(total, total < 1)}
                centerLabel={artist ? artist.name : "toplam"}
                precise={precise}
              />
              <div className="mt-3 space-y-1.5">
                {donutData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="text-[11.5px] text-ink-600 flex-1 truncate">{d.name}</span>
                    <span className="text-[11.5px] text-ink-400 tabular">
                      {pct(d.share ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card pad={false}>
        <div className="px-5 py-4 border-b border-line">
          <h3 className="text-[15px] font-semibold text-ink-900">Tam liste</h3>
          <p className="text-[12.5px] text-ink-500 mt-0.5">
            {num(all.length)} {unitLabel} · {artist ? artist.name : "tüm sanatçılar"}
          </p>
        </div>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[520px]">
            <thead className="bg-ink-900/[0.02] border-b border-line">
              <tr>
                <th className="px-3 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-400 w-10">
                  #
                </th>
                <th className="px-3 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
                  {isGeo ? "Ülke" : "Platform"}
                </th>
                <th className="px-3 py-2.5 text-right text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
                  Gelir
                </th>
                <th className="px-3 py-2.5 text-left text-[11.5px] font-semibold uppercase tracking-wide text-ink-400 w-40">
                  Pay
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {all.slice(0, 300).map((d, i) => (
                <tr key={d.name} className="hover:bg-ink-900/[0.02]">
                  <td className="px-3 py-2 text-[12px] text-ink-300 tabular">{i + 1}</td>
                  <td className="px-3 py-2 text-[13px] text-ink-900">
                    <span className="flex items-center gap-2">
                      {isGeo && <span className="text-[14px] leading-none">{flagOf(d.name)}</span>}
                      {d.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-[13px] tabular font-medium text-ink-900">
                    {moneySmart(d.value, precise)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Bar value={d.value} max={all[0]?.value ?? 0} color={color} />
                      <span className="text-[10.5px] text-ink-400 tabular w-10 text-right shrink-0">
                        {pct(d.share ?? 0)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
