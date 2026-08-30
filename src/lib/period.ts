/** Rapordaki dönem etiketini yıl/ay/çeyreğe çözer. */
export interface ParsedPeriod {
  label: string;
  sort: number;      // 202603 — sıralanabilir
  year: number;
  month: number | null;
  quarter: number | null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  oca: 1, sub: 2, "şub": 2, nis: 4, haz: 6, tem: 7, agu: 8, "ağu": 8,
  eyl: 9, eki: 10, kas: 11, ara: 12,
};

/**
 * Desteklenen biçimler:
 *   "P03 26(Mar 26)"  → 2026-03
 *   "P12 25(Dec 25)"  → 2025-12
 *   "2026-Q2"         → 2026 Ç2
 *   "Mar 2026" / "2026-03"
 * Çözülemezse yıl 0 döner; çağıran taraf kullanıcıya sorar.
 */
export function parsePeriod(raw: string): ParsedPeriod {
  const label = (raw ?? "").trim();
  const empty: ParsedPeriod = { label, sort: 0, year: 0, month: null, quarter: null };
  if (!label) return empty;

  const mk = (year: number, month: number | null, quarter: number | null): ParsedPeriod => ({
    label,
    year,
    month,
    quarter: quarter ?? (month ? Math.ceil(month / 3) : null),
    sort: year * 100 + (month ?? (quarter ? quarter * 3 : 0)),
  });

  // "P03 26(Mar 26)"  — dönem no + iki haneli yıl
  const virgin = /^P(\d{1,2})\s*(\d{2})/i.exec(label);
  if (virgin) {
    const month = Number(virgin[1]);
    const year = 2000 + Number(virgin[2]);
    if (month >= 1 && month <= 12) return mk(year, month, null);
  }

  // parantez içindeki ay adı: "(Mar 26)"
  const named = /\(([A-Za-zÇĞİÖŞÜçğıöşü]{3,})\s*(\d{2,4})\)/.exec(label);
  if (named) {
    const m = MONTHS[named[1].slice(0, 3).toLowerCase()];
    if (m) {
      const y = Number(named[2]);
      return mk(y < 100 ? 2000 + y : y, m, null);
    }
  }

  // "2026-Q2" veya "2026 Q2"
  const q = /(\d{4})[\s-]*Q([1-4])/i.exec(label);
  if (q) return mk(Number(q[1]), null, Number(q[2]));

  // "2026-03"
  const iso = /(\d{4})[-/](\d{1,2})/.exec(label);
  if (iso) {
    const m = Number(iso[2]);
    if (m >= 1 && m <= 12) return mk(Number(iso[1]), m, null);
  }

  // "Mar 2026"
  const my = /^([A-Za-zÇĞİÖŞÜçğıöşü]{3,})\s+(\d{4})$/.exec(label);
  if (my) {
    const m = MONTHS[my[1].slice(0, 3).toLowerCase()];
    if (m) return mk(Number(my[2]), m, null);
  }

  // sadece yıl
  const y = /(20\d{2})/.exec(label);
  if (y) return mk(Number(y[1]), null, null);

  return empty;
}

const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

/** Ekranda gösterilecek sade ad: "Mart 2026" / "2026 Ç2" / ham etiket. */
export function periodDisplay(p: { year: number; month: number | null; quarter: number | null; label: string }): string {
  if (p.year && p.month) return `${TR_MONTHS[p.month - 1]} ${p.year}`;
  if (p.year && p.quarter) return `${p.year} Ç${p.quarter}`;
  if (p.year) return String(p.year);
  return p.label;
}

/** Kısa biçim, grafik eksenleri için: "Mar 26" */
export function periodShort(p: { year: number; month: number | null; quarter: number | null; label: string }): string {
  if (p.year && p.month) return `${TR_MONTHS[p.month - 1].slice(0, 3)} ${String(p.year).slice(2)}`;
  if (p.year && p.quarter) return `Ç${p.quarter} ${String(p.year).slice(2)}`;
  if (p.year) return String(p.year);
  return p.label.slice(0, 10);
}
