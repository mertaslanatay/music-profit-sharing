/**
 * Motoru gerçek M4NM Q2 2026 dosyasıyla doğrular.
 *   npx tsx scripts/verify.ts <xlsx-yolu>
 */
import * as fs from "node:fs";
import * as XLSX from "@e965/xlsx";
import { readWorkbook, toRows } from "../src/lib/parse";
import { compute, round2 } from "../src/lib/calc";
import { splitArtists } from "../src/lib/artists";
import { foldKey } from "../src/lib/normalize";
import { DEFAULT_CONFIG, DEFAULT_SPLIT } from "../src/lib/types";

const path = process.argv[2];
const buf = fs.readFileSync(path);
const wb = XLSX.read(buf, { type: "buffer" });
const parsed = readWorkbook(wb, path);

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${detail ? "  " + detail : ""}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? "  " + detail : ""}`);
  }
};

console.log("\n=== 1. KOLON EŞLEŞTİRME ===");
console.log("Başlıklar:", parsed.headers.length, "| Satır:", parsed.rowCount);
for (const [k, v] of Object.entries(parsed.map)) {
  console.log(`  ${k.padEnd(12)} -> [${v}] ${parsed.headers[v as number]}`);
}
check("net kolonu 'Net Dollars after Fees'", parsed.headers[parsed.map.net!] === "Net Dollars after Fees");
check("artist kolonu 'Artist'", parsed.headers[parsed.map.artist!] === "Artist");
check("label kolonu 'Label'", parsed.headers[parsed.map.label!] === "Label");
check("song kolonu 'Song'", parsed.headers[parsed.map.song!] === "Song");
check("retailer kolonu 'Retailer'", parsed.headers[parsed.map.retailer!] === "Retailer");
check("territory kolonu 'Territory'", parsed.headers[parsed.map.territory!] === "Territory");

const rows = toRows(parsed, parsed.map);
console.log("\nÇözümlenen satır:", rows.length);

console.log("\n=== 2. SANATÇI AYRIŞTIRMA ===");
const cases: [string, string[]][] = [
  ["Ağaçkakan", ["Ağaçkakan"]],
  ["Çiğ, A-bacchus", ["Çiğ", "A-bacchus"]],
  ["Ağaçkakan, Emiladil feat. Barış Demirel", ["Ağaçkakan", "Emiladil", "Barış Demirel"]],
  ["Ağaçkakan x Savai x Emiladil", ["Ağaçkakan", "Savai", "Emiladil"]],
  ["Ağaçkakan x dafraktal", ["Ağaçkakan", "dafraktal"]],
  ["Armonycoma or slt", ["Armonycoma or slt"]],
  ["Armonycoma or slt feat. Ağaçkakan, Oğuzhan Gedik", ["Armonycoma or slt", "Ağaçkakan", "Oğuzhan Gedik"]],
  ["Herkestam feat. Nilipek.", ["Herkestam", "Nilipek."]],
  ["i.do.everything.", ["i.do.everything."]],
  ["Cxngxvxr feat. Ağaçkakan", ["Cxngxvxr", "Ağaçkakan"]],
  ["Armonycoma or slt, I.mpty feat. Hals, Rajab Eryiğit, Oğuzhan Gedik", ["Armonycoma or slt", "I.mpty", "Hals", "Rajab Eryiğit", "Oğuzhan Gedik"]],
  ["Ağaçkakan, Hrsz, Oldeaf", ["Ağaçkakan", "Hrsz", "Oldeaf"]],
  ["Dark'o Bairo feat. Tembel Hayvan", ["Dark'o Bairo", "Tembel Hayvan"]],
  ["very real earthquake machine, Veteran", ["very real earthquake machine", "Veteran"]],
];
for (const [input, expect] of cases) {
  const got = splitArtists(input, DEFAULT_SPLIT);
  check(
    JSON.stringify(input),
    JSON.stringify(got) === JSON.stringify(expect),
    JSON.stringify(got) === JSON.stringify(expect) ? `→ ${got.length} kişi` : `beklenen ${JSON.stringify(expect)} geldi ${JSON.stringify(got)}`
  );
}

console.log("\n=== 3. TÜRKÇE NORMALİZASYON ===");
const fk: [string, string][] = [
  ["Ağaçkakan", "AĞAÇKAKAN"],
  ["hrsz", "Hrsz"],
  ["Document1", "document1"],
  ["Armonycoma or slt", "Armonycoma or Slt"],
];
for (const [a, b] of fk) {
  check(`"${a}" == "${b}"`, foldKey(a) === foldKey(b), `→ ${foldKey(a)}`);
}
check('"Ağaçkakan" != "açköpek"', foldKey("Ağaçkakan") !== foldKey("açköpek"));
check('"I.mpty" == "i.mpty"', foldKey("I.mpty") === foldKey("i.mpty"), `→ ${foldKey("I.mpty")}`);

console.log("\n=== 4. TOPLAM KORUNUMU (kesintisiz) ===");
const rowSum = rows.reduce((a, r) => a + r.net, 0);
const res0 = compute(rows, { ...DEFAULT_CONFIG, received: null });
const artistSum = res0.artists.reduce((a, x) => a + x.gross, 0);
check("Σ satır net == Σ sanatçı brüt", Math.abs(rowSum - artistSum) < 1e-9, `${rowSum.toFixed(8)} vs ${artistSum.toFixed(8)}`);
check("Σ label == Σ satır net", Math.abs(res0.labels.reduce((a, l) => a + l.gross, 0) - rowSum) < 1e-9);
check("Σ şarkı == Σ satır net", Math.abs(res0.songs.reduce((a, s) => a + s.gross, 0) - rowSum) < 1e-9);
check("Σ ülke == Σ satır net", Math.abs(Object.values(res0.territories).reduce((a, b) => a + b, 0) - rowSum) < 1e-9);
check("Σ platform == Σ satır net", Math.abs(Object.values(res0.retailers).reduce((a, b) => a + b, 0) - rowSum) < 1e-9);
console.log(`  Brüt toplam: $${rowSum.toFixed(4)} | Sanatçı: ${res0.totals.artistCount} | Şarkı: ${res0.totals.songCount} | Label: ${res0.totals.labelCount}`);

console.log("\n=== 5. PRO-RATA KESİNTİ (kuruş hassasiyeti) ===");
for (const received of [300.75, 273.0, 264.0, 291.0, 250.5, 300.7471, 1.0]) {
  const r = compute(rows, { ...DEFAULT_CONFIG, received });
  const netSum = r.artists.reduce((a, x) => a + x.net, 0);
  const target = round2(received);
  check(
    `yatan $${received} → Σ net == $${target.toFixed(2)}`,
    Math.abs(netSum - target) < 0.005,
    `Σ=${netSum.toFixed(2)} oran=${r.totals.netRate.toFixed(6)}`
  );
  // Hiçbir sanatçının net tutarı matematiksel değerinden 1 kuruştan fazla sapmamalı.
  const maxDev = Math.max(...r.artists.map((a) => Math.abs(a.net - a.gross * r.totals.netRate) * 100));
  check(`   ↳ azami sapma ≤ 1 kuruş`, maxDev <= 1.0000001, `${maxDev.toFixed(4)} kuruş`);
}
{
  // Negatif bakiyeli sanatçı senaryosu — yuvarlama artığı yanlış yere yazılmamalı.
  const negRows = [
    { name: "Pozitif", v: 100 },
    { name: "Negatif", v: -3.337 },
    { name: "Ufak", v: 0.004 },
  ].map((d) => ({
    period: "P", retailer: "S", label: "L", artist: d.name, album: "", song: d.name,
    isrc: "I" + d.name, territory: "Turkey", countryIso: "TR", assetType: "Track",
    salesClass: "S", quantity: 1, revenue: d.v, net: d.v,
  }));
  const nr = compute(negRows, { ...DEFAULT_CONFIG, received: 80 });
  const sum = nr.artists.reduce((a, x) => a + x.net, 0);
  const dev = Math.max(...nr.artists.map((a) => Math.abs(a.net - a.gross * nr.totals.netRate) * 100));
  check("negatif bakiyeli sette Σ net == 80.00", Math.abs(sum - 80) < 1e-9, `Σ=${sum.toFixed(2)}`);
  check("negatif bakiyeli sette azami sapma ≤ 1 kuruş", dev <= 1.0000001, `${dev.toFixed(4)} kuruş`);
}

console.log("\n=== 6. KULLANICI ÖRNEĞİNİN BİREBİR DOĞRULAMASI ===");
// 291 brüt / 264 net → oran 0.90722
const demo = [
  { name: "Ağaçkakan", gross: 140.0, net: 127.01 },
  { name: "Çiğ", gross: 70.0, net: 63.51 },
  { name: "Armo", gross: 39.73, net: 36.04 },
  { name: "Oldeaf", gross: 16.0, net: 14.52 },
  { name: "Black Piegon", gross: 10.0, net: 9.07 },
];
// Kullanıcının örneğinde 46 sanatçıdan yalnızca 5'i listelenmiş; listelenen 5'in
// toplamı 275,73 olduğuna göre kalan 41 sanatçı 15,27 USD tutuyor. Toplamı 291'e
// tamamlamak için tek bir temsilci satır ekliyoruz.
const filler = { name: "Diğer 41 sanatçı", gross: round2(291 - demo.reduce((a, d) => a + d.gross, 0)), net: 0 };
const demoRows = [...demo, filler].map((d) => ({
  period: "P01", retailer: "Spotify", label: "M4NM", artist: d.name, album: "", song: d.name + " şarkı",
  isrc: "X" + d.name, territory: "Turkey", countryIso: "TR", assetType: "Track", salesClass: "S",
  quantity: 1, revenue: d.gross, net: d.gross,
}));
const demoRes = compute(demoRows, { ...DEFAULT_CONFIG, received: 264 });
check("demo brüt toplamı 291", Math.abs(demoRes.totals.gross - 291) < 1e-9, `= ${demoRes.totals.gross}`);
check("demo kesinti oranı ~%9,278", Math.abs(demoRes.totals.deductionRate - 27 / 291) < 1e-9, `= %${(demoRes.totals.deductionRate * 100).toFixed(3)}`);
for (const d of demo) {
  const a = demoRes.artists.find((x) => x.name === d.name)!;
  check(`${d.name}: brüt ${d.gross} → net ${d.net}`, Math.abs(a.net - d.net) < 0.011, `hesaplanan ${a.net.toFixed(2)} (kesinti ${a.deduction.toFixed(2)})`);
}
check("demo Σ net == 264.00", Math.abs(demoRes.artists.reduce((a, x) => a + x.net, 0) - 264) < 1e-9);

console.log("\n=== 7. BÖLÜŞÜM DOĞRULUĞU ===");
// "Oldeaf, Çiğ" toplamı 30.2070 -> her birine 15.1035
const oldeafCig = rows.filter((r) => r.artist === "Oldeaf, Çiğ").reduce((a, r) => a + r.net, 0);
const oldeaf = res0.artists.find((a) => a.name === "Oldeaf")!;
const cig = res0.artists.find((a) => a.name === "Çiğ")!;
console.log(`  "Oldeaf, Çiğ" satır toplamı: $${oldeafCig.toFixed(4)} → her biri $${(oldeafCig / 2).toFixed(4)}`);
check("Oldeaf bu kombinasyondan yarısını aldı", Math.abs((oldeaf.songs.filter(s => s.artistString === "Oldeaf, Çiğ").reduce((a, s) => a + s.gross, 0)) - oldeafCig / 2) < 1e-9);
check("Çiğ bu kombinasyondan yarısını aldı", Math.abs((cig.songs.filter(s => s.artistString === "Oldeaf, Çiğ").reduce((a, s) => a + s.gross, 0)) - oldeafCig / 2) < 1e-9);

const trio = "Ağaçkakan, Emiladil feat. Barış Demirel";
const trioSum = rows.filter((r) => r.artist === trio).reduce((a, r) => a + r.net, 0);
const barisShare = res0.artists.find((a) => a.name === "Barış Demirel")!.songs.filter(s => s.artistString === trio).reduce((a, s) => a + s.gross, 0);
check(`3'e bölünen "${trio}" → 1/3`, Math.abs(barisShare - trioSum / 3) < 1e-9, `$${trioSum.toFixed(4)} / 3 = $${(trioSum / 3).toFixed(4)}`);

