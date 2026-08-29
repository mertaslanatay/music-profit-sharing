const nf = (min: number, max: number) =>
  new Intl.NumberFormat("tr-TR", { minimumFractionDigits: min, maximumFractionDigits: max });

const f2 = nf(2, 2);
const f4 = nf(4, 4);
const f0 = nf(0, 0);

/** Para: $1.234,56 — precise=true ise 4 haneli (mikro tutarlar için). */
export function money(v: number, precise = false): string {
  const n = Number.isFinite(v) ? v : 0;
  const s = precise ? f4.format(n) : f2.format(n);
  return n < 0 ? `-$${s.replace("-", "")}` : `$${s}`;
}

/** Tabloda görünmeyen mikro tutarları belli eder. */
export function moneySmart(v: number, precise = false): string {
  if (!precise && v !== 0 && Math.abs(v) < 0.005) return v > 0 ? "<$0,01" : ">-$0,01";
  return money(v, precise);
}

export function num(v: number): string {
  return f0.format(Number.isFinite(v) ? Math.round(v) : 0);
}

export function pct(v: number, digits = 1): string {
  const n = Number.isFinite(v) ? v * 100 : 0;
  return `%${nf(digits, digits).format(n)}`;
}

/** Grafik ekseni için kısa biçim: $1,2K */
export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return `$${nf(1, 1).format(v / 1000)}K`;
  if (a >= 1) return `$${nf(0, 0).format(v)}`;
  return `$${nf(2, 2).format(v)}`;
}

export function initials(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("tr-TR");
  return (parts[0][0] + parts[1][0]).toLocaleUpperCase("tr-TR");
}

/** İsimden kararlı (deterministik) renk üretir — avatar rozetleri için. */
const PALETTE = [
  "#16A75C",
  "#7C6BF5",
  "#3FA9E8",
  "#F2A93B",
  "#E5556E",
  "#0E8C4B",
  "#5B8DEF",
  "#D2649A",
  "#2FB3A0",
  "#B4763F",
];

export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** "P03 26(Mar 26)" gibi dönem etiketlerini sıralanabilir hale getirir. */
export function periodSort(p: string): number {
  const m = /P(\d{1,2})\s*(\d{2})/.exec(p ?? "");
  if (m) return Number(m[2]) * 100 + Number(m[1]);
  const d = Date.parse(p);
  return Number.isFinite(d) ? d / 1e6 : 0;
}

export function topN(t: Record<string, number>, n: number): { name: string; value: number }[] {
  return Object.entries(t)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}
