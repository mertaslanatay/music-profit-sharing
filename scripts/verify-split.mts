/**
 * Sanatçı ayrıştırma regresyon testi — Excel dosyası GEREKTİRMEZ.
 *   npm run verify:split
 *
 * Belirteçler (feat, x, virgül…) veritabanına taşındığında ayrıştırma
 * davranışının değişmediğini kanıtlar. Buradaki ilk blok, verify.ts'teki
 * gerçek M4NM verisinden alınmış vakaların birebir aynısıdır.
 */
import { splitArtists, separatorsFromOptions, compileSeparators } from "../src/lib/artists";
import { DEFAULT_SPLIT, DEFAULT_SEPARATORS, type Separator } from "../src/lib/types";

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

const eq = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

/** Tohum listesi (id'li) — veritabanı yolunun birebir eşdeğeri. */
const seeded: Separator[] = DEFAULT_SEPARATORS.map((s, i) => ({ ...s, id: `seed-${i}` }));

console.log("\n=== 1. BAYRAK YOLU (eski davranış korunuyor mu) ===");
const cases: [string, string[]][] = [
  ["Ağaçkakan", ["Ağaçkakan"]],
  ["i.do.everything.", ["i.do.everything."]],
  ["Cxngxvxr feat. Ağaçkakan", ["Cxngxvxr", "Ağaçkakan"]],
  [
    "Armonycoma or slt, I.mpty feat. Hals, Rajab Eryiğit, Oğuzhan Gedik",
    ["Armonycoma or slt", "I.mpty", "Hals", "Rajab Eryiğit", "Oğuzhan Gedik"],
  ],
  ["Ağaçkakan, Hrsz, Oldeaf", ["Ağaçkakan", "Hrsz", "Oldeaf"]],
  ["Dark'o Bairo feat. Tembel Hayvan", ["Dark'o Bairo", "Tembel Hayvan"]],
  ["very real earthquake machine, Veteran", ["very real earthquake machine", "Veteran"]],
  ["Ağaçkakan x Savai x Emiladil", ["Ağaçkakan", "Savai", "Emiladil"]],
  ["Herkestam feat. Nilipek.", ["Herkestam", "Nilipek."]],
  // Kapalı belirteçler bölmemeli (varsayılanda & ve / kapalı):
  ["Simge & Mabel Matiz", ["Simge & Mabel Matiz"]],
  ["Sagopa / Kolera", ["Sagopa / Kolera"]],
  // İsim içi x bölünmemeli:
  ["Cxngxvxr", ["Cxngxvxr"]],
  ["Gxblin, Hrsz", ["Gxblin", "Hrsz"]],
];
for (const [input, expect] of cases) {
  const got = splitArtists(input, DEFAULT_SPLIT);
  check(JSON.stringify(input), eq(got, expect), eq(got, expect) ? `→ ${got.length} kişi` : `beklenen ${JSON.stringify(expect)} geldi ${JSON.stringify(got)}`);
}

console.log("\n=== 2. BELİRTEÇ LİSTESİ YOLU (veritabanı) bayrak yoluyla AYNI mı ===");
for (const [input] of cases) {
  const viaFlags = splitArtists(input, DEFAULT_SPLIT);
  const viaList = splitArtists(input, seeded);
  check(JSON.stringify(input), eq(viaFlags, viaList), eq(viaFlags, viaList) ? "" : `bayrak ${JSON.stringify(viaFlags)} ≠ liste ${JSON.stringify(viaList)}`);
}

console.log("\n=== 3. BELİRTEÇ AÇ/KAPA ===");
const withAmp = seeded.map((s) => (s.token === "&" ? { ...s, isActive: true } : s));
check(
  '"&" açılınca böler',
  eq(splitArtists("Simge & Mabel Matiz", withAmp), ["Simge", "Mabel Matiz"]),
  JSON.stringify(splitArtists("Simge & Mabel Matiz", withAmp))
);
const noComma = seeded.map((s) => (s.token === "," ? { ...s, isActive: false } : s));
check(
  '"," kapanınca bölmez',
  eq(splitArtists("Ağaçkakan, Hrsz", noComma), ["Ağaçkakan, Hrsz"]),
  JSON.stringify(splitArtists("Ağaçkakan, Hrsz", noComma))
);

console.log("\n=== 4. YENİ BELİRTEÇ EKLEME ===");
const withPlus: Separator[] = [
  ...seeded,
  { id: "custom-1", token: "+", kind: "symbol", isActive: true, sort: 45 },
];
check(
  '"+" işaret belirteci eklenince böler',
  eq(splitArtists("Motive+Şehinşah", withPlus), ["Motive", "Şehinşah"]),
  JSON.stringify(splitArtists("Motive+Şehinşah", withPlus))
);
const withPres: Separator[] = [
  ...seeded,
  { id: "custom-2", token: "presents", kind: "word", isActive: true, sort: 15 },
];
check(
  '"presents" kelime belirteci eklenince böler',
  eq(splitArtists("Oldeaf presents Çiğ", withPres), ["Oldeaf", "Çiğ"]),
  JSON.stringify(splitArtists("Oldeaf presents Çiğ", withPres))
);
check(
  '"presents" isim içinde bölmez (kelime belirteci)',
  eq(splitArtists("Presentski", withPres), ["Presentski"]),
  JSON.stringify(splitArtists("Presentski", withPres))
);

console.log("\n=== 5. REGEX GÜVENLİĞİ (özel karakter kaçırma) ===");
const weird: Separator[] = [
  { id: "w1", token: "(", kind: "symbol", isActive: true, sort: 10 },
  { id: "w2", token: "*", kind: "symbol", isActive: true, sort: 11 },
];
let compiled = true;
try {
  compileSeparators(weird);
} catch {
  compiled = false;
}
check("regex özel karakterleri çökertmiyor", compiled);
check(
  "boş belirteç yok sayılıyor",
  compileSeparators([{ id: "e", token: "   ", kind: "symbol", isActive: true, sort: 1 }]).length === 0
);

console.log("\n=== 6. KÖPRÜ (separatorsFromOptions) ===");
const bridged = separatorsFromOptions(DEFAULT_SPLIT);
check(
  "varsayılan bayraklar tohum listesiyle aynı aktiflik üretiyor",
  bridged.every((b) => {
    const seed = seeded.find((s) => s.token === b.token);
    return !!seed && seed.isActive === b.isActive;
  })
);

console.log(`\n${fail === 0 ? "TÜMÜ GEÇTİ" : "BAŞARISIZ"} — ${pass} geçti, ${fail} kaldı\n`);
process.exit(fail === 0 ? 0 : 1);
