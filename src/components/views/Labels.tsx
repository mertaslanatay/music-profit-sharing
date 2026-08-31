"use client";

import type { Result } from "@/lib/types";
import { money, moneySmart, num, pct } from "@/lib/format";
import { Avatar, Card, CardHead, Icon, RankRow, Stat } from "../ui";
import { CHART_COLORS, Donut, HBar } from "../charts";

export function Labels({
  res,
  precise,
  onArtist,
}: {
  res: Result;
  precise: boolean;
  onArtist: (key: string, label?: string) => void;
}) {
  const t = res.totals;
  const data = res.labels.map((l) => ({
    name: l.label,
    value: l.gross,
    share: t.gross ? l.gross / t.gross : 0,
  }));

  const nameToKey = new Map(res.artists.map((a) => [a.name, a.key] as const));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {res.labels.slice(0, 4).map((l, i) => (
          <Stat
            key={l.label}
            label={l.label}
            value={moneySmart(l.gross, l.gross < 1)}
            badge={pct(t.gross ? l.gross / t.gross : 0)}
            tone={i === 0 ? "up" : "neutral"}
            sub={`Net ${money(l.net)} · ${num(l.artistCount)} sanatçı · ${num(l.songCount)} şarkı`}
            icon={
              <span
                className="w-2.5 h-2.5 rounded-full mt-1.5"
                style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
              />
            }
          />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card>
          <CardHead title="Label payları" sub="Toplam gelirin kırılımı" />
          <Donut
            data={data}
            height={216}
            centerValue={money(t.gross)}
            centerLabel="toplam brüt"
            precise={precise}
          />
        </Card>

        <Card className="xl:col-span-2">
          <CardHead title="Label karşılaştırması" sub="Brüt gelir" />
          <HBar data={data} height={216} color="#F2A93B" precise={precise} />
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {res.labels.map((l, i) => {
          const max = l.topArtists[0]?.gross ?? 0;
          return (
            <Card key={l.label}>
              <CardHead
                title={l.label}
                sub={`${num(l.artistCount)} sanatçı · ${num(l.songCount)} şarkı · ${num(l.quantity)} stream`}
                right={
                  <div className="text-right shrink-0">
                    <p className="text-[16px] font-semibold text-ink-900 tabular leading-tight">
                      {moneySmart(l.gross, l.gross < 1)}
                    </p>
                    <p className="text-[11px] text-ink-400 leading-tight mt-0.5">
                      net {money(l.net)}
                    </p>
                  </div>
                }
              />
              <div className="h-1.5 rounded-full bg-ink-900/[0.06] overflow-hidden mb-4">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max((t.gross ? l.gross / t.gross : 0) * 100, 1)}%`,
                    background: CHART_COLORS[i % CHART_COLORS.length],
                  }}
                />
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-2">
                En çok kazananlar
              </p>
              <div className="space-y-0.5">
                {l.topArtists.slice(0, 8).map((a) => (
                  <RankRow
                    key={a.name}
                    name={a.name}
                    value={a.gross}
                    max={max}
                    total={l.gross}
                    color={CHART_COLORS[i % CHART_COLORS.length]}
                    precise={precise}
                    prefix={<Avatar name={a.name} size={24} />}
                    onClick={() => {
                      const k = nameToKey.get(a.name);
                      if (k) onArtist(k, l.label);
                    }}
                  />
                ))}
              </div>
              {l.topArtists.length > 8 && (
                <p className="text-[11.5px] text-ink-400 mt-2 text-center">
                  +{l.topArtists.length - 8} sanatçı daha
                </p>
              )}
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHead title="Label karşılaştırma tablosu" />
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full min-w-[620px]">
            <thead>
              <tr className="border-b border-line">
                {["Label", "Brüt", "Net", "Pay", "Sanatçı", "Şarkı", "Stream", "Şarkı Başı"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-400 ${
                        i === 0 ? "text-left" : "text-right"
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {res.labels.map((l, i) => (
                <tr key={l.label} className="hover:bg-ink-900/[0.02]">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                      <span className="text-[13px] font-medium text-ink-900">{l.label}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right text-[13px] tabular text-ink-700">
                    {moneySmart(l.gross, precise)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[13px] tabular font-semibold text-brand-600">
                    {money(l.net)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[13px] tabular text-ink-500">
                    {pct(t.gross ? l.gross / t.gross : 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[13px] tabular text-ink-700">
                    {num(l.artistCount)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[13px] tabular text-ink-700">
                    {num(l.songCount)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[13px] tabular text-ink-500">
                    {num(l.quantity)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[13px] tabular text-ink-500">
                    {moneySmart(l.songCount ? l.gross / l.songCount : 0, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 pt-4 border-t border-line flex items-start gap-2.5">
          <Icon name="alert" size={15} className="text-ink-400 mt-0.5 shrink-0" />
          <p className="text-[12px] text-ink-500 leading-relaxed">
            Label toplamları satır bazında hesaplanır — bölüşümden bağımsızdır. Bir label&apos;ın
            sanatçı listesindeki tutarlar ise bölüşüm sonrası paylardır, bu yüzden bir sanatçı
            birden fazla label&apos;da görünebilir.
          </p>
        </div>
      </Card>
    </div>
  );
}
