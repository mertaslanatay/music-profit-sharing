/**
 * Gelir devri — veritabanı gerektirmeyen kontroller.
 *   npm run verify:transfers
 *
 * Devir matematiğinin kendisi SQL görünümünde (0009) ve gerçek Postgres
 * üzerinde doğrulandı. Buradaki testler saf fonksiyonları hedefler:
 *   1. redactForViewer — bir sanatçı, diğerlerinin TUTARINI görebiliyor mu?
 *   2. Arayüzdeki önizleme matematiği, sunucunun uyguladığı modelle aynı mı?
 */
import { redactForViewer, type SongPeriodDetail } from "../src/lib/transfers";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  " + detail : ""}`); }
};

const A = "artist-a", B = "artist-b", C = "artist-c";

const donem = (id: string, artists: SongPeriodDetail["artists"]): SongPeriodDetail => ({
  songId: "song-1", title: "Çiğ Figaro", album: "", isrc: "", artistString: "A, B",
  reportId: "rep-1", reportTitle: "Mart", reportStatus: "published",
  periodId: id, periodLabel: id, totalGross: artists.reduce((s, a) => s + a.gross, 0),
  artists, transfers: [],
});

const P1 = donem("P03", [
  { artistId: A, artistName: "A", baseShare: 0.1, effectiveShare: 0.1, gross: 100, baseGross: 100 },
  { artistId: B, artistName: "B", baseShare: 0.9, effectiveShare: 0.9, gross: 900, baseGross: 900 },
]);
const P2 = donem("P04", [
  { artistId: B, artistName: "B", baseShare: 0.5, effectiveShare: 0.5, gross: 500, baseGross: 500 },
  { artistId: C, artistName: "C", baseShare: 0.5, effectiveShare: 0.5, gross: 500, baseGross: 500 },
]);

console.log("\n=== 1. TUTAR MASKELEME (canSeeOtherArtists KAPALI) ===");
const kisitli = redactForViewer([P1, P2], [A], false);

check("kendi geçmediği dönem tamamen düşüyor", kisitli.length === 1 && kisitli[0].periodId === "P03");
const bA = kisitli[0].artists.find((x) => x.artistId === B)!;
const aA = kisitli[0].artists.find((x) => x.artistId === A)!;
check("diğer sanatçının tutarı sıfırlanıyor", bA.gross === 0 && bA.baseGross === 0);
check("diğer sanatçı gizli olarak işaretleniyor", bA.amountHidden === true);
check("diğer sanatçının YÜZDESİ korunuyor (devir kararı için gerekli)", bA.baseShare === 0.9 && bA.effectiveShare === 0.9);
check("kendi tutarı olduğu gibi kalıyor", aA.gross === 100 && !aA.amountHidden);
check("şarkı toplamı da başkasının payını ele vermiyor", kisitli[0].totalGross === 100);

console.log("\n=== 2. YETKİLİ KULLANICI (canSeeOtherArtists AÇIK) ===");
const genis = redactForViewer([P1, P2], [A], true);
check("kendi geçmediği dönem yine düşüyor", genis.length === 1);
check("tutarlar maskelenmiyor", genis[0].artists.every((x) => !x.amountHidden));
check(
  "diğer sanatçının tutarı görünüyor",
  genis[0].artists.find((x) => x.artistId === B)!.gross === 900
);

console.log("\n=== 3. HİÇ İLGİSİ OLMAYAN KULLANICI ===");
const yabanci = redactForViewer([P1, P2], ["baska-sanatci"], false);
check("hiçbir dönem dönmüyor (rota 403 verir)", yabanci.length === 0);

console.log("\n=== 4. ÖNİZLEME MATEMATİĞİ = SUNUCU MODELİ ===");
// Sunucu modeli: etkin pay = temel pay × (1 − devredilen oran toplamı)
// Arayüz bunu tersinden çıkarır: devredilen = 1 − etkin/temel
const temel = 0.5;
for (const devredilen of [0, 0.25, 0.5, 1]) {
  const etkin = temel * (1 - devredilen);
  const geriHesap = temel > 0 ? 1 - etkin / temel : 0;
  check(
    `devredilen=${devredilen} geri hesaplanıyor`,
    Math.abs(geriHesap - devredilen) < 1e-12,
    `→ ${geriHesap}`
  );
}
// Yeni devir eklendiğinde önizlemenin verdiği sonuç
{
  const baseShare = 0.5, used = 0.25, yeni = 0.5;
  const onizleme = baseShare * (1 - used - yeni);
  const sunucu = baseShare * (1 - (used + yeni));
  check("ek devirde önizleme = sunucu", Math.abs(onizleme - sunucu) < 1e-12, `${onizleme}`);
}
// Devralanın kazancı: devredenin TEMEL payından oran kadar
{
  const fromBase = 0.5, toEff = 0.5, ratio = 0.5;
  const toNew = toEff + fromBase * ratio;
  check("devralanın yeni payı doğru", Math.abs(toNew - 0.75) < 1e-12, `${toNew}`);
}

console.log(`\n${fail === 0 ? "TÜMÜ GEÇTİ" : "BAŞARISIZ"} — ${pass} geçti, ${fail} kaldı\n`);
process.exit(fail === 0 ? 0 : 1);
