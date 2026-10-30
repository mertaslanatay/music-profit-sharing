"use client";

import type { ReactNode } from "react";
import type { Result } from "@/lib/types";
import { compact, money, moneySmart, num, pct, periodSort, topN } from "@/lib/format";
import { parsePeriod, periodShort } from "@/lib/period";
import { countryTr, flagOf } from "@/lib/flags";
import { isDomestic, regionOf } from "@/lib/regions";
import { Avatar, Card, CardHead, Icon, RankRow } from "../ui";

const shortLabel = (s: string) => (s.length > 16 ? s.slice(0, 15) + "…" : s);
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

  // --- coğrafya
  const terrTotal = Object.values(res.territories).reduce((a, v) => a + v, 0) || 1;
  const countries = topN(res.territories, 8).map((c) => ({ ...c, share: c.value / terrTotal }));
  const domesticShare =
    Object.entries(res.territories).reduce((a, [k, v]) => a + (isDomestic(k) ? v : 0), 0) / terrTotal;
  const regionTally: Record<string, number> = {};
  for (const [k, v] of Object.entries(res.territories)) {
    const r = regionOf(k);
    regionTally[r] = (regionTally[r] ?? 0) + v;
  }
  const regions = topN(regionTally, 7).map((r) => ({ ...r, share: r.value / terrTotal }));

  // --- mecralar
  const retTotal = Object.values(res.retailers).reduce((a, v) => a + v, 0) || 1;
  const platforms = topN(res.retailers, 7).map((p) => ({ ...p, share: p.value / retTotal }));
  const rpm = t.quantity > 0 ? money((t.gross / t.quantity) * 1000) : "—";

  // --- gelir türleri (satış sınıflandırması)
  const salesAll = topN(res.salesClasses, 50);
  const salesTotal = salesAll.reduce((a, x) => a + x.value, 0) || 1;
  const salesRest = salesAll.slice(4).reduce((a, x) => a + x.value, 0);
  const salesData = [...salesAll.slice(0, 4), ...(salesRest > 0 ? [{ name: "Diğer", value: salesRest }] : [])]
    .map((d) => ({ ...d, share: d.value / salesTotal }));

  // --- dönem performansı (en yeni üstte)
  const periodRows = periodData.length < 2 ? [] : periodData
    .map((p, i) => ({ ...p, change: i > 0 && periodData[i - 1].value ? (p.value - periodData[i - 1].value) / periodData[i - 1].value : null }))
    .slice(-8)
    .reverse();
  const periodMax = Math.max(1, ...periodRows.map((p) => p.value));
  const lastChange = periodData.length >= 2 && periodData[periodData.length - 2].value
    ? (periodData[periodData.length - 1].value - periodData[periodData.length - 2].value) / periodData[periodData.length - 2].value
    : null;
  const topSong = res.songs[0];
  const topCountry = countries[0];
  const topPlatform = platforms[0];
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
          <p className="font-display font-bold tabular text-ink-900 leading-[0.95] tracking-[-0.045em] mt-3 text-[clamp(36px,5.6vw,84px)]">
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
            {lastChange !== null && (
              <span className={`inline-flex items-center gap-1 h-[26px] px-2.5 rounded-full font-semibold text-[12.5px] ${lastChange >= 0 ? "bg-brand-500/15 text-brand-700" : "bg-accent-warn/15 text-accent-warn"}`}>
                {lastChange >= 0 ? "↑" : "↓"} {pct(Math.abs(lastChange))} son dönem
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
        <Kpi delay={50} dot="bg-accent-orange" label="SWIFT kesintisi"
          value={t.deduction ? money(t.deduction) : "—"}
          sub={t.deduction ? `${pct(t.deductionRate, 2)} · kazanca göre paylaştırıldı` : "Bu kapsamda kesinti yok"}
          below={
            <div className="h-1.5 rounded-full bg-ink-900/[0.07] overflow-hidden">
              <div className="h-full rounded-full bg-accent-orange grow-x"
                style={{ width: `${Math.min(100, Math.max(t.deduction ? 3 : 0, t.deductionRate * 100 * 20))}%`, animationDelay: ".35s" }} />
            </div>
          }
        />
        <Kpi delay={100} dot="bg-accent-sky" label="Hak sahibi" value={num(t.artistCount)}
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
        <Kpi delay={150} dot="bg-accent-sun" label="Toplam dinlenme" value={num(t.quantity)}
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

      {/* ------------------------------------------------ öne çıkanlar */}
      <section aria-label="Öne çıkanlar" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Insight delay={0} icon="globe" tone="sky" label="En güçlü pazar"
          value={topCountry ? `${flagOf(topCountry.name)} ${countryTr(topCountry.name)}` : "—"}
          sub={topCountry ? `Gelirin ${pct(topCountry.share)}'i · ${moneySmart(topCountry.value, precise)}` : undefined} />
        <Insight delay={50} icon="radio" tone="brand" label="En büyük mecra"
          value={topPlatform?.name ?? "—"}
          sub={topPlatform ? `Gelirin ${pct(topPlatform.share)}'i · ${moneySmart(topPlatform.value, precise)}` : undefined} />
        <Insight delay={100} icon="music" tone="orange" label="Zirvedeki şarkı"
          value={topSong?.song ?? "—"}
          sub={topSong ? `${moneySmart(topSong.gross, precise)} brüt` : undefined} />
        <Insight delay={150} icon="chart" tone="sun" label="1K dinlenme başına"
          value={rpm}
          sub="Ortalama brüt gelir" />
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

      {/* ------------------------------------------------ coğrafya + gelir türleri */}
      <div className="flex flex-wrap gap-5">
        <div data-aos="fade-up" className="flex-[2_1_560px] min-w-0">
          <Card className="h-full">
            <CardHead
              title="Coğrafya"
              sub="Gelirin geldiği pazarlar ve bölgeler"
              right={<span className="text-[12px] font-semibold text-ink-600 bg-ink-900/[0.06] px-2.5 py-1 rounded-full tabular">{num(t.territoryCount)} ülke</span>}
            />
            <div className="grid grid-cols-1 md:grid-cols-[1.25fr_1fr] gap-x-8 gap-y-6">
              <ol className="space-y-3.5">
                {countries.map((c, i) => (
                  <li key={c.name} className="grid grid-cols-[22px_1fr_auto] items-center gap-x-3 gap-y-1.5">
                    <span className="text-[16px] leading-none">{flagOf(c.name)}</span>
                    <span className="text-[13.5px] font-medium text-ink-900 truncate" title={c.name}>{countryTr(c.name)}</span>
                    <span className="text-[13.5px] font-bold text-ink-900 tabular">{moneySmart(c.value, precise)}</span>
                    <span className="col-start-2 h-1.5 rounded-full bg-ink-900/[0.07] overflow-hidden">
                      <span className="block h-full rounded-full grow-x" style={{ width: `${countries[0]?.value ? Math.max(2, (c.value / countries[0].value) * 100) : 0}%`, background: "rgb(var(--c-sky))", animationDelay: `${0.2 + i * 0.07}s` }} />
                    </span>
                    <span className="text-[11.5px] text-ink-400 tabular text-right">{pct(c.share)}</span>
                  </li>
                ))}
              </ol>
              <div className="space-y-5">
                <div>
                  <p className="eyebrow mb-2.5">Yurt içi · yurt dışı</p>
                  <div className="flex gap-[3px] h-3">
                    <span className="h-full rounded-full grow-x bg-brand-500" style={{ flex: `${Math.max(domesticShare, 0.005)} 1 0` }} />
                    <span className="h-full rounded-full grow-x bg-accent-orange" style={{ flex: `${Math.max(1 - domesticShare, 0.005)} 1 0`, animationDelay: ".15s" }} />
                  </div>
                  <div className="mt-2.5 flex justify-between text-[13px]">
                    <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-[3px] bg-brand-500" />Türkiye <b className="tabular text-ink-900">{pct(domesticShare)}</b></span>
                    <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-[3px] bg-accent-orange" />Yurt dışı <b className="tabular text-ink-900">{pct(1 - domesticShare)}</b></span>
                  </div>
                </div>
                <div>
                  <p className="eyebrow mb-2.5">Bölgeler</p>
                  <ul className="space-y-2.5">
                    {regions.map((r, i) => (
                      <li key={r.name} className="flex items-center gap-3 text-[13px]">
                        <span className="w-[118px] shrink-0 truncate text-ink-700">{r.name}</span>
                        <span className="flex-1 h-1.5 rounded-full bg-ink-900/[0.07] overflow-hidden">
                          <span className="block h-full rounded-full grow-x" style={{ width: `${Math.max(1.5, r.share * 100)}%`, background: CHART_COLORS[i % CHART_COLORS.length], animationDelay: `${0.25 + i * 0.07}s` }} />
                        </span>
                        <span className="w-12 text-right font-semibold tabular text-ink-900">{pct(r.share)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div data-aos="fade-up" data-aos-delay="100" className="flex-[1_1_300px] min-w-0">
          <Card className="h-full">
            <CardHead title="Gelir türleri" sub="Satış sınıflandırmasına göre" />
            <Donut data={salesData} colors={DONUT_COLORS} height={190}
              centerValue={salesData[0] ? pct(salesData[0].share, 0) : "—"}
              centerLabel={salesData[0] ? shortLabel(salesData[0].name) : ""} precise={precise} />
            <ul className="mt-5 space-y-2.5">
              {salesData.map((d, i) => (
                <li key={d.name} className="flex items-center gap-2.5 text-[13px]">
                  <span className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: DONUT_COLORS[i] }} />
                  <span className="flex-1 truncate text-ink-700" title={d.name}>{d.name}</span>
                  <span className="font-bold tabular text-ink-900">{pct(d.share)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      {/* ------------------------------------------------ mecralar + ödeme listesi */}
      <div className="flex flex-wrap gap-5">
        <div data-aos="fade-up" className="flex-[1_1_340px] min-w-0">
          <Card className="h-full">
            <CardHead
              title="Streaming mecraları"
              sub="Platform bazında brüt gelir"
              right={<span className="text-[12px] font-semibold text-ink-600 bg-ink-900/[0.06] px-2.5 py-1 rounded-full tabular">{num(t.retailerCount)} platform</span>}
            />
            <ol className="space-y-3.5">
              {platforms.map((p, i) => (
                <li key={p.name} className="grid grid-cols-[28px_1fr_auto] items-center gap-x-3 gap-y-1.5">
                  <span className="w-7 h-7 rounded-lg grid place-items-center text-[11px] font-bold text-white"
                    style={{ background: CHART_COLORS[i % CHART_COLORS.length], color: i === 3 || i === 6 ? "#0B0D12" : "#fff" }}>
                    {p.name.slice(0, 1).toLocaleUpperCase("tr-TR")}
                  </span>
                  <span className="text-[13.5px] font-medium text-ink-900 truncate">{p.name}</span>
                  <span className="text-[13.5px] font-bold text-ink-900 tabular">{moneySmart(p.value, precise)}</span>
                  <span className="col-start-2 h-1.5 rounded-full bg-ink-900/[0.07] overflow-hidden">
                    <span className="block h-full rounded-full grow-x" style={{ width: `${platforms[0]?.value ? Math.max(2, (p.value / platforms[0].value) * 100) : 0}%`, background: CHART_COLORS[i % CHART_COLORS.length], animationDelay: `${0.2 + i * 0.07}s` }} />
                  </span>
                  <span className="text-[11.5px] text-ink-400 tabular text-right">{pct(p.share)}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 pt-4 border-t border-line flex items-center justify-between gap-3">
              <span className="text-[13px] text-ink-500">1.000 dinlenme başına ortalama</span>
              <span className="font-display text-[18px] font-bold tabular text-ink-900">{rpm}</span>
            </div>
          </Card>
        </div>

        <div data-aos="fade-up" data-aos-delay="100" className="flex-[2_1_520px] min-w-0">
          <Card className="h-full">
            <CardHead title="Ödeme listesi" sub={`İlk 9 sanatçı · net oran ${t.netRate.toLocaleString("tr-TR", { maximumFractionDigits: 5 })}`} />
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
                  {res.artists.slice(0, 9).map((a) => (
                    <tr key={a.key} onClick={() => onArtist(a.key)}
                      className="cursor-pointer hover:bg-ink-900/[0.04] transition-colors">
                      <td className="px-3 py-3 border-b border-line">
                        <button type="button" onClick={(e) => { e.stopPropagation(); onArtist(a.key); }}
                          aria-label={`${a.name} — hakediş ayrıntısını aç`}
                          className="flex items-center gap-2.5 font-semibold text-ink-900 text-left max-w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-card">
                          <Avatar name={a.name} size={28} />
                          <span className="truncate">{a.name}</span>
                        </button>
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

      {/* ------------------------------------------------ dönem performansı + şarkılar + label */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div data-aos="fade-up">
          <Card className="h-full">
            <CardHead title="Dönem performansı" sub="Son dönemler · bir öncekine göre değişim" />
            {periodRows.length === 0 ? (
              <p className="text-[13px] text-ink-400">Karşılaştırma için en az iki dönem gerekir.</p>
            ) : (
              <ul className="divide-y divide-line">
                {periodRows.map((p) => (
                  <li key={p.full} className="flex items-center gap-3 py-2.5">
                    <span className="w-[72px] shrink-0 text-[13px] font-medium text-ink-700" title={p.full}>{p.name}</span>
                    <span className="flex-1 h-1.5 rounded-full bg-ink-900/[0.07] overflow-hidden">
                      <span className="block h-full rounded-full grow-x bg-brand-500" style={{ width: `${Math.max(2, (p.value / periodMax) * 100)}%` }} />
                    </span>
                    <span className="w-[92px] text-right text-[13px] font-bold tabular text-ink-900">{compact(p.value)}</span>
                    <span className={`w-[64px] text-right text-[12px] font-semibold tabular ${p.change === null ? "text-ink-400" : p.change >= 0 ? "text-brand-700" : "text-accent-warn"}`}>
                      {p.change === null ? "—" : `${p.change >= 0 ? "↑" : "↓"} ${pct(Math.abs(p.change))}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div data-aos="fade-up" data-aos-delay="50">
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
        <div data-aos="fade-up" data-aos-delay="100">
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

function Insight({
  icon,
  tone,
  label,
  value,
  sub,
  delay,
}: {
  icon: string;
  tone: "brand" | "orange" | "sky" | "sun";
  label: string;
  value: string;
  sub?: string;
  delay: number;
}) {
  const chip = {
    brand: "bg-brand-500/15 text-brand-700",
    orange: "bg-accent-orange/15 text-accent-orange",
    sky: "bg-accent-sky/15 text-accent-sky",
    sun: "bg-accent-sun/20 text-amber-700",
  }[tone];
  return (
    <div data-aos="fade-up" data-aos-delay={delay}
      className="rounded-[20px] bg-card border border-line p-5 flex items-start gap-4 min-w-0">
      <span className={`w-10 h-10 rounded-xl grid place-items-center shrink-0 ${chip}`}>
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0">
        <p className="eyebrow">{label}</p>
        <p className="mt-1.5 font-display text-[18px] font-bold tracking-[-0.02em] text-ink-900 truncate" title={value}>{value}</p>
        {sub && <p className="mt-1 text-[12.5px] text-ink-500 truncate">{sub}</p>}
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
