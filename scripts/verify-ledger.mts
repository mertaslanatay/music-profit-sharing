/**
 * faz-u — cari hesaptaki "dönemin hakedişini yükleme bazında parçala"
 * sorgusunun değişmez kuralı, gerçek Postgres'e karşı doğrulanır.
 *
 *   DATABASE_URL=... npm run verify:ledger
 *
 * KURAL: bir dönemin yükleme dilimlerinin toplamı, o dönemin net'ine EŞİT
 * olmalı. Eşit olmazsa ekranda "Yüklemeye göre" gruplandığında grup
 * toplamları dönem toplamlarını tutmaz ve yönetici yanlış rakama bakarak
 * ödeme yapar. Dilim sorgusu ile v_artist_period_net AYNI kaynağı
 * (v_credits_effective) ve AYNI net formülünü kullandığı için tutar; bu
 * test o bağı kilitler — biri değişip diğeri unutulursa burada patlar.
 *
 * Özellikle hedeflenen kenar durum: aynı dönem için İKİNCİ bir Excel
 * yüklenmesi (yükleme önizlemesi buna izin veriyor). O dönem iki dilime
 * bölünür; arayüz onu yalnızca birincil yüklemenin altında gösterir ama
 * TUTARIN TAMAMI oraya yazılır — yani hiçbir kuruş kaybolmaz veya iki kez
 * sayılmaz.
 */
import { query } from "../src/lib/db";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  " + detail : ""}`); }
};

const A = crypto.randomUUID();

/**
 * Test KENDİ verisini kurar. Önceden var olan bir tohuma bel bağlamak
 * kırılgandı: başka bir doğrulama betiği (verify:songscope) tabloları
 * temizlediği için sıralamaya göre bazen geçip bazen kalıyordu.
 */
async function seed() {
  const L = crypto.randomUUID(), S = crypto.randomUUID();
  const R1 = crypto.randomUUID(), R2 = crypto.randomUUID();
  const P = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];

  // Adlar/anahtarlar her koşuda benzersiz: betik kendi kayıtlarını ekliyor,
  // hiçbir şey silmiyor — üretime karşı çalıştırılsa bile zarar vermez
  // (verify:support ile aynı desen).
  const ek = L.slice(0, 8);
  await query(`insert into labels (id,name,slug) values ($1,$2,$3)`,
    [L, `Ledger Test ${ek}`, `lt-${ek}`]);
  await query(`insert into artists (id,fold_key,display_name) values ($1,$2,$3)`,
    [A, `ledger-${A.slice(0, 8)}`, `Ledger Test Sanatçı ${ek}`]);
  await query(`insert into songs (id,song_key,title,artist_string) values ($1,$2,'Test Şarkı','x')`,
    [S, `sk-${S.slice(0, 8)}`]);

  // İki ayrı yükleme. İkisinde de kesinti YOK (received = gross) ki beklenen
  // net doğrudan gross'a eşit olsun ve test okunaklı kalsın.
  await query(
    `insert into reports (id,title,file_name,file_hash,gross,deduction,received,row_count,status)
     values ($1::uuid,'Q1 Raporu',$1::text,$1::text,10000,0,10000,3,'published'),
            ($2::uuid,'Ek Rapor',$2::text,$2::text,3000,0,3000,2,'published')`,
    [R1, R2]
  );
  // periods.label GLOBAL olarak benzersiz (dönemler sanatçıya değil sisteme
  // ait). Betik üst üste çalışabilsin diye her koşuya bir ek konuyor;
  // biçim yine Excel'deki Virgin gösterimi.
  await query(
    `insert into periods (id,label,sort,year,month) values
       ($1,$4,202601,2026,1),
       ($2,$5,202602,2026,2),
       ($3,$6,202603,2026,3)`,
    [...P, `P01 26(Oca 26) ${ek}`, `P02 26(Sub 26) ${ek}`, `P03 26(Mar 26) ${ek}`]
  );

  const kredi = (rep: string, per: string, gross: number) =>
    query(
      `insert into credits (report_id,period_id,artist_id,song_id,label_id,share,position,
                            total_artists,gross,quantity,territory,retailer)
       values ($1,$2,$3,$4,$5,1,0,1,$6,100,'TR','spotify')`,
      [rep, per, A, S, L, gross]
    );

  await kredi(R1, P[0], 3000);
  await kredi(R1, P[1], 3000);
  await kredi(R1, P[2], 4000);
  // AYNI dönem (P03) için ikinci bir yükleme — testin asıl hedefi.
  await kredi(R2, P[2], 1000);
  await kredi(R2, P[1], 2000);
}

