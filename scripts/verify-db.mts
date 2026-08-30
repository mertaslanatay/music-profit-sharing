/**
 * Faz 1 doğrulaması: veritabanına yazılan sonuçlar, v1'in doğrulanmış
 * istemci hesabıyla birebir aynı mı?
 *
 *   npx tsx scripts/verify-db.ts <xlsx-yolu>
 */
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import * as XLSX from "xlsx";
import { readWorkbook, toRows } from "../src/lib/parse";
import { compute } from "../src/lib/calc";
import { ingestReport, flattenCredits } from "../src/lib/ingest";
import { parsePeriod, periodDisplay } from "../src/lib/period";
import { pool, transaction, n } from "../src/lib/db";
import { DEFAULT_CONFIG } from "../src/lib/types";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  " + detail : ""}`); }
};
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

const path = process.argv[2];
const buf = fs.readFileSync(path);
const wb = XLSX.read(buf, { type: "buffer" });
const parsed = readWorkbook(wb, path);
const rows = toRows(parsed, parsed.map);

console.log(`\nDosya: ${rows.length} satır\n`);

console.log("=== 1. DÖNEM ÇÖZÜMLEME ===");
const cases: [string, number, number | null][] = [
  ["P03 26(Mar 26)", 2026, 3],
  ["P04 26(Apr 26)", 2026, 4],
  ["P12 25(Dec 25)", 2025, 12],
  ["2026-Q2", 2026, null],
  ["2025-11", 2025, 11],
];
for (const [label, year, month] of cases) {
  const p = parsePeriod(label);
  check(`"${label}" → ${year}${month ? "-" + month : " Ç"}`,
    p.year === year && p.month === month,
    `${periodDisplay(p)} (sort ${p.sort})`);
}

console.log("\n=== 2. DÜZLEŞTİRME = İSTEMCİ MOTORU ===");
const client = compute(rows, { ...DEFAULT_CONFIG, received: null });
const flat = flattenCredits(rows, DEFAULT_CONFIG);

check("toplam brüt aynı", near(flat.totals.gross, client.totals.gross, 1e-9),
  `${flat.totals.gross.toFixed(8)} vs ${client.totals.gross.toFixed(8)}`);
check("sanatçı sayısı aynı", flat.artistNames.size === client.totals.artistCount,
  `${flat.artistNames.size} vs ${client.totals.artistCount}`);
check("şarkı sayısı aynı", flat.songs.size === client.totals.songCount,
  `${flat.songs.size} vs ${client.totals.songCount}`);

// sanatçı bazında karşılaştırma
const flatByArtist = new Map<string, number>();
for (const c of flat.credits) {
  flatByArtist.set(c.artistFoldKey, (flatByArtist.get(c.artistFoldKey) ?? 0) + c.gross);
}
let maxArtistDev = 0;
for (const a of client.artists) {
  const v = flatByArtist.get(a.key) ?? 0;
  maxArtistDev = Math.max(maxArtistDev, Math.abs(v - a.gross));
}
check("her sanatçının brütü aynı", maxArtistDev < 1e-9, `azami sapma ${maxArtistDev.toExponential(2)}`);

console.log("\n=== 3. VERİTABANINA YAZMA ===");
const hash = crypto.createHash("sha256").update(buf).digest("hex").slice(0, 32);
const t0 = Date.now();
const result = await transaction((c) =>
  ingestReport(c, {
    title: "M4NM Q2 2026 Ödeme",
    fileName: path.split("/").pop() ?? "rapor.xlsx",
    fileHash: hash,
    deduction: 27.75,
    rows,
    cfg: DEFAULT_CONFIG,
  })
);
console.log(`  ${result.rowCount} satır + ${result.creditCount} credit → ${Date.now() - t0} ms`);
console.log(`  ${result.artistCount} sanatçı · ${result.songCount} şarkı · ${result.labelCount} label`);
for (const p of result.periods) {
  console.log(`    ${p.label.padEnd(18)} ${p.year}-${String(p.month).padStart(2, "0")}  $${p.gross.toFixed(4)}`);
}
check("2 dönem ayrıştırıldı", result.periods.length === 2, `${result.periods.length} dönem`);
check("rapor brütü doğru", near(result.gross, client.totals.gross, 1e-6));
check("yatan = brüt − kesinti", near(result.received, result.gross - 27.75, 1e-6),
  `$${result.received.toFixed(4)}`);

console.log("\n=== 4. VERİTABANI SORGULARI = İSTEMCİ MOTORU ===");

const dbTotal = await pool().query(`select sum(gross)::float8 g, sum(quantity)::float8 q from credits`);
check("Σ credits.gross == istemci brütü",
  near(n(dbTotal.rows[0].g), client.totals.gross, 1e-6),
  `$${n(dbTotal.rows[0].g).toFixed(6)}`);

