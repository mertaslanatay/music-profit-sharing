/**
 * loadResult() çıktısının, v1'in doğrulanmış compute() çıktısıyla aynı
 * olduğunu kanıtlar. Ekranlar bu yapıyı tükettiği için bu test geçerse
 * tüm arayüz DB'ye geçerken davranışını korur.
 *
 *   npx tsx scripts/verify-queries.mts <xlsx-yolu>
 */
import * as fs from "node:fs";
import * as XLSX from "@e965/xlsx";
import { readWorkbook, toRows } from "../src/lib/parse";
import { compute } from "../src/lib/calc";
import { ingestReport } from "../src/lib/ingest";
import { loadResult, listPeriods, listReports } from "../src/lib/queries";
import { pool, transaction, query } from "../src/lib/db";
import { DEFAULT_CONFIG } from "../src/lib/types";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  " + detail : ""}`); }
};
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

const path = process.argv[2];
const buf = fs.readFileSync(path);
const parsed = readWorkbook(XLSX.read(buf, { type: "buffer" }), path);
const rows = toRows(parsed, parsed.map);

// temiz başlangıç
await query(`truncate credits, report_rows, report_periods, reports,
             songs, artists, labels, periods restart identity cascade`);

const DEDUCTION = 27.75;
const ing = await transaction((c) =>
  ingestReport(c, {
    title: "M4NM Q2 2026 Ödeme",
    fileName: "q2.xlsx",
    deduction: DEDUCTION,
    rows,
    cfg: DEFAULT_CONFIG,
  })
);
await query(`update reports set status = 'published', published_at = now() where id = $1`, [ing.reportId]);

// istemci referansı — aynı kesintiyle
const ref = compute(rows, { ...DEFAULT_CONFIG, received: ing.gross - DEDUCTION });
const db = await loadResult();

console.log("\n=== 1. GENEL TOPLAMLAR ===");
const tests: [string, number, number][] = [
  ["brüt", db.totals.gross, ref.totals.gross],
  ["kesinti", db.totals.deduction, ref.totals.deduction],
  ["yatan", db.totals.received, ref.totals.received],
  ["net oranı", db.totals.netRate, ref.totals.netRate],
  ["stream", db.totals.quantity, ref.totals.quantity],
];
for (const [name, a, b] of tests) check(name, near(a, b, 1e-6), `${a.toFixed(6)} vs ${b.toFixed(6)}`);
const counts: [string, number, number][] = [
  ["sanatçı sayısı", db.totals.artistCount, ref.totals.artistCount],
  ["şarkı sayısı", db.totals.songCount, ref.totals.songCount],
  ["label sayısı", db.totals.labelCount, ref.totals.labelCount],
  ["ülke sayısı", db.totals.territoryCount, ref.totals.territoryCount],
  ["platform sayısı", db.totals.retailerCount, ref.totals.retailerCount],
  ["ham satır", db.totals.rowCount, ref.totals.rowCount],
  ["negatif satır", db.totals.negativeRows, ref.totals.negativeRows],
];
for (const [name, a, b] of counts) check(name, a === b, `${a} vs ${b}`);

console.log("\n=== 2. SANATÇI BAZINDA ===");
let devGross = 0, devNet = 0, missing = 0, worstName = "";
for (const r of ref.artists) {
  const d = db.artists.find((x) => x.key === r.key);
  if (!d) { missing++; continue; }
  const dg = Math.abs(d.gross - r.gross);
  if (dg > devGross) { devGross = dg; worstName = r.name; }
  devNet = Math.max(devNet, Math.abs(d.net - r.net));
}
check("eksik sanatçı yok", missing === 0, `${missing} eksik`);
check("brüt sapması yok", devGross < 1e-6, `azami ${devGross.toExponential(2)} (${worstName})`);
check("NET sapması yok", devNet < 0.011, `azami $${devNet.toFixed(4)}`);
check("sıralama aynı", db.artists[0].key === ref.artists[0].key,
  `${db.artists[0].name} / ${ref.artists[0].name}`);

const dbNetSum = db.artists.reduce((a, x) => a + x.net, 0);
check("Σ net == yatan tutar", near(dbNetSum, Math.round(db.totals.received * 100) / 100, 0.005),
  `$${dbNetSum.toFixed(2)}`);

console.log("\n=== 3. SANATÇI DETAYI (Ağaçkakan) ===");
const rA = ref.artists.find((a) => a.name === "Ağaçkakan")!;
const dA = db.artists.find((a) => a.key === rA.key)!;
check("solo/ana/feat aynı",
  near(dA.soloGross, rA.soloGross, 1e-6) && near(dA.primaryGross, rA.primaryGross, 1e-6) &&
  near(dA.featureGross, rA.featureGross, 1e-6),
  `solo $${dA.soloGross.toFixed(2)} ana $${dA.primaryGross.toFixed(2)} feat $${dA.featureGross.toFixed(2)}`);