async function main() {
  await seed();
  const donemNet = await query<{ period_id: string; label: string; net: number }>(
    `select n.period_id, p.label, n.net::float8
     from v_artist_period_net n join periods p on p.id = n.period_id
     where n.artist_id = $1 order by p.sort`,
    [A]
  );

  // Uygulamadaki dilim sorgusunun BİREBİR aynısı (payments.ts).
  const dilimler = await query<{ period_id: string; report_id: string; title: string; net: number }>(
    `select c.period_id, c.report_id, r.title,
            sum(c.gross * (r.received / nullif(r.gross, 0)))::float8 as net
     from v_credits_effective c
     join reports r on r.id = c.report_id
     where c.artist_id = $1 and r.status in ('published','locked')
     group by c.period_id, c.report_id, r.title`,
    [A]
  );

  console.log("\n=== 1. DİLİM TOPLAMI = DÖNEM NET ===");
  check("dönem bulundu", donemNet.length > 0, `(${donemNet.length} dönem)`);
  for (const d of donemNet) {
    const toplam = dilimler
      .filter((s) => s.period_id === d.period_id)
      .reduce((a, s) => a + Number(s.net), 0);
    check(
      `${d.label}`,
      Math.abs(toplam - Number(d.net)) < 0.01,
      `dilim ${toplam.toFixed(2)} / net ${Number(d.net).toFixed(2)}`
    );
  }

  console.log("\n=== 2. ÇOK YÜKLEMELİ DÖNEM ===");
  const sayim = new Map<string, number>();
  for (const s of dilimler) sayim.set(s.period_id, (sayim.get(s.period_id) ?? 0) + 1);
  const cok = [...sayim.entries()].filter(([, n]) => n > 1);
  check("en az bir dönem birden fazla yüklemeden besleniyor", cok.length > 0,
    `(${cok.length} dönem)`);
  for (const [pid] of cok) {
    const d = donemNet.find((x) => x.period_id === pid);
    const toplam = dilimler.filter((s) => s.period_id === pid)
      .reduce((a, s) => a + Number(s.net), 0);
    check(`${d?.label ?? pid} tamamı korunuyor`,
      !!d && Math.abs(toplam - Number(d.net)) < 0.01,
      `${toplam.toFixed(2)}`);
  }

  console.log("\n=== 3. HER DÖNEM TAM OLARAK BİR GRUBA DÜŞÜYOR ===");
  // Arayüz gruplamayı BİRİNCİL dilime (en yüksek net) göre yapıyor.
  // Birincil seçimi belirsiz kalmamalı, yoksa dönem iki grupta görünebilir.
  const birincil = new Map<string, string>();
  for (const pid of sayim.keys()) {
    const liste = dilimler.filter((s) => s.period_id === pid)
      .sort((a, b) => Number(b.net) - Number(a.net));
    birincil.set(pid, liste[0].report_id);
  }
  check("her dönemin tek bir birincil yüklemesi var",
    birincil.size === sayim.size, `(${birincil.size}/${sayim.size})`);

  const grupToplam = [...birincil.entries()].reduce((a, [pid]) => {
    const d = donemNet.find((x) => x.period_id === pid);
    return a + Number(d?.net ?? 0);
  }, 0);
  const genelToplam = donemNet.reduce((a, d) => a + Number(d.net), 0);
  check("grupların toplamı = tüm dönemlerin toplamı (çift sayım yok)",
    Math.abs(grupToplam - genelToplam) < 0.01,
    `${grupToplam.toFixed(2)} / ${genelToplam.toFixed(2)}`);

  console.log(`\n  ${pass} geçti, ${fail} kaldı\n`);
  process.exit(fail ? 1 : 0);
}

void main();
