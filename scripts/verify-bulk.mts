/**
 * faz-z13 — Yönetim › Ödemeler: label × ödeme partisi kırılımı ve toplu
 * kapatma, gerçek Postgres'e karşı.
 *
 *   DATABASE_URL=... npm run verify:bulk
 *
 * KURALLAR
 *  1. Hücre ödenenlerinin toplamı her sanatçı-dönemde payment_periods
 *     toplamına eşit (kuruş kaybolmaz, iki kez sayılmaz).
 *  2. Etiketsiz (eski) ödeme label'lara gelir oranında bölünür — 0018'den
 *     önceki davranış birebir korunur.
 *  3. Toplu kapatma yalnızca seçili label'ın payını kapatır ve bu ödeme
 *     kırılımda O label'a yazılır (diğer label'a sızmaz).
 *  4. Parti (rapor) filtresi yalnızca o partinin dönemlerini kapatır.
 *  5. Plan, dönemin genel kalanını asla aşmaz; ikinci kez çalıştırınca boş.
 *
 * Test kendi kayıtlarını üretir, hiçbir şey silmez.
 */
import { query } from "../src/lib/db";
import { getPaymentBreakdown, planBulkClose, recordPayment } from "../src/lib/payments";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  " + detail : ""}`); }
};
const near = (a: number, b: number) => Math.abs(a - b) < 0.0001;
const id = () => crypto.randomUUID();

const L1 = id(), L2 = id(), A = id(), B = id(), S = id();
const R1 = id(), R2 = id(), P1 = id(), P2 = id(), P3 = id();

async function seed() {
  const ek = L1.slice(0, 8);
  await query(`insert into labels (id,name,slug) values ($1,$3,$4),($2,$5,$6)`,
    [L1, L2, `Bulk L1 ${ek}`, `bl1-${ek}`, `Bulk L2 ${ek}`, `bl2-${ek}`]);
  await query(`insert into artists (id,fold_key,display_name) values ($1,$3,'Bulk A'),($2,$4,'Bulk B')`,
    [A, B, `bulka-${ek}`, `bulkb-${ek}`]);
  await query(`insert into songs (id,song_key,title,artist_string) values ($1,$2,'Bulk Şarkı','x')`,
    [S, `bulk-${ek}`]);
  await query(
    `insert into reports (id,title,file_name,file_hash,gross,deduction,received,row_count,status)
     values ($1::uuid,'R1',$1::text,$1::text,1000,0,1000,1,'published'),
            ($2::uuid,'R2',$2::text,$2::text,1000,0,1000,1,'published')`, [R1, R2]);
  await query(
    `insert into periods (id,label,sort,year,month) values
       ($1,$4,209001,2090,1),($2,$5,209002,2090,2),($3,$6,209003,2090,3)`,
    [P1, P2, P3, `B1 ${ek}`, `B2 ${ek}`, `B3 ${ek}`]);
  await query(`insert into report_periods (report_id, period_id) values ($1,$3),($1,$4),($2,$5)`,
    [R1, R2, P1, P2, P3]);
  const k = (r: string, p: string, a: string, l: string, g: number) => query(
    `insert into credits (report_id,period_id,artist_id,song_id,label_id,share,position,
                          total_artists,gross,quantity,territory,retailer)
     values ($1,$2,$3,$4,$5,1,0,1,$6,10,'TR','spotify')`, [r, p, a, S, l, g]);
  // A: P1'de iki label (100 + 50), P2 yalnız L1 (40), P3 (R2) yalnız L1 (30)
  await k(R1, P1, A, L1, 100); await k(R1, P1, A, L2, 50);
  await k(R1, P2, A, L1, 40); await k(R2, P3, A, L1, 30);
  // B: P1'de iki label (60 + 40) — eski tip etiketsiz ödeme testi için
  await k(R1, P1, B, L1, 60); await k(R1, P1, B, L2, 40);
}

async function cell(a: string, p: string, l: string) {
  const bd = await getPaymentBreakdown();
  let net = 0, paid = 0;
  for (const [ai, pi, li, , n, pd] of bd.cells) {
    if (bd.artists[ai] === a && bd.periods[pi].id === p && bd.labels[li] === l) { net += n; paid += pd; }
  }
  return { net, paid };
}