check("şarkı sayısı aynı", dA.songCount === rA.songCount, `${dA.songCount} vs ${rA.songCount}`);
check("yazımlar birleşti", dA.spellings.length === rA.spellings.length,
  dA.spellings.join(" · "));
const topT = Object.entries(dA.territories).sort((a, b) => b[1] - a[1])[0];
const refT = Object.entries(rA.territories).sort((a, b) => b[1] - a[1])[0];
check("ana ülke aynı", topT[0] === refT[0], `${topT[0]} $${topT[1].toFixed(2)}`);
const topR = Object.entries(dA.retailers).sort((a, b) => b[1] - a[1])[0];
const refR = Object.entries(rA.retailers).sort((a, b) => b[1] - a[1])[0];
check("ana platform aynı", topR[0] === refR[0], `${topR[0]} $${topR[1].toFixed(2)}`);
check("işbirlikçiler var", Object.keys(dA.collaborators).length > 0,
  `${Object.keys(dA.collaborators).length} kişi`);

console.log("\n=== 4. LABEL KIRILIMI ===");
for (const rl of ref.labels) {
  const dl = db.labels.find((x) => x.label === rl.label)!;
  check(rl.label, near(dl.gross, rl.gross, 1e-6) && dl.artistCount === rl.artistCount,
    `$${dl.gross.toFixed(4)} · ${dl.artistCount} sanatçı`);
}

console.log("\n=== 5. SANATÇI × LABEL DİLİMİ (Çiğ) ===");
const rC = ref.artists.find((a) => a.name === "Çiğ")!;
const dC = db.artists.find((a) => a.key === rC.key)!;
for (const [lab, slice] of Object.entries(rC.labelBreakdown)) {
  const d = dC.labelBreakdown[lab];
  check(`Çiğ / ${lab}`, !!d && near(d.gross, slice.gross, 1e-6) && d.songCount === slice.songCount,
    `$${d?.gross.toFixed(4)} · ${d?.songCount} şarkı`);
}

console.log("\n=== 6. ŞARKI VE GLOBAL KIRILIMLAR ===");
check("şarkı sayısı aynı", db.songs.length === ref.songs.length, `${db.songs.length}`);
check("en çok kazandıran şarkı aynı", db.songs[0].song === ref.songs[0].song,
  `${db.songs[0].song} $${db.songs[0].gross.toFixed(2)}`);
const gt = (t: Record<string, number>) => Object.values(t).reduce((a, b) => a + b, 0);
check("Σ ülke == brüt", near(gt(db.territories), ref.totals.gross, 1e-6));
check("Σ platform == brüt", near(gt(db.retailers), ref.totals.gross, 1e-6));
check("Σ dönem == brüt", near(gt(db.periods), ref.totals.gross, 1e-6));

console.log("\n=== 7. DÖNEM KAPSAMI ===");
const periods = await listPeriods();
for (const p of periods) console.log(`  ${p.display.padEnd(14)} $${p.gross.toFixed(4)}  ${p.artistCount} sanatçı`);
check("2 dönem listelendi", periods.length === 2);

const single = await loadResult({ periodIds: [periods[0].id] });
check("tek dönem brütü doğru", near(single.totals.gross, periods[0].gross, 1e-6),
  `$${single.totals.gross.toFixed(4)}`);
// kesinti oransal tahsis edilmeli
const expectedDed = DEDUCTION * (periods[0].gross / ing.gross);
check("kesinti oransal tahsis edildi", near(single.totals.deduction, expectedDed, 1e-6),
  `$${single.totals.deduction.toFixed(4)} == $${expectedDed.toFixed(4)}`);
const bothSum = (await loadResult({ periodIds: [periods[0].id] })).totals.gross +
                (await loadResult({ periodIds: [periods[1].id] })).totals.gross;
check("Σ dönemler == tüm zamanlar", near(bothSum, db.totals.gross, 1e-6));

const reports = await listReports();
check("rapor listelendi", reports.length === 1 && reports[0].periods.length === 2,
  `${reports[0]?.title} · ${reports[0]?.periods.length} dönem`);

console.log("\n=== 8. TASLAK RAPOR GİZLİ ===");
await query(`update reports set status = 'draft' where id = $1`, [ing.reportId]);
const hidden = await loadResult();
check("yayınlanmamış rapor görünmüyor", hidden.totals.gross === 0, `$${hidden.totals.gross}`);
const adminView = await loadResult({ publishedOnly: false });
check("admin taslağı görüyor", near(adminView.totals.gross, ref.totals.gross, 1e-6));
await query(`update reports set status = 'published' where id = $1`, [ing.reportId]);

console.log(`\n${"=".repeat(52)}\n  ${pass} PASS   ${fail} FAIL\n${"=".repeat(52)}\n`);
await pool().end();
process.exit(fail === 0 ? 0 : 1);