const dbArtists = await pool().query<{ artist_name: string; fold_key: string; gross: number }>(
  `select a.display_name artist_name, a.fold_key, sum(c.gross)::float8 gross
   from credits c join artists a on a.id = c.artist_id
   group by a.display_name, a.fold_key order by gross desc`
);
check("sanatçı sayısı aynı", dbArtists.rowCount === client.totals.artistCount,
  `${dbArtists.rowCount} vs ${client.totals.artistCount}`);

let maxDbDev = 0;
let worst = "";
for (const r of dbArtists.rows) {
  const c = client.artists.find((x) => x.key === r.fold_key);
  if (!c) { fail++; console.log(`  FAIL  DB'de olup istemcide olmayan sanatçı: ${r.artist_name}`); continue; }
  const d = Math.abs(n(r.gross) - c.gross);
  if (d > maxDbDev) { maxDbDev = d; worst = r.artist_name; }
}
check("her sanatçının DB brütü == istemci brütü", maxDbDev < 1e-6,
  `azami sapma ${maxDbDev.toExponential(2)} (${worst})`);

// label kırılımı
const dbLabels = await pool().query<{ label_name: string; gross: number }>(
  `select l.name label_name, sum(c.gross)::float8 gross
   from credits c join labels l on l.id = c.label_id group by l.name order by gross desc`
);
console.log("\n  Label (DB):");
for (const r of dbLabels.rows) {
  const c = client.labels.find((x) => x.label === r.label_name)!;
  const ok = near(n(r.gross), c.gross, 1e-6);
  if (!ok) fail++; else pass++;
  console.log(`    ${ok ? "PASS" : "FAIL"}  ${r.label_name.padEnd(24)} $${n(r.gross).toFixed(4)}  (istemci $${c.gross.toFixed(4)})`);
}

// sanatçı × label kırılımı — v1'de düzelttiğimiz hatanın DB karşılığı
const cig = client.artists.find((a) => a.name === "Çiğ")!;
const dbCig = await pool().query<{ label_name: string; gross: number }>(
  `select l.name label_name, sum(c.gross)::float8 gross
   from credits c join labels l on l.id = c.label_id join artists a on a.id = c.artist_id
   where a.fold_key = $1 group by l.name order by gross desc`,
  [cig.key]
);
console.log("\n  Çiğ label kırılımı (DB):");
for (const r of dbCig.rows) {
  const expected = cig.labelBreakdown[r.label_name]?.gross ?? 0;
  const ok = near(n(r.gross), expected, 1e-6);
  if (!ok) fail++; else pass++;
  console.log(`    ${ok ? "PASS" : "FAIL"}  ${r.label_name.padEnd(24)} $${n(r.gross).toFixed(4)}  (istemci $${expected.toFixed(4)})`);
}

console.log("\n=== 5. DÖNEM VE TÜM ZAMANLAR GÖRÜNÜMLERİ ===");
const vPeriods = await pool().query<{ period_label: string; year: number; month: number; gross: number; artist_count: number }>(
  `select period_label, year, month, gross::float8, artist_count from v_period_totals order by period_sort`
);
for (const r of vPeriods.rows) {
  console.log(`  ${r.period_label.padEnd(18)} ${r.year}-${String(r.month).padStart(2, "0")}  $${n(r.gross).toFixed(4)}  ${r.artist_count} sanatçı`);
}
const periodSum = vPeriods.rows.reduce((a, r) => a + n(r.gross), 0);
check("Σ dönem toplamları == genel brüt", near(periodSum, client.totals.gross, 1e-6));

const vYear = await pool().query<{ year: number; gross: number; period_count: number }>(
  `select year, gross::float8, period_count from v_year_totals order by year`
);
for (const r of vYear.rows) {
  console.log(`  ${r.year}: $${n(r.gross).toFixed(4)}  (${r.period_count} dönem)`);
}

const vAll = await pool().query<{ artist_name: string; gross: number; period_count: number }>(
  `select artist_name, gross::float8, period_count from v_artist_alltime order by gross desc limit 5`
);
console.log("\n  Tüm zamanlar ilk 5:");
for (const r of vAll.rows) {
  console.log(`    ${r.artist_name.padEnd(24)} $${n(r.gross).toFixed(4)}  ${r.period_count} dönem`);
}
const allSum = (await pool().query(`select sum(gross)::float8 g from v_artist_alltime`)).rows[0].g;
check("Σ tüm zamanlar sanatçı == genel brüt", near(n(allSum), client.totals.gross, 1e-6));

console.log(`\n${"=".repeat(52)}\n  ${pass} PASS   ${fail} FAIL\n${"=".repeat(52)}\n`);
await pool().end();
process.exit(fail === 0 ? 0 : 1);