console.log("\n=== 8. ÖZEL ORAN (OVERRIDE) ===");
const ovRes = compute(rows, { ...DEFAULT_CONFIG, overrides: { [trio]: [70, 20, 10] } });
const ovBaris = ovRes.artists.find((a) => a.name === "Barış Demirel")!.songs.filter(s => s.artistString === trio).reduce((a, s) => a + s.gross, 0);
check("70/20/10 uygulandı (Barış %10)", Math.abs(ovBaris - trioSum * 0.1) < 1e-9, `$${ovBaris.toFixed(4)} == $${(trioSum * 0.1).toFixed(4)}`);
check("override sonrası toplam korunuyor", Math.abs(ovRes.artists.reduce((a, x) => a + x.gross, 0) - rowSum) < 1e-9);

console.log("\n=== 9. ALIAS BİRLEŞTİRME ===");
const before = res0.artists.length;
const aliased = compute(rows, {
  ...DEFAULT_CONFIG,
  aliases: { [foldKey("Agackakan YugoslavFaulu Live 4K")]: foldKey("Ağaçkakan") },
});
check("birleştirme sanatçı sayısını 1 azalttı", aliased.artists.length === before - 1, `${before} → ${aliased.artists.length}`);
check("birleştirme sonrası toplam korunuyor", Math.abs(aliased.artists.reduce((a, x) => a + x.gross, 0) - rowSum) < 1e-9);
const agBefore = res0.artists.find((a) => a.name === "Ağaçkakan")!.gross;
const agAfter = aliased.artists.find((a) => a.name === "Ağaçkakan")!.gross;
console.log(`  Ağaçkakan: $${agBefore.toFixed(4)} → $${agAfter.toFixed(4)}`);