async function main() {
  await seed();

  // 2. eski tip (etiketsiz) ödeme: B P1'e 30 → L1 18, L2 12
  await recordPayment({ artistId: B, allocations: [{ periodId: P1, amountUsd: 30 }], paidCurrency: "USD", paidAmount: 30 });
  const b1 = await cell(B, P1, L1), b2 = await cell(B, P1, L2);
  check("etiketsiz ödeme gelir oranında bölünür", near(b1.paid, 18) && near(b2.paid, 12), `${b1.paid} / ${b2.paid}`);

  // 3. A için yalnız L1, tüm partiler
  const plan1 = await planBulkClose({ artistIds: [A], labelIds: [L1], reportIds: [] });
  const p1 = plan1[0];
  check("plan: L1 kalanı 100+40+30", p1 && near(p1.amountUsd, 170), String(p1?.amountUsd));
  check("plan: P1'de yalnız L1 payı (100)", near(p1.allocations.find((x) => x.periodId === P1)!.amountUsd, 100));
  check("plan: label izleri L1'e", p1.labelSplits.every((x) => x.labelId === L1));
  await recordPayment({ artistId: A, allocations: p1.allocations, labelSplits: p1.labelSplits, paidCurrency: "USD", paidAmount: 170 });

  const a1 = await cell(A, P1, L1), a2 = await cell(A, P1, L2);
  check("toplu ödeme L1'e yazıldı", near(a1.paid, 100), String(a1.paid));
  check("L2'ye sızmadı", near(a2.paid, 0), String(a2.paid));
  const st = await query<{ remaining: string }>(
    `select remaining from v_artist_period_status where artist_id=$1 and period_id=$2`, [A, P1]);
  check("genel kalan P1 = 50 (L2 payı)", near(Number(st[0].remaining), 50), st[0].remaining);

  // 1. toplam korunumu
  const bd = await getPaymentBreakdown();
  const sums = new Map<string, number>();
  for (const [ai, pi, , , , pd] of bd.cells) {
    const k = bd.artists[ai] + "|" + bd.periods[pi].id;
    sums.set(k, (sums.get(k) ?? 0) + pd);
  }
  const pp = await query<{ a: string; p: string; s: string }>(
    `select pay.artist_id a, pp.period_id p, sum(pp.amount_usd) s from payment_periods pp
     join payments pay on pay.id=pp.payment_id where pay.artist_id = any($1::uuid[]) group by 1,2`, [[A, B]]);
  check("hücre ödenenleri = payment_periods", pp.every((r) => near(sums.get(r.a + "|" + r.p) ?? 0, Number(r.s))),
    pp.map((r) => `${Number(r.s)}≈${(sums.get(r.a + "|" + r.p) ?? 0).toFixed(4)}`).join(" "));

  // 5. tekrar çalıştırınca boş
  const again = await planBulkClose({ artistIds: [A], labelIds: [L1], reportIds: [] });
  check("aynı kapsam ikinci kez: plan boş", again.length === 0);

  // 4. parti filtresi: B için yalnız R2 → B'nin R2'de kaydı yok → boş; A için L2 + R1 → 50
  const r2 = await planBulkClose({ artistIds: [A, B], labelIds: [], reportIds: [R2] });
  check("R2 kapsamında kalan yok (A'nın P3'ü kapandı)", r2.length === 0);
  const r1 = await planBulkClose({ artistIds: [A], labelIds: [L2], reportIds: [R1] });
  check("A · L2 · R1 → 50", r1.length === 1 && near(r1[0].amountUsd, 50), String(r1[0]?.amountUsd));
  const bAll = await planBulkClose({ artistIds: [B], labelIds: [], reportIds: [] });
  check("B tüm kapsam → 70 (100 − 30)", bAll.length === 1 && near(bAll[0].amountUsd, 70), String(bAll[0]?.amountUsd));
  const sp = bAll[0].labelSplits;
  check("B izleri: L1 42 + L2 28", near(sp.find((x) => x.labelId === L1)!.amountUsd, 42) && near(sp.find((x) => x.labelId === L2)!.amountUsd, 28));
  await recordPayment({ artistId: B, allocations: bAll[0].allocations, labelSplits: sp, paidCurrency: "USD", paidAmount: 70 });
  const bb1 = await cell(B, P1, L1), bb2 = await cell(B, P1, L2);
  check("B karışık (etiketsiz+etiketli) sonrası iki label da tam", near(bb1.paid, 60) && near(bb2.paid, 40), `${bb1.paid} / ${bb2.paid}`);

  console.log(`\n${pass} geçti, ${fail} kaldı`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
