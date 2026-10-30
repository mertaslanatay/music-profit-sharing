"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { compact, money } from "@/lib/format";

export const CHART_COLORS = [
  "#3D5CFF",
  "#FF7A2F",
  "#22B8F5",
  "#FFC234",
  "#FF6B57",
  "#8FA3FF",
  "#7FD4FF",
  "#FF9F7A",
];

function TipBox({
  active,
  payload,
  label,
  precise,
}: {
  active?: boolean;
  payload?: { value?: number; payload?: { name?: string; full?: string; share?: number } }[];
  label?: string | number;
  precise?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  // Eksende kısaltılmış bir etiket varsa ("Mar 26"), ipucunda TAM hâli
  // gösterilir ("P03 26(Mar 26)") — kısaltma bilgi kaybettirmemeli.
  const name = p.payload?.full ?? p.payload?.name ?? String(label ?? "");
  return (
    <div className="rounded-xl bg-ink-900 px-3 py-2 shadow-pop">
      <p className="text-[11.5px] text-canvas/70 mb-0.5 max-w-[220px] truncate">{name}</p>
      <p className="text-[15px] font-display font-bold text-canvas tabular">
        {money(Number(p.value ?? 0), precise)}
      </p>
      {p.payload?.share !== undefined && (
        <p className="text-[11px] text-canvas/60 mt-0.5 tabular">
          %{(p.payload.share * 100).toFixed(1).replace(".", ",")}
        </p>
      )}
    </div>
  );
}

/** Yatay bar — uzun sanatçı / ülke adları için. */
export function HBar({
  data,
  height = 300,
  color = "#3D5CFF",
  precise,
  onClick,
}: {
  data: { name: string; value: number; share?: number }[];
  height?: number;
  color?: string;
  precise?: boolean;
  onClick?: (name: string) => void;
}) {
  if (data.length === 0) return <div style={{ height }} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
        <defs>
          <linearGradient id={`hb-${color.slice(1)}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity={0.95} />
            <stop offset="100%" stopColor={color} stopOpacity={0.8} />
          </linearGradient>
        </defs>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={128}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "var(--chart-axis)" }}
          interval={0}
        />
        <Tooltip content={<TipBox precise={precise} />} cursor={{ fill: "var(--chart-cursor)" }} />
        <Bar
          dataKey="value"
          fill={`url(#hb-${color.slice(1)})`}
          radius={[0, 999, 999, 0]}
          maxBarSize={16}
          background={{ fill: "var(--chart-cursor)", radius: 999 } as never}
          animationDuration={1200}
          animationEasing="ease-out"
          onClick={(d: unknown) => {
            const row = d as { name?: string };
            if (onClick && row?.name) onClick(row.name);
          }}
          cursor={onClick ? "pointer" : undefined}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Dikey gradient bar — referans dashboard'lardaki gelir grafiği. */
export function VBar({
  data,
  height = 260,
  color = "#3D5CFF",
  precise,
}: {
  data: { name: string; value: number; full?: string }[];
  height?: number;
  color?: string;
  precise?: boolean;
}) {
  if (data.length === 0) return <div style={{ height }} />;

  /**
   * Eksen etiketlerinin seyreltilmesi.
   *
   * Eskiden interval={0} ile HER etiket zorla çiziliyordu. 60 dönemlik bir
   * raporda bu, 44px'lik şeride sığmayan onlarca eğik yazının üst üste
   * binmesi demekti — okunaklı bir eksen değil, gri bir leke.
   *
   * Kaç etiket sığdığı çubuk sayısına göre hesaplanıyor. Recharts'ta
   * interval=k, her (k+1). etiketi çizer.
   */
  const HEDEF_ETIKET = 7;
  const interval = data.length <= HEDEF_ETIKET ? 0 : Math.ceil(data.length / HEDEF_ETIKET) - 1;

  // Etiketler kısaysa (ör. "Mar 26") düz yazmak eğik yazmaktan çok daha
  // okunaklı; uzun kalırsa eski eğik düzene düşülüyor.
  const enUzun = data.reduce((m, d) => Math.max(m, d.name.length), 0);
  const duz = enUzun <= 9;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: -12 }}>
        <defs>
          <linearGradient id="vb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.95} />
            <stop offset="100%" stopColor={color} stopOpacity={0.18} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11.5, fill: "var(--chart-axis)" }}
          interval={interval}
          height={duz ? 26 : 44}
          angle={duz ? 0 : -32}
          textAnchor={duz ? "middle" : "end"}
          minTickGap={4}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
          tickFormatter={(v: number) => compact(v)}
          width={54}
        />
        <Tooltip content={<TipBox precise={precise} />} cursor={{ fill: "var(--chart-cursor)" }} />
        <Bar dataKey="value" fill="url(#vb)" radius={[7, 7, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Donut — label / gelir tipi dağılımı. */
export function Donut({
  data,
  height = 220,
  centerLabel,
  centerValue,
  precise,
  colors = CHART_COLORS,
}: {
  data: { name: string; value: number; share?: number }[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
  precise?: boolean;
  colors?: string[];
}) {
  if (data.length === 0) return <div style={{ height }} />;
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="63%"
            outerRadius="92%"
            paddingAngle={3}
            cornerRadius={6}
            stroke="none"
            animationDuration={1400}
            animationEasing="ease-out"
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip content={<TipBox precise={precise} />} />
        </PieChart>
      </ResponsiveContainer>
      {centerValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[18px] font-display font-bold tracking-tight text-ink-900 tabular leading-none">
            {centerValue}
          </span>
          {centerLabel && (
            <span className="text-[11px] text-ink-400 mt-1.5">{centerLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Alan grafiği — dönemler boyunca gelirin seyri.
 * Ledger: sky → kobalt gradyan çizgi, yumuşak (monotone) eğri, hafif dolgu,
 * kesik ızgara; üzerine gelince ipucu.
 */
export function AreaTrend({
  data,
  height = 260,
  precise,
}: {
  data: { name: string; value: number; full?: string }[];
  height?: number;
  precise?: boolean;
}) {
  if (data.length === 0) return <div style={{ height }} />;
  const HEDEF_ETIKET = 8;
  const interval = data.length <= HEDEF_ETIKET ? 0 : Math.ceil(data.length / HEDEF_ETIKET) - 1;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="at-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--c-brand-500))" stopOpacity={0.36} />
            <stop offset="100%" stopColor="rgb(var(--c-brand-500))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="at-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(var(--c-sky))" />
            <stop offset="100%" stopColor="rgb(var(--c-brand-500))" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 5" />
        <XAxis
          dataKey="name"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11.5, fill: "var(--chart-axis)" }}
          interval={interval}
          minTickGap={8}
          dy={6}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "var(--chart-axis)" }}
          tickFormatter={(v: number) => compact(v)}
          width={66}
        />
        <Tooltip
          content={<TipBox precise={precise} />}
          cursor={{ stroke: "rgb(var(--c-ink-900))", strokeOpacity: 0.25, strokeDasharray: "2 4" }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="url(#at-line)"
          strokeWidth={3}
          fill="url(#at-fill)"
          activeDot={{ r: 6, fill: "rgb(var(--c-brand-500))", stroke: "rgb(var(--c-card))", strokeWidth: 3 }}
          dot={false}
          animationDuration={1800}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