console.log("\n=== 9b. SANATÇI BAZINDA LABEL KIRILIMI ===");
// Her sanatçının label dilimlerinin toplamı, sanatçının brütüne eşit olmalı.
let maxBreakDev = 0;
for (const a of res0.artists) {
  const sum = Object.values(a.labelBreakdown).reduce((s, sl) => s + sl.gross, 0);
  maxBreakDev = Math.max(maxBreakDev, Math.abs(sum - a.gross));
}
check("Σ(sanatçı label dilimleri) == sanatçı brütü", maxBreakDev < 1e-9, `azami sapma ${maxBreakDev.toExponential(2)}`);

// Bir label için tüm sanatçıların o labeldaki dilimleri, label brütüne eşit olmalı.
for (const lab of res0.labels) {
  const sum = res0.artists.reduce((s, a) => s + (a.labelBreakdown[lab.label]?.gross ?? 0), 0);
  check(`"${lab.label}" dilim toplamı == label brütü`, Math.abs(sum - lab.gross) < 1e-9, `$${sum.toFixed(4)} == $${lab.gross.toFixed(4)}`);
}

// Çiğ iki labelda da var (M4NM + Black Pigeon). Label kapsamı toplamdan FARKLI olmalı.
const cigMulti = res0.artists.find((a) => a.name === "Çiğ")!;
const cigLabels = Object.keys(cigMulti.labelBreakdown);
console.log(`  Çiğ ${cigLabels.length} labelda: ${cigLabels.join(", ")}`);
for (const [lab, sl] of Object.entries(cigMulti.labelBreakdown)) {
  console.log(`    ${lab.padEnd(24)} $${sl.gross.toFixed(4)}`);
}
check("Çiğ birden fazla labelda", cigLabels.length >= 2, `${cigLabels.length} label`);
const cigM4NM = cigMulti.labelBreakdown["M4NM"]?.gross ?? 0;
check("Çiğ M4NM dilimi toplamdan küçük (filtre çalışıyor)", cigM4NM < cigMulti.gross - 1e-9, `M4NM $${cigM4NM.toFixed(4)} < toplam $${cigMulti.gross.toFixed(4)}`);

