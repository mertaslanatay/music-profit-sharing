"use client";

import type { SongGeo } from "@/lib/queries";
import { countryTr, flagOf } from "@/lib/flags";
import { isDomestic } from "@/lib/regions";
import { num, pct } from "@/lib/format";
import { Card, CardHead, Empty, Icon } from "../ui";
import { CHART_COLORS } from "../charts";

/**
 * En çok dinlenen 10 şarkı — hangi ülkelerde dinlendiler (Coğrafya).
 *
 * Dinlenmenin büyük kısmı genellikle Türkiye'den geldiği için (canlıda
 * çoğu şarkıda %90+) çubukta diğer ülkeler kaybolur; bu yüzden her satırda
 * ayrıca "Yurt dışı" payı ve yurt dışındaki ilk ülkeler gösteriliyor.
 */
export function SongGeoCard({ songs, own }: { songs: SongGeo[]; own: boolean }) {
  return (
    <Card>
      <CardHead
        title={own ? "En çok dinlenen 10 şarkın" : "En çok dinlenen 10 şarkı"}
        sub="Hangi ülkelerde dinlendiler · seçili dönem, toplam dinlenme"
      />
      {songs.length === 0 ? (
        <Empty title="Bu kapsamda dinlenme yok" sub="Dönem seçimini değiştirmeyi dene." icon={<Icon name="globe" />} />
      ) : (
        <ol className="divide-y divide-line">
          {songs.map((s, i) => <Row key={s.songId} s={s} rank={i + 1} />)}
        </ol>
      )}
    </Card>
  );
}

function Row({ s, rank }: { s: SongGeo; rank: number }) {
  const total = s.total || 1;
  const top = s.territories.slice(0, 5);
  const restV = s.territories.slice(5).reduce((a, t) => a + t.v, 0);
  const abroad = s.territories.filter((t) => !isDomestic(t.k));
  const abroadV = abroad.reduce((a, t) => a + t.v, 0);
  const sub = [s.artistString, s.album && s.album !== s.title ? s.album : null].filter(Boolean).join(" · ");

  return (
    <li className="py-3.5 first:pt-1 last:pb-1">
      <div className="flex items-start gap-3">
        <span className="w-6 shrink-0 text-[12px] text-ink-300 tabular pt-0.5">{rank}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ink-900 truncate">{s.title}</p>
              {sub && <p className="text-[12px] text-ink-400 truncate">{sub}</p>}
            </div>
            <p className="shrink-0 text-right">
              <span className="text-[14px] font-semibold text-ink-900 tabular">{num(Math.round(s.total))}</span>
              <span className="block text-[11px] text-ink-400">dinlenme · {num(s.territories.length)} ülke</span>
            </p>
          </div>

          {/* Ülke dağılımı — ilk 5 ülke renkli, kalanı gri */}
          <div className="mt-2.5 h-2.5 rounded-full overflow-hidden flex bg-ink-900/[0.06]"
            role="img"
            aria-label={top.map((t) => `${countryTr(t.k)} ${pct(t.v / total)}`).join(", ")}>
            {top.map((t, j) => (
              <span key={t.k} style={{ width: `${(t.v / total) * 100}%`, background: CHART_COLORS[j % CHART_COLORS.length] }}
                title={`${countryTr(t.k)} · ${pct(t.v / total)} · ${num(Math.round(t.v))}`} />
            ))}
            {restV > 0 && <span style={{ width: `${(restV / total) * 100}%` }} className="bg-ink-900/15" title={`Diğer · ${pct(restV / total)}`} />}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            {top.slice(0, 3).map((t, j) => (
              <span key={t.k} className="inline-flex items-center gap-1.5 text-ink-600">
                <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[j % CHART_COLORS.length] }} aria-hidden />
                <span aria-hidden>{flagOf(t.k)}</span>
                {countryTr(t.k)} <span className="text-ink-400 tabular">{pct(t.v / total)}</span>
              </span>
            ))}
            {abroadV > 0 && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-ink-500"
                title={abroad.slice(0, 8).map((t) => `${countryTr(t.k)} ${pct(t.v / total)}`).join(" · ")}>
                <Icon name="globe" size={13} />
                Yurt dışı <b className="text-ink-800 tabular">{pct(abroadV / total)}</b>
                {abroad[0] && <span className="text-ink-400">· en çok {countryTr(abroad[0].k)}</span>}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
