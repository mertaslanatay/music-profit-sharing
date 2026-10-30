"use client";

import type { ReactNode } from "react";
import type { Result } from "@/lib/types";
import { compact, money, moneySmart, num, pct, periodSort, topN } from "@/lib/format";
import { parsePeriod, periodShort } from "@/lib/period";
import { flagOf } from "@/lib/flags";
import { Avatar, Card, CardHead, Icon, RankRow } from "../ui";
import { AreaTrend, CHART_COLORS, Donut, HBar } from "../charts";

/**
 * Panel — Ledger yerleşimi.
 * Sıra: tek büyük rakam (dağıtılacak net) → 4 gösterge → seyir grafiği +
 * en çok kazananlar → platform halkası + ödeme listesi → ayrıntı kartları.
 * Her blok AOS ile aşağıdan belirir; grafikler kendi animasyonuyla çizilir.
 */
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

  const periodData = Object.entries(res.periods)
    .sort((a, b) => periodSort(a[0]) - periodSort(b[0]))
    .map(([label, value]) => ({ name: periodShort(parsePeriod(label)), full: label, value }));

  const platformsAll = topN(res.retailers, 50);
  const platformTop = platformsAll.slice(0, 4);
  const platformRest = platformsAll.slice(4).reduce((a, x) => a + x.value, 0);
  const platformData = [
    ...platformTop,
    ...(platformRest > 0 ? [{ name: "Diğer", value: platformRest }] : []),
  ].map((d) => ({ ...d, share: t.gross ? d.value / t.gross : 0 }));
  const DONUT_COLORS = [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2], CHART_COLORS[3], "rgb(var(--c-line-strong))"];

  const countryData = topN(res.territories, 6);
  const labelData = res.labels.map((l) => ({ name: l.label, value: l.gross, share: t.gross ? l.gross / t.gross : 0 }));
  const topArtists = res.artists.slice(0, 5);
  const topSongs = res.songs.slice(0, 6);
  const collabGross = res.artists.reduce((a, x) => a + x.primaryGross + x.featureGross, 0);

  // Büyük rakam: kuruşlar soluk, ayrı.
  const net = money(t.received, precise);
  const cut = net.lastIndexOf(",");
  const netMain = cut > 0 ? net.slice(0, cut) : net;
  const netCents = cut > 0 ? net.slice(cut) : "";

  // Mini çubuklar: son 7 dönem, sonuncusu vurgulu.
  const lastPeriods = periodData.slice(-7);
  const maxP = Math.max(1, ...lastPeriods.map((p) => p.value));

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------ tek büyük rakam */}
      <section data-aos="fade-up" className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pt-1">
        <div className="min-w-0">
          <p className="eyebrow">Dağıtılacak net hakediş</p>
          <p className="font-display font-bold tabular text-ink-900 leading-[0.95] tracking-[-0.045em] mt-3 text-[clamp(44px,5.6vw,84px)] break-all">
            {netMain}
            <span className="text-ink-400 font-medium">{netCents}</span>
          </p>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-[14.5px] text-ink-500">
            {t.deduction !== 0 ? (
              <span className="inline-flex items-center gap-1 h-[26px] px-2.5 rounded-full bg-accent-warn/15 text-accent-warn font-semibold text-[12.5px]">
                −{pct(t.deductionRate, 2)} kesinti
              </span>
            ) : (
              <span className="inline-flex items-center h-[26px] px-2.5 rounded-full bg-brand-500/15 text-brand-700 font-semibold text-[12.5px]">
                kesintisiz
              </span>
            )}
            <span>
              Bankaya yatan tutar üzerinden oransal dağıtıldı · {num(t.artistCount)} sanatçı · {num(t.songCount)} şarkı
            </span>
          </p>
        </div>
      </section>

      {/* ------------------------------------------------ göstergeler */}
      <section aria-label="Özet göstergeler" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Kpi delay={0} dot="bg-brand-500" label="Brüt gelir" value={money(t.gross, precise)}
          sub={`${num(t.rowCount)} satır işlendi`}
          visual={lastPeriods.length > 1 ? (
            <svg width="72" height="32" viewBox="0 0 72 32" aria-hidden>
              {lastPeriods.map((p, i) => {
                const h = Math.max(4, (p.value / maxP) * 32);
                const last = i === lastPeriods.length - 1;
                return (
                  <rect key={p.full} className="grow-y" x={i * 11} y={32 - h} width="6" height={h} rx="3"
                    style={{ fill: last ? "rgb(var(--c-brand-500))" : "rgb(var(--c-ink-900) / 0.1)", animationDelay: `${0.3 + i * 0.05}s` }} />
                );
              })}
            </svg>
          ) : undefined}
        />
        <Kpi delay={60} dot="bg-accent-orange" label="SWIFT kesintisi"
          value={t.deduction ? money(t.deduction) : "—"}
          sub={t.deduction ? `${pct(t.deductionRate, 2)} · kazanca göre paylaştırıldı` : "Bu kapsamda kesinti yok"}
          below={
            <div className="h-1.5 rounded-full bg-ink-900/[0.07] overflow-hidden">
              <div className="h-full rounded-full bg-accent-orange grow-x"
                style={{ width: `${Math.min(100, Math.max(t.deduction ? 3 : 0, t.deductionRate * 100 * 20))}%`, animationDelay: ".35s" }} />
            </div>
          }
        />
        <Kpi delay={120} dot="bg-accent-sky" label="Hak sahibi" value={num(t.artistCount)}
          sub={`${res.combos.length} ortak yapım · ${num(t.labelCount)} label`}
          visual={
            <span className="flex">
              {res.artists.slice(0, 3).map((a, i) => (
                <span key={a.key} className="rounded-full ring-2 ring-card" style={{ marginLeft: i ? -8 : 0 }}>
                  <Avatar name={a.name} size={30} />
                </span>
              ))}
              {t.artistCount > 3 && (
                <span className="w-[30px] h-[30px] -ml-2 rounded-full ring-2 ring-card bg-ink-900/10 text-ink-700 grid place-items-center text-[10px] font-bold">
                  +{t.artistCount - 3}
                </span>
              )}
            </span>
          }
        />
        <Kpi delay={180} dot="bg-accent-sun" label="Toplam dinlenme" value={num(t.quantity)}
          sub={`${num(t.retailerCount)} platform · ${num(t.territoryCount)} ülke`}
          below={
            <div className="flex gap-[3px] h-1.5">
              {platformData.map((p, i) => (
                <span key={p.name} className="h-full rounded-full grow-x"
                  style={{ flex: `${Math.max(p.share, 0.01)} 1 0`, background: DONUT_COLORS[i], animationDelay: `${0.35 + i * 0.1}s` }} />
              ))}
            </div>
          }
        />
      </section>

      {/* ------------------------------------------------ seyir + en çok kazananlar */}
      <div className="flex flex-wrap gap-5">
        <div data-aos="fade-up" className="flex-[2_1_520px] min-w-0">
          <Card className="h-full">
            {periodData.length > 1 ? (
              <>
                <CardHead title="Dönemlere göre gelir" sub={`${periodData.length} dönem · bir noktanın üzerine gel`} />
                <AreaTrend data={periodData} height={330} precise={precise} />
              </>
            ) : (
              <>
                <CardHead title="Sanatçı hakedişleri" sub="İlk 10 · bölüşüm sonrası brüt" />
                <HBar
                  data={res.artists.slice(0, 10).map((a) => ({
                    name: a.name.length > 18 ? a.name.slice(0, 17) + "…" : a.name,
                    value: a.gross,
                    share: t.gross ? a.gross / t.gross : 0,
                  }))}
                  height={300}
                  precise={precise}
                />
              </>
            )}
          </Card>
        </div>

        <div data-aos="fade-up" data-aos-delay="100" className="flex-[1_1_300px] min-w-0">
          <Card className="h-full">
            <CardHead title="En çok kazananlar" sub="Kesinti sonrası net" />
            <ol className="space-y-[18px]">
              {topArtists.map((a, i) => {
                const w = topArtists[0]?.net ? Math.max(2, (a.net / topArtists[0].net) * 100) : 0;
                return (
                  <li key={a.key}>
                    <button type="button" onClick={() => onArtist(a.key)}
                      className="w-full text-left grid grid-cols-[30px_1fr_auto] items-center gap-x-3 gap-y-2 rounded-xl -mx-2 px-2 py-1 hover:bg-ink-900/[0.04] transition-colors">
                      <Avatar name={a.name} size={30} />
                      <span className="text-[14px] font-semibold text-ink-900 truncate">{a.name}</span>
                      <span className="text-[14px] font-bold text-ink-900 tabular">{moneySmart(a.net, precise)}</span>
                      <span className="col-start-2 col-span-2 h-2 rounded-full bg-ink-900/[0.07] overflow-hidden">
                        <span className="block h-full rounded-full grow-x"
                          style={{ width: `${w}%`, background: "linear-gradient(90deg, rgb(var(--c-sky)), rgb(var(--c-brand-500)))", animationDelay: `${0.3 + i * 0.1}s` }} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------ platformlar + ödeme listesi */}
      <div className="flex flex-wrap gap-5">
        <div data-aos="fade-up" className="flex-[1_1_320px] min-w-0">
          <Card className="h-full">
            <CardHead title="Platformlar" sub="Brüt gelirdeki pay" />
            <div className="flex flex-wrap items-center gap-6">
              <div className="w-[180px] shrink-0">
                <Donut data={platformData} colors={DONUT_COLORS} height={180}
                  centerValue={platformData[0] ? pct(platformData[0].share, 0) : "—"}
                  centerLabel={platformData[0]?.name ?? ""} precise={precise} />
              </div>
              <ul className="flex-1 min-w-[150px] space-y-3">
                {platformData.map((p, i) => (
                  <li key={p.name} className="flex items-center gap-2.5 text-[14px]">
                    <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: DONUT_COLORS[i] }} />
                    <span className="flex-1 truncate text-ink-700">{p.name}</span>
                    <span className="font-bold tabular text-ink-900">{pct(p.share, 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>

        <div data-aos="fade-up" data-aos-delay="100" className="flex-[2_1_520px] min-w-0">
          <Card className="h-full">
            <CardHead title="Ödeme listesi" sub={`İlk 6 sanatçı · net oran ${t.netRate.toLocaleString("tr-TR", { maximumFractionDigits: 5 })}`} />
            <div className="overflow-x-auto -mx-1">
              <table className="w-full min-w-[480px] border-collapse text-[14px]">
                <thead>
                  <tr>
                    {["Sanatçı", "Brüt", "Net hakediş", "Pay"].map((h, i) => (
                      <th key={h} className={`eyebrow font-semibold px-3 py-2.5 border-b border-line ${i ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {res.artists.slice(0, 6).map((a) => (
                    <tr key={a.key} onClick={() => onArtist(a.key)}
                      className="cursor-pointer hover:bg-ink-900/[0.04] transition-colors">
                      <td className="px-3 py-3 border-b border-line">
                        <span className="flex items-center gap-2.5 font-semibold text-ink-900">
                          <Avatar name={a.name} size={28} />
                          <span className="truncate">{a.name}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3 border-b border-line text-right tabular text-ink-500">{moneySmart(a.gross, precise)}</td>
                      <td className="px-3 py-3 border-b border-line text-right tabular font-bold text-ink-900">{moneySmart(a.net, precise)}</td>
                      <td className="px-3 py-3 border-b border-line text-right">
                        <span className="inline-flex items-center h-[24px] px-2.5 rounded-full bg-brand-500/15 text-brand-700 text-[12px] font-semibold tabular">
                          {pct(t.received ? a.net / t.received : 0)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------ ayrıntılar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div data-aos="fade-up">
          <Card className="h-full">
            <CardHead title="Ülkeler" sub="Gelirin geldiği pazarlar" />
            <div className="space-y-0.5">
              {countryData.map((c) => (
                <RankRow key={c.name} name={c.name} value={c.value} max={countryData[0]?.value ?? 0}
                  total={t.gross} color={CHART_COLORS[2]} precise={precise}
                  prefix={<span className="text-[15px] leading-none shrink-0">{flagOf(c.name)}</span>} />
              ))}
            </div>
          </Card>
        </div>
        <div data-aos="fade-up" data-aos-delay="60">
          <Card className="h-full">
            <CardHead title="Şarkılar" sub="Bölüşüm öncesi şarkı geliri" />
            <div className="space-y-0.5">
              {topSongs.map((s, i) => (
                <RankRow key={s.key} rank={i + 1} name={s.song} value={s.gross} max={topSongs[0]?.gross ?? 0}
                  total={t.gross} color={CHART_COLORS[1]} precise={precise} />
              ))}
            </div>
          </Card>
        </div>
        <div data-aos="fade-up" data-aos-delay="120">
          <Card className="h-full">
            <CardHead title="Label dağılımı" sub="Gelirin label bazında kırılımı" />
            <Donut data={labelData} height={170} centerValue={compact(t.gross)} centerLabel="toplam brüt" precise={precise} />
            <div className="mt-4 space-y-2.5">
              {res.labels.map((l, i) => (
                <div key={l.label} className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-[13px] text-ink-700 flex-1 truncate">{l.label}</span>
                  <span className="text-[13px] font-semibold text-ink-900 tabular">{moneySmart(l.gross, precise)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div data-aos="fade-up">
        <Card>
          <CardHead title="Bölüşüm özeti" sub="Gelirin tek sahipli ve ortak yapımlar arasındaki dağılımı" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4">
            <SplitRow label="Tek sahipli şarkılar" value={res.artists.reduce((a, x) => a + x.soloGross, 0)}
              total={t.gross} color={CHART_COLORS[0]} precise={precise} />
            <SplitRow label="Ortak yapımda ana sanatçı payı" value={res.artists.reduce((a, x) => a + x.primaryGross, 0)}
              total={t.gross} color={CHART_COLORS[1]} precise={precise} />
            <SplitRow label="Featuring payı" value={res.artists.reduce((a, x) => a + x.featureGross, 0)}
              total={t.gross} color={CHART_COLORS[3]} precise={precise} />
          </div>
          <div className="mt-5 pt-4 border-t border-line flex items-center gap-2.5">
            <Icon name="split" size={15} className="text-ink-400 shrink-0" />
            <p className="text-[13px] text-ink-500 leading-relaxed">
              <b className="text-ink-800">{res.combos.length}</b> farklı ortak yapım kombinasyonu bulundu, toplam{" "}
              <b className="text-ink-800">{money(collabGross, precise)}</b> gelir bölüştürüldü.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  dot,
  visual,
  below,
  delay,
}: {
  label: string;
  value: string;
  sub?: string;
  dot: string;
  visual?: ReactNode;
  below?: ReactNode;
  delay: number;
}) {
  return (
    <div data-aos="fade-up" data-aos-delay={delay}
      className="rounded-[20px] bg-card border border-line p-5 flex flex-col gap-3.5 min-w-0">
      <div className="flex items-center justify-between gap-3 min-h-[32px]">
        <p className="eyebrow flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${dot}`} />
          {label}
        </p>
        {visual}
      </div>
      <p className="font-display text-[clamp(22px,2.1vw,28px)] font-bold tracking-[-0.035em] text-ink-900 tabular leading-none">{value}</p>
      {below}
      {sub && <p className="text-[13px] text-ink-500 -mt-1">{sub}</p>}
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
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span className="text-[13px] text-ink-600">{label}</span>
        <span className="text-[14px] font-bold text-ink-900 tabular">{money(value, precise)}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 rounded-full bg-ink-900/[0.07] overflow-hidden flex-1">
          <div className="h-full rounded-full grow-x" style={{ width: `${Math.max(share * 100, 0.8)}%`, background: color }} />
        </div>
        <span className="text-[12px] text-ink-400 tabular w-11 text-right">{pct(share)}</span>
      </div>
    </div>
  );
}
