import * as XLSX from "@e965/xlsx";
import type { Result } from "./types";
import { topN } from "./format";

const r4 = (n: number) => Math.round(n * 10000) / 10000;
const r2 = (n: number) => Math.round(n * 100) / 100;

function autoWidth(rows: (string | number)[][]): { wch: number }[] {
  if (rows.length === 0) return [];
  const cols = Math.max(...rows.map((r) => r.length));
  const w: { wch: number }[] = [];
  for (let c = 0; c < cols; c++) {
    let max = 8;
    for (const row of rows) {
      const v = row[c];
      const len = v === undefined || v === null ? 0 : String(v).length;
      if (len > max) max = len;
    }
    w.push({ wch: Math.min(max + 2, 48) });
  }
  return w;
}

function addSheet(wb: XLSX.WorkBook, name: string, rows: (string | number)[][]) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = autoWidth(rows);
  if (rows.length > 1) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

/** Ödeme listesi + tüm analiz sekmelerini tek bir .xlsx olarak indirir. */
export function exportWorkbook(res: Result, fileName: string): void {
  const wb = XLSX.utils.book_new();
  const t = res.totals;

  addSheet(wb, "Özet", [
    ["MÜZİK GELİR DAĞILIMI — ÖZET"],
    [],
    ["Kaynak dosya", fileName],
    ["Oluşturulma", new Date().toLocaleString("tr-TR")],
    [],
    ["Brüt toplam (Net Dollars after Fees)", r4(t.gross)],
    ["Bankaya yatan", r2(t.received)],
    ["SWIFT / banka kesintisi", r2(t.deduction)],
    ["Kesinti oranı", `%${(t.deductionRate * 100).toFixed(4)}`],
    ["Net ödeme oranı", r4(t.netRate)],
    [],
    ["Sanatçı sayısı", t.artistCount],
    ["Şarkı sayısı", t.songCount],
    ["Label sayısı", t.labelCount],
    ["Ülke sayısı", t.territoryCount],
    ["Platform sayısı", t.retailerCount],
    ["Toplam stream / adet", Math.round(t.quantity)],
    ["İşlenen satır", t.rowCount],
    ["Negatif (iade) satır", t.negativeRows],
    [],
    ["FORMÜL", "Net Hakediş = Brüt Hakediş × (Yatan / Brüt Toplam)"],
    ["", `Net Hakediş = Brüt × ${r4(t.netRate)}`],
  ]);

  addSheet(wb, "Ödeme Listesi", [
    ["#", "Sanatçı", "Brüt Hakediş", "Kesinti", "NET ÖDEME", "Pay %", "Solo", "Ana Sanatçı", "Featuring", "Şarkı", "Stream", "Ana Label", "Ana Ülke", "Ana Platform"],
    ...res.artists.map((a, i) => {
      const tl = topN(a.labels, 1)[0];
      const tt = topN(a.territories, 1)[0];
      const tr = topN(a.retailers, 1)[0];
      return [
        i + 1,
        a.name,
        r4(a.gross),
        r2(a.deduction),
        r2(a.net),
        t.gross ? r4(a.gross / t.gross) : 0,
        r4(a.soloGross),
        r4(a.primaryGross),
        r4(a.featureGross),
        a.songCount,
        Math.round(a.quantity),
        tl?.name ?? "",
        tt?.name ?? "",
        tr?.name ?? "",
      ];
    }),
    [],
    ["", "TOPLAM", r4(t.gross), r2(t.deduction), r2(t.received)],
  ]);

  addSheet(wb, "Label", [
    ["Label", "Brüt", "Net", "Pay %", "Sanatçı", "Şarkı", "Stream", "En Çok Kazanan"],
    ...res.labels.map((l) => [
      l.label,
      r4(l.gross),
      r2(l.net),
      t.gross ? r4(l.gross / t.gross) : 0,
      l.artistCount,
      l.songCount,
      Math.round(l.quantity),
      l.topArtists.slice(0, 3).map((a) => a.name).join(", "),
    ]),
  ]);

  addSheet(wb, "Şarkılar", [
    ["Şarkı", "Albüm", "Sanatçı Dizisi", "Ana Sanatçı", "Kişi", "Label", "Gelir", "Stream", "ISRC"],
    ...res.songs.map((s) => [
      s.song,
      s.album,
      s.artistString,
      s.primaryArtist,
      s.artists.length,
      s.label,
      r4(s.gross),
      Math.round(s.quantity),
      s.isrc,
    ]),
  ]);

  addSheet(wb, "Bölüşüm Detayı", [
    ["Sanatçı", "Şarkı", "Albüm", "Sanatçı Dizisi", "Sıra", "Kişi Sayısı", "Pay %", "Brüt Katkı", "Label"],
    ...res.artists.flatMap((a) =>
      a.songs.map((s) => [
        a.name,
        s.song,
        s.album,
        s.artistString,
        s.position === 0 ? "Ana" : `${s.position + 1}.`,
        s.totalArtists,
        r4(s.share),
        r4(s.gross),
        s.label,
      ])
    ),
  ]);

  addSheet(wb, "Ülke", [
    ["Ülke", "Gelir", "Pay %"],
    ...Object.entries(res.territories)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, r4(v), t.gross ? r4(v / t.gross) : 0]),
  ]);

  addSheet(wb, "Platform", [
    ["Platform", "Gelir", "Pay %"],
    ...Object.entries(res.retailers)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => [k, r4(v), t.gross ? r4(v / t.gross) : 0]),
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `hakedis-${stamp}.xlsx`);
}

/** Tek sanatçının hakediş dökümünü panoya kopyalanabilir metin olarak üretir. */
export function artistSummaryText(
  name: string,
  gross: number,
  deduction: number,
  net: number,
  netRate: number,
  songs: { song: string; gross: number; share: number; totalArtists: number }[]
): string {
  const m = (v: number) => v.toFixed(2).replace(".", ",");
  const lines = [
    `${name} — Hakediş Dökümü`,
    "".padEnd(34, "─"),
    `Brüt hakediş     : $${m(gross)}`,
    `Banka kesintisi  : $${m(deduction)}  (%${((1 - netRate) * 100).toFixed(2).replace(".", ",")})`,
    `NET ÖDEME        : $${m(net)}`,
    "",
    "En çok kazandıran şarkılar:",
  ];
  for (const s of songs.slice(0, 10)) {
    const split = s.totalArtists > 1 ? ` (${s.totalArtists} kişi, pay %${Math.round(s.share * 100)})` : "";
    lines.push(`  • ${s.song} — $${m(s.gross)}${split}`);
  }
  return lines.join("\n");
}
