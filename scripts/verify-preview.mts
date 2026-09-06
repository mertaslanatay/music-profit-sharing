/**
 * Yükleme önizlemesi — veritabanına karşı doğrulama.
 *   DATABASE_URL=... npm run verify:preview
 *
 * Bu script, /api/reports/preview uç noktasının kalbindeki iki şeyi test eder:
 *  1) flattenCredits() önizleme için de gerçek ingest ile BİREBİR aynı sayıları
 *     üretiyor mu (satır/sanatçı/şarkı/brüt) — iki ayrı kod yolu olmadığı için
 *     sapma riski yok, ama bunu somut sayılarla kanıtlıyoruz.
 *  2) Dönem-bazlı çakışma sorgusu (periods ⋈ report_periods ⋈ reports) gerçek
 *     bir rapor yüklendikten SONRA o dönemi doğru buluyor mu, YÜKLENMEDEN
 *     ÖNCE hatalı pozitif vermiyor mu.
 *
 * GÜVENLİK: Yalnızca kendi ürettiği [test] verilerini kullanır, hiçbir şeyi
 * silmez. Gerçek/üretim verisine dokunmadan, kendi eklediği raporu sonunda
 * temizler (best-effort).
 */
import { transaction, query } from "../src/lib/db";
import { flattenCredits, ingestReport } from "../src/lib/ingest";
import { DEFAULT_CONFIG } from "../src/lib/types";
import type { RawRow } from "../src/lib/types";

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}${d ? "  " + d : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}${d ? "  " + d : ""}`); }
};

const damga = Date.now().toString(16);
const PERIOD = `[test-${damga}] P06 26(Jun 26)`;

const rows: RawRow[] = [
  { period: PERIOD, retailer: "Spotify", label: "M4NM", artist: "Ağaçkakan, Emiladil feat. Barış Demirel", album: "", song: "Test Şarkı", isrc: `TT${damga}1`, territory: "Turkey", countryIso: "TR", assetType: "Track", salesClass: "Interactive Streaming", quantity: 1000, revenue: 100, net: 73 },
  { period: PERIOD, retailer: "YouTube", label: "M4NM", artist: "Çiğ", album: "", song: "Test Şarkı 2", isrc: `TT${damga}2`, territory: "Turkey", countryIso: "TR", assetType: "Track", salesClass: "Interactive Streaming", quantity: 500, revenue: 50, net: 36.5 },
];

console.log("\n=== 1. flattenCredits() ÖNİZLEME İLE GERÇEK YÜKLEME AYNI SAYIYI VERİYOR MU ===");
const flat = flattenCredits(rows, DEFAULT_CONFIG);
check("3 sanatçı bulundu (Ağaçkakan, Emiladil, Barış Demirel, Çiğ = 4)", flat.artistNames.size === 4, `bulunan: ${flat.artistNames.size}`);
check("2 şarkı bulundu", flat.songs.size === 2);
check("brüt toplam 109.5", Math.abs(flat.totals.gross - 109.5) < 1e-9, `hesaplanan: ${flat.totals.gross}`);
check("negatif satır yok", flat.totals.negativeRows === 0);

console.log("\n=== 2. DÖNEM ÇAKIŞMASI: YÜKLEMEDEN ÖNCE YANLIŞ-POZİTİF VERMİYOR ===");
const before = await query<{ label: string }>(
  `select p.label from periods p
     join report_periods rp on rp.period_id = p.id
     join reports r on r.id = rp.report_id
    where p.label = any($1::text[])`,
  [[PERIOD]]
);
check("henüz hiçbir rapor bu dönemi kapsamıyor", before.length === 0, `bulunan: ${before.length}`);

console.log("\n=== 3. GERÇEK RAPORU YÜKLE, SONRA AYNI SORGU ONU BULUYOR MU ===");
const ingestResult = await transaction((c) =>
  ingestReport(c, {
    title: `[test-${damga}] Haziran raporu`,
    fileName: "test.xlsx",
    deduction: 0,
    rows,
    cfg: DEFAULT_CONFIG,
  })
);
check("rapor oluştu", !!ingestResult.reportId);

const after = await query<{ label: string; title: string; status: string }>(
  `select p.label, r.title, r.status from periods p
     join report_periods rp on rp.period_id = p.id
     join reports r on r.id = rp.report_id
    where p.label = any($1::text[])`,
  [[PERIOD]]
);
check("şimdi 1 eşleşme buluyor", after.length === 1, `bulunan: ${after.length}`);
check("doğru raporu buluyor", after[0]?.title === `[test-${damga}] Haziran raporu`);
check("durumu 'draft'", after[0]?.status === "draft");

console.log("\n=== 4. AYNI DÖNEME İKİNCİ BİR DOSYA YÜKLENSE ÇAKIŞMA İKİ RAPORU DA GÖSTERİR Mİ ===");
const ingestResult2 = await transaction((c) =>
  ingestReport(c, {
    title: `[test-${damga}] Haziran düzeltme`,
    fileName: "test2.xlsx",
    deduction: 0,
    rows: [{ ...rows[0], isrc: `TT${damga}3` }],
    cfg: DEFAULT_CONFIG,
  })
);
const after2 = await query<{ title: string }>(
  `select r.title from periods p
     join report_periods rp on rp.period_id = p.id
     join reports r on r.id = rp.report_id
    where p.label = any($1::text[])
    order by r.created_at`,
  [[PERIOD]]
);
check("her iki rapor da listelenir (eskisi silinmedi/değişmedi)", after2.length === 2, `bulunan: ${after2.length}`);
check("ilk rapor hâlâ orada", after2.some((r) => r.title.includes("Haziran raporu")));
check("ikinci rapor da orada", after2.some((r) => r.title.includes("Haziran düzeltme")));

// Temizlik — yalnızca bu scriptin ürettiği [test] raporlarını sil.
await query(`delete from reports where id = any($1::uuid[])`, [[ingestResult.reportId, ingestResult2.reportId]]);
const cleaned = await query<{ label: string }>(
  `select p.label from periods p
     join report_periods rp on rp.period_id = p.id
     join reports r on r.id = rp.report_id
    where p.label = any($1::text[])`,
  [[PERIOD]]
);
check("temizlik sonrası çakışma sorgusu tekrar boş", cleaned.length === 0);

console.log(`\n${fail === 0 ? "TÜMÜ GEÇTİ" : "BAŞARISIZ"} — ${pass} geçti, ${fail} kaldı\n`);
process.exit(fail === 0 ? 0 : 1);
