"use client";

import {
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
  "#16A75C",
  "#7C6BF5",
  "#3FA9E8",
  "#F2A93B",
  "#E5556E",
  "#2FB3A0",
  "#5B8DEF",
  "#D2649A",
];

function TipBox({
  active,
  payload,
  label,
  precise,
}: {
  active?: boolean;
  payload?: { value?: number; payload?: { name?: string; share?: number } }[];
  label?: string | number;
  precise?: boolean;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const name = p.payload?.name ?? String(label ?? "");
  return (
    <div className="rounded-xl bg-ink-900 px-3 py-2 shadow-pop">
      <p className="text-[11.5px] text-white/60 mb-0.5 max-w-[220px] truncate">{name}</p>
      <p className="text-[14px] font-semibold text-white tabular">
        {money(Number(p.value ?? 0), precise)}
      </p>
      {p.payload?.share !== undefined && (
        <p className="text-[11px] text-white/50 mt-0.5 tabular">
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
  color = "#16A75C",
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
            <stop offset="100%" stopColor={color} stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={128}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "#64748B" }}
          interval={0}
        />
        <Tooltip content={<TipBox precise={precise} />} cursor={{ fill: "rgba(15,23,32,0.04)" }} />
        <Bar
          dataKey="value"
          fill={`url(#hb-${color.slice(1)})`}
          radius={[0, 6, 6, 0]}
          maxBarSize={22}
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
  color = "#16A75C",
  precise,
}: {
  data: { name: string; value: number }[];
  height?: number;
  color?: string;
  precise?: boolean;
}) {
  if (data.length === 0) return <div style={{ height }} />;
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
          tick={{ fontSize: 11.5, fill: "#8A97A6" }}
          interval={0}
          height={44}
          angle={-32}
          textAnchor="end"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11, fill: "#B4BEC9" }}
          tickFormatter={(v: number) => compact(v)}
          width={54}
        />
        <Tooltip content={<TipBox precise={precise} />} cursor={{ fill: "rgba(15,23,32,0.04)" }} />
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
}: {
  data: { name: string; value: number; share?: number }[];
  height?: number;
  centerLabel?: string;
  centerValue?: string;
  precise?: boolean;
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
            paddingAngle={2.5}
            stroke="none"
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<TipBox precise={precise} />} />
        </PieChart>
      </ResponsiveContainer>
      {centerValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[19px] font-semibold text-ink-900 tabular leading-none">
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
