/**
 * İletişim merkezi — veritabanına karşı yetki ve akış testi.
 *   DATABASE_URL=... npm run verify:support
 *
 * GÜVENLİK: Bu script hiçbir şeyi SİLMEZ ve mevcut veriye dokunmaz.
 * Kendi test kullanıcılarını ve konuşmalarını oluşturur, tüm ölçümleri
 * yalnızca kendi oluşturduğu kayıtlar üzerinden ya da ÖNCESİ/SONRASI farkı
 * (delta) olarak yapar. Bu yüzden üretim veritabanına karşı çalıştırılsa bile
 * zarar vermez — yalnızca birkaç test kaydı bırakır (sonunda kendi
 * konuşmalarını kapatır, ismi "[test]" ile başlar).
 */
import { query } from "../src/lib/db";
import {
  createThread, addReply, getThread, listThreads, threadOwner, unreadThreadCount,
} from "../src/lib/support";

let pass = 0, fail = 0;
const check = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}${d ? "  " + d : ""}`); }
  else { fail++; console.log(`  FAIL  ${n}${d ? "  " + d : ""}`); }
};

// UUID yalnızca onaltılık basamak kabul eder — damgayı hex üretiyoruz.
const damga = Date.now().toString(16).padStart(12, "0").slice(-12);
const A = `aaaaaaaa-0000-4000-8000-${damga}`;
const B = `bbbbbbbb-0000-4000-8000-${damga}`;
const ADM = `cccccccc-0000-4000-8000-${damga}`;

await query(
  `insert into users (id, email, first_name, last_name, role, status) values
   ($1, $4, '[test] Ali', 'Sanatci', 'artist', 'active'),
   ($2, $5, '[test] Berk', 'Sanatci', 'artist', 'active'),
   ($3, $6, '[test] Yonetici', 'Hesap', 'admin', 'active')
   on conflict (id) do nothing`,
  [A, B, ADM, `test-a-${damga}@ornek.test`, `test-b-${damga}@ornek.test`, `test-y-${damga}@ornek.test`]
);

// Ölçümler bu başlangıç değerlerine göre DELTA olarak yapılır.
const adminBaslangic = await unreadThreadCount("admin");

console.log("\n=== 1. TALEP AÇMA ===");
const { id } = await createThread({
  userId: A, userName: "[test] Ali Sanatci",
  subject: `[test-${damga}] Mart hakedişim`,
  body: "Mart dönemi rakamında bir sorum var.",
});
check("konuşma oluştu", !!id);
check("sahibi doğru", (await threadOwner(id))?.userId === A);
check(
  "yönetici kutusunda okunmamış +1",
  (await unreadThreadCount("admin")) === adminBaslangic + 1
);
check("konuşmayı açan kullanıcıda okunmamış yok", (await unreadThreadCount("user", A)) === 0);

console.log("\n=== 2. YETKİ: BAŞKASININ KONUŞMASI ===");
check("başka sanatçı AÇAMIYOR", (await getThread(id, { userId: B, isAdmin: false })) === null);
check("sahibi açabiliyor", (await getThread(id, { userId: A, isAdmin: false })) !== null);
check("yönetici açabiliyor", (await getThread(id, { userId: ADM, isAdmin: true })) !== null);
check(
  "oturumsuz/boş kimlikle açılamıyor",
  (await getThread(id, { userId: "", isAdmin: false })) === null
);

console.log("\n=== 3. LİSTE SIZDIRMIYOR MU ===");
const berkListe = await listThreads({ side: "user", ownerId: B });
check("başka sanatçının listesinde YOK", !berkListe.some((t) => t.id === id));
const aliListe = await listThreads({ side: "user", ownerId: A });
check("kendi listesinde VAR", aliListe.some((t) => t.id === id));
check("kendi listesinde YALNIZCA kendi konuşmaları", aliListe.every((t) => t.userId === A));
const adminListe = await listThreads({ side: "admin" });
check("yönetici listesinde VAR", adminListe.some((t) => t.id === id));

console.log("\n=== 4. YÖNETİCİ CEVABI ===");
await addReply({
  threadId: id, senderId: ADM, senderName: "[test] Yonetici Hesap",
  role: "admin", body: "Bakıyorum, döneceğim.",
});
const sonrasi = await getThread(id, { userId: ADM, isAdmin: true });
check("mesaj sayısı 2", sonrasi?.messages.length === 2);
check("durum 'answered'", sonrasi?.status === "answered");
check("kullanıcı tarafında okunmamış oldu", (await unreadThreadCount("user", A)) === 1);

console.log("\n=== 5. AÇINCA OKUNDU İŞARETLENİYOR ===");
await getThread(id, { userId: A, isAdmin: false });
check("kullanıcı açtı → okunmamışı sıfırlandı", (await unreadThreadCount("user", A)) === 0);

console.log("\n=== 6. KAPALI KONUŞMAYA YAZINCA YENİDEN AÇILIYOR ===");
await query(`update support_threads set status = 'closed' where id = $1`, [id]);
await addReply({
  threadId: id, senderId: A, senderName: "[test] Ali Sanatci",
  role: "user", body: "Teşekkürler, bir şey daha var.",
});
const son = await getThread(id, { userId: ADM, isAdmin: true });
check("kapalı konuşma yeniden açıldı", son?.status === "open");
check("mesaj sayısı 3", son?.messages.length === 3);
check(
  "gönderen rolleri sırayla doğru",
  son?.messages.map((m) => m.senderRole).join(",") === "user,admin,user"
);
check(
  "mesaj gövdeleri korunuyor",
  son?.messages[0].body.startsWith("Mart dönemi") === true
);

// Test konuşmasını kapat — gerçek bir kutuda "açık talep" gibi durmasın.
await query(`update support_threads set status = 'closed' where id = $1`, [id]);

console.log(`\n${fail === 0 ? "TÜMÜ GEÇTİ" : "BAŞARISIZ"} — ${pass} geçti, ${fail} kaldı\n`);
process.exit(fail === 0 ? 0 : 1);
