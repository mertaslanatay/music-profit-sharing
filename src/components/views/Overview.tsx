"use client";

import type { Result } from "@/lib/types";
import { money, moneySmart, num, pct, periodSort, topN } from "@/lib/format";
import { flagOf } from "@/lib/flags";
import { Avatar, Card, CardHead, Icon, RankRow, Stat } from "../ui";
import { CHART_COLORS, Donut, HBar, VBar } from "../charts";

export function Overview({
  res,
  precise,
  onArtist,
}: {
  res: Result;
  precise: boolean;
  onArtist: (key: string) => void;
}) {
  const t = res.totals;
  const topArtists = res.artists.slice(0, 10);
  const maxArtist = topArtists[0]?.gross ?? 0;

  const labelData = res.labels.map((l) => ({
    name: l.label,
    value: l.gross,
    share: t.gross ? l.gross / t.gross : 0,
  }));

  const platformData = topN(res.retailers, 8).map((d) => ({
    ...d,
    share: t.gross ? d.value / t.gross : 0,
  }));

  const countryData = topN(res.territories, 8).map((d) => ({
    ...d,
    share: t.gross ? d.value / t.gross : 0,
  }));

  const periodData = Object.entries(res.periods)
    .sort((a, b) => periodSort(a[0]) - periodSort(b[0]))
    .map(([name, value]) => ({ name, value }));

  const collabGross = res.artists.reduce((a, x) => a + x.primaryGross + x.featureGross, 0);
  const topSongs = res.songs.slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat
          label="Dağıtılacak Net"
          value={money(t.received)}
          badge={t.deduction !== 0 ? `−${pct(t.deductionRate, 2)}` : "kesintisiz"}
          tone={t.deduction !== 0 ? "down" : "up"}
          sub={`Brüt ${money(t.gross, true)} · kesinti ${money(t.deduction)}`}
          icon={<Icon name="bank" size={16} className="text-ink-300" />}
        />
        <Stat
          label="Sanatçı"
          value={num(t.artistCount)}
          badge={`${res.combos.length} ortak yapım`}
          tone="brand"
          sub={`${num(t.songCount)} şarkı · ${num(t.labelCount)} label`}
          icon={<Icon name="users" size={16} className="text-ink-300" />}
        />
        <Stat
          label="Toplam Stream"
          value={num(t.quantity)}
          badge={`${num(t.retailerCount)} platform`}
          tone="violet"
          sub={`${num(t.rowCount)} satır işlendi`}
          icon={<Icon name="play" size={14} className="text-ink-300" />}
        />
        <Stat
          label="En Çok Kazanan"
          value={res.artists[0]?.name ?? "—"}
          badge={res.artists[0] ? money(res.artists[0].net) : undefined}
          tone="up"
          sub={
            res.artists[0]
              ? `Toplamın ${pct(t.gross ? res.artists[0].gross / t.gross : 0)}'i`
              : undefined
          }
          icon={<Icon name="chart" size={16} className="text-ink-300" />}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHead
            title="Sanatçı hakedişleri"
            sub={`İlk 10 · bölüşüm sonrası brüt · toplam ${money(t.gross, true)}`}
            right={
              <span className="text-[11.5px] text-ink-400 bg-ink-900/[0.04] px-2.5 py-1 rounded-full">
                {num(t.artistCount)} sanatçı
              </span>
            }
          />
          <HBar
            data={topArtists.map((a) => ({
              name: a.name.length > 18 ? a.name.slice(0, 17) + "…" : a.name,
              value: a.gross,
              share: t.gross ? a.gross / t.gross : 0,
            }))}
            height={324}
            precise={precise}
          />
        </Card>

        <Card>
          <CardHead title="Label dağılımı" sub="Gelirin label bazında kırılımı" />
          <Donut
            data={labelData}
            height={196}
            centerValue={money(t.gross, false)}
            centerLabel="toplam brüt"
            precise={precise}
          />
          <div className="mt-4 space-y-2.5">
            {res.labels.map((l, i) => (
              <div key={l.label} className="flex items-center gap-2.5">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="text-[12.5px] text-ink-700 flex-1 truncate">{l.label}</span>
                <span className="text-[12.5px] font-semibold text-ink-900 tabular">
                  {moneySmart(l.gross, precise)}
                </span>
                <span className="text-[11px] text-ink-400 tabular w-11 text-right">
                  {pct(t.gross ? l.gross / t.gross : 0)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHead title="Platform geliri" sub="En çok kazandıran servisler" />
          <div className="space-y-0.5">
            {platformData.map((p, i) => (
              <RankRow
                key={p.name}
                rank={i + 1}
                name={p.name}
                value={p.value}
                max={platformData[0]?.value ?? 0}
                total={t.gross}
                color={CHART_COLORS[i % CHART_COLORS.length]}
                precise={precise}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="Ülke geliri" sub="Dinlenmenin geldiği pazarlar" />
          <div className="space-y-0.5">
            {countryData.map((c, i) => (
              <RankRow
                key={c.name}
                name={c.name}
                value={c.value}
                max={countryData[0]?.value ?? 0}
                total={t.gross}
                color="#3FA9E8"
                precise={precise}
                prefix={<span className="text-[15px] leading-none shrink-0">{flagOf(c.name)}</span>}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHead title="En çok kazandıran şarkılar" sub="Bölüşüm öncesi şarkı geliri" />
          <div className="space-y-0.5">
            {topSongs.map((s, i) => (
              <RankRow
                key={s.key}
                rank={i + 1}
                name={s.song}
                value={s.gross}
                max={topSongs[0]?.gross ?? 0}
                total={t.gross}
                color="#7C6BF5"
                precise={precise}
              />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {periodData.length > 1 && (
          <Card>
            <CardHead title="Dönem karşılaştırması" sub="Rapordaki dönemlere göre gelir" />
            <VBar data={periodData} height={210} precise={precise} />
          </Card>
        )}

        <Card className={periodData.length > 1 ? "" : "lg:col-span-2"}>
          <CardHead
            title="Bölüşüm özeti"
            sub="Gelirin tek sahipli ve ortak yapımlar arasındaki dağılımı"
          />
          <div className="space-y-3 mt-1">
            <SplitRow
              label="Tek sahipli şarkılar"
              value={res.artists.reduce((a, x) => a + x.soloGross, 0)}
              total={t.gross}
              color="#16A75C"
              precise={precise}
            />
            <SplitRow
              label="Ortak yapımda ana sanatçı payı"
              value={res.artists.reduce((a, x) => a + x.primaryGross, 0)}
              total={t.gross}
              color="#7C6BF5"
              precise={precise}
            />
            <SplitRow
              label="Featuring payı"
              value={res.artists.reduce((a, x) => a + x.featureGross, 0)}
              total={t.gross}
              color="#F2A93B"
              precise={precise}
            />
          </div>
          <div className="mt-4 pt-4 border-t border-line flex items-center gap-2.5">
            <Icon name="split" size={15} className="text-ink-400 shrink-0" />
            <p className="text-[12px] text-ink-500 leading-relaxed">
              <b className="text-ink-700">{res.combos.length}</b> farklı ortak yapım kombinasyonu
              bulundu, toplam <b className="text-ink-700">{money(collabGross, precise)}</b> gelir
              bölüştürüldü.
            </p>
          </div>
        </Card>

        <Card>
          <CardHead title="Net ödeme listesi" sub="İlk 6 sanatçı · kesinti sonrası" />
          <div className="space-y-0.5">
            {res.artists.slice(0, 6).map((a, i) => (
              <RankRow
                key={a.key}
                name={a.name}
                value={a.net}
                max={res.artists[0]?.net ?? 0}
                total={t.received}
                color="#16A75C"
                onClick={() => onArtist(a.key)}
                precise={precise}
                prefix={<Avatar name={a.name} size={28} />}
              />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function SplitRow({
  label,
  value,
  total,
  color,
  precise,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
  precise: boolean;
}) {
  const share = total > 0 ? value / total : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-[12.5px] text-ink-700">{label}</span>
        <span className="text-[13px] font-semibold text-ink-900 tabular">
          {money(value, precise)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 rounded-full bg-ink-900/[0.06] overflow-hidden flex-1">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.max(share * 100, 0.8)}%`, background: color }}
          />
        </div>
        <span className="text-[11px] text-ink-400 tabular w-11 text-right">{pct(share)}</span>
      </div>
    </div>
  );
}