console.log("\n=== 10. LABEL KIRILIMI ===");
for (const l of res0.labels) {
  console.log(`  ${l.label.padEnd(24)} $${l.gross.toFixed(4).padStart(10)}  ${l.artistCount} sanatçı  ${l.songCount} şarkı  top: ${l.topArtists.slice(0, 3).map((a) => a.name).join(", ")}`);
}
check("3 label bulundu", res0.labels.length === 3);
check("M4NM en büyük label", res0.labels[0].label === "M4NM");

console.log("\n=== 11. İLK 12 SANATÇI (kesintisiz brüt) ===");
res0.artists.slice(0, 12).forEach((a, i) => {
  const topT = Object.entries(a.territories).sort((x, y) => y[1] - x[1])[0];
  const topR = Object.entries(a.retailers).sort((x, y) => y[1] - x[1])[0];
  console.log(
    `  ${String(i + 1).padStart(2)}. ${a.name.padEnd(24)} $${a.gross.toFixed(4).padStart(9)}  ` +
    `solo $${a.soloGross.toFixed(2).padStart(7)} ana $${a.primaryGross.toFixed(2).padStart(6)} feat $${a.featureGross.toFixed(2).padStart(6)}  ` +
    `${a.songCount} şarkı  ${topT?.[0]} / ${topR?.[0]}`
  );
});

console.log("\n=== 12. ALIAS ÖNERİLERİ ===");
res0.aliasSuggestions.slice(0, 8).forEach((s) => {
  console.log(`  "${s.fromName}" ($${s.fromGross.toFixed(2)}) → "${s.toName}" ($${s.toGross.toFixed(2)})  [${s.reason}]`);
});

console.log(`\n${"=".repeat(50)}\n  ${pass} PASS   ${fail} FAIL\n${"=".repeat(50)}\n`);
process.exit(fail === 0 ? 0 : 1);
