/**
 * faz-z15 — label yöneticisi yönetim paneli: kapsam kuralları, gerçek
 * Postgres'e karşı.
 *
 *   DATABASE_URL=... npm run verify:labelmgr
 *
 * Senaryo: iki label (LA = "kendi", LB = "başka"). Sanatçılar: X yalnızca LA,
 * Y yalnızca LB, Z ikisinde (Çiğ gibi). Label yöneticisi M yalnızca LA'ya
 * atanmış.
 *
 * KURALLAR
 *  1. Kapsam: LA sanatçıları X ve Z; LB'nin yalnız sanatçısı Y hiçbir yerde yok.
 *  2. Ödemeler: Z'nin rakamları yalnızca LA payı; kırılımda LB hücresi yok.
 *  3. Kullanıcılar: LA kullanıcıları + atanmamış bekleyenler; LB kullanıcısı
 *     ve yönetici yok; kapsamdaki kullanıcının LB ataması gönderilmez.
 *  4. Düzenleme sınırları (limitUserPatch): kendi hesabı, kapsam dışı,
 *     personel, askı, rol, başka label ataması, çok label'lı kullanıcıda
 *     görünürlük reddedilir; kendi label'ı eklenince LB ataması korunur;
 *     atamasız onay reddedilir, atamalı onay geçer.
 *  5. Mesajlar: M, LA kullanıcısının konuşmasına personel tarafından bakar,
 *     LB kullanıcısınınkine bakamaz.
 *  6. Duyurular: LA'ya hedefli duyuru LA kullanıcısına görünür, LB'ye görünmez;
 *     herkese açık duyuru herkese görünür.
 */
import { query } from "../src/lib/db";
import { filterBreakdown, getPaymentBreakdown, listBalancesForLabels } from "../src/lib/payments";
import { labelArtistIds, labelUserIds, limitUserPatch, loadUsersFor, staffSideFor } from "../src/lib/staff";
import { viewerById } from "../src/lib/access";
import { ANNOUNCEMENT_VISIBLE } from "../src/lib/schema";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  " + detail : ""}`); }
};
const near = (a: number, b: number) => Math.abs(a - b) < 0.0001;
const id = () => crypto.randomUUID();

const LA = id(), LB = id(), X = id(), Y = id(), Z = id(), S = id(), R = id(), P = id();
const M = id(), UX = id(), UY = id(), UZ = id(), UP = id(), ADM = id(), M2 = id();

async function seed() {
  const ek = LA.slice(0, 8);
  await query(`insert into labels (id,name,slug) values ($1,$3,$4),($2,$5,$6)`,
    [LA, LB, `LM Kendi ${ek}`, `lmk-${ek}`, `LM Baska ${ek}`, `lmb-${ek}`]);
  await query(`insert into artists (id,fold_key,display_name) values ($1,$4,'LM X'),($2,$5,'LM Y'),($3,$6,'LM Z')`,
    [X, Y, Z, `lmx-${ek}`, `lmy-${ek}`, `lmz-${ek}`]);
  await query(`insert into songs (id,song_key,title,artist_string) values ($1,$2,'LM Şarkı','x')`, [S, `lm-${ek}`]);
  await query(`insert into reports (id,title,file_name,file_hash,gross,deduction,received,row_count,status)
               values ($1::uuid,'LM',$1::text,$1::text,1000,0,1000,1,'published')`, [R]);
  await query(`insert into periods (id,label,sort,year,month) values ($1,$2,209501,2095,1)`, [P, `LM1 ${ek}`]);
  await query(`insert into report_periods (report_id, period_id) values ($1,$2)`, [R, P]);
  const k = (a: string, l: string, g: number) => query(
    `insert into credits (report_id,period_id,artist_id,song_id,label_id,share,position,total_artists,gross,quantity,territory,retailer)
     values ($1,$2,$3,$4,$5,1,0,1,$6,10,'TR','spotify')`, [R, P, a, S, l, g]);
  await k(X, LA, 100); await k(Y, LB, 70); await k(Z, LA, 40); await k(Z, LB, 60);

  const u = (uid: string, email: string, role: string, status: string) => query(
    `insert into users (id,email,first_name,last_name,role,status) values ($1,$2,'T',$3,$4,$5)`,
    [uid, `${email}-${ek}@test.local`, email, role, status]);
  await u(M, "m", "label_manager", "active");
  await u(M2, "m2", "label_manager", "active");
  await u(UX, "ux", "artist", "active");
  await u(UY, "uy", "artist", "active");
  await u(UZ, "uz", "artist", "active");
  await u(UP, "up", "artist", "pending");
  await u(ADM, "adm", "admin", "active");
  await query(`insert into user_label_access (user_id,label_id,role) values ($1,$2,'label_manager'),($3,$2,'label_manager')`, [M, LA, M2]);
  await query(`insert into user_artist_access (user_id,artist_id) values ($1,$2),($3,$4),($5,$6)`, [UX, X, UY, Y, UZ, Z]);
  await query(`insert into user_label_access (user_id,label_id,role) values ($1,$2,'artist')`, [UZ, LB]);
}

async function main() {
  await seed();

  // 1. kapsam
  const arts = new Set(await labelArtistIds([LA]));
  check("LA sanatçıları: X ve Z", arts.has(X) && arts.has(Z) && !arts.has(Y));

  // 2. ödemeler
  const bal = await listBalancesForLabels([LA]);
  const z = bal.find((b) => b.artistId === Z);
  check("Ödemeler: Y yok", !bal.some((b) => b.artistId === Y));
  check("Ödemeler: Z yalnız LA payı (40)", !!z && near(z.earned, 40), String(z?.earned));
  const bd = filterBreakdown(await getPaymentBreakdown(), [LA]);
  check("Kırılımda yalnız LA", bd.labels.length === 1 && bd.labels[0] === LA, bd.labels.join(","));
  check("Kırılımda Y kimliği bile yok", !bd.artists.includes(Y));

  // 3. kullanıcılar
  const scope = new Set(await labelUserIds([LA], { withUnassignedPending: true }));
  check("Kullanıcılar: UX, UZ, M, M2 ve atamasız bekleyen", [UX, UZ, M, M2, UP].every((x) => scope.has(x)));
  check("Kullanıcılar: UY ve yönetici yok", !scope.has(UY) && !scope.has(ADM));
  const noPending = new Set(await labelUserIds([LA]));
  check("Atamasız bekleyen yalnız bayrakla", !noPending.has(UP));
  const lu = await loadUsersFor([LA]);
  const uzRow = lu.users.find((x) => x.id === UZ);
  check("UZ'nin LB ataması gönderilmedi", !!uzRow && !uzRow.labelIds.includes(LB), JSON.stringify(uzRow?.labelIds));
  check("Label seçenekleri yalnız LA", lu.labels.length === 1 && lu.labels[0].id === LA);
  check("Sanatçı seçeneklerinde Y yok", !lu.artists.some((a) => a.id === Y));

  // 4. düzenleme sınırları
  const t = (uid: string, role = "artist", status = "active") => ({ id: uid, role, status });
  const err = (r: Awaited<ReturnType<typeof limitUserPatch>>) => ("error" in r ? r.status : 0);
  check("kendi hesabı → 403", err(await limitUserPatch([LA], M, t(M, "label_manager"), {})) === 403);
  check("kapsam dışı → 404", err(await limitUserPatch([LA], M, t(UY), { labelIds: [LA] })) === 404);
  check("personel → 403", err(await limitUserPatch([LA], M, t(M2, "label_manager"), { labelIds: [LA] })) === 403);
  check("askıya alma → 403", err(await limitUserPatch([LA], M, t(UX), { action: "suspend" })) === 403);
  check("rol değişikliği → 403", err(await limitUserPatch([LA], M, t(UX), { role: "admin" })) === 403);
  check("başka label ataması → 403", err(await limitUserPatch([LA], M, t(UX), { labelIds: [LB] })) === 403);
  check("başka label sanatçısı → 403", err(await limitUserPatch([LA], M, t(UX), { artistIds: [Y] })) === 403);
  const kor = await limitUserPatch([LA], M, t(UZ), { labelIds: [LA] });
  check("LA eklenince LB ataması korunur", !("error" in kor) && !!kor.body.labelIds?.includes(LB) && kor.body.labelIds.includes(LA),
    "error" in kor ? kor.error : JSON.stringify(kor.body.labelIds));
  const sil = await limitUserPatch([LA], M, t(UZ), { labelIds: [] });
  check("LA çıkarılınca LB kalır", !("error" in sil) && JSON.stringify(sil.body.labelIds) === JSON.stringify([LB]));
  check("çok label'lı kullanıcıda görünürlük → 403", err(await limitUserPatch([LA], M, t(UZ), { canSeeOtherArtists: true })) === 403);
  check("yalnız LA'lı kullanıcıda görünürlük geçer", err(await limitUserPatch([LA], M, t(UX), { canSeeLabelTotals: true })) === 0);
  check("atamasız onay → 400", err(await limitUserPatch([LA], M, t(UP, "artist", "pending"), { action: "approve" })) === 400);
  check("LA atamalı onay geçer", err(await limitUserPatch([LA], M, t(UP, "artist", "pending"), { action: "approve", artistIds: [X] })) === 0);
  check("aktif hesabı onaylama → 400", err(await limitUserPatch([LA], M, t(UX), { action: "approve" })) === 400);

  // 5. mesajlar
  const vm = await viewerById(M);
  check("M → UX konuşması: personel", !!vm && await staffSideFor(vm, UX));
  check("M → UY konuşması: değil", !!vm && !(await staffSideFor(vm, UY)));
  check("M → kendi konuşması: kullanıcı tarafı", !!vm && !(await staffSideFor(vm, M)));

  // 6. duyurular
  const AN = id(), AG = id();
  await query(`insert into announcements (id,title,body,published_at,label_ids) values ($1,'LA duyuru','x',now(),$2::uuid[]),($3,'genel','x',now(),'{}')`, [AN, [LA], AG]);
  const sees = async (uid: string, aid: string) =>
    (await query(`select 1 from announcements a where a.id = $2 and ${ANNOUNCEMENT_VISIBLE("$1")}`, [uid, aid])).length === 1;
  check("LA duyurusu UX'e görünür (sanatçı üzerinden)", await sees(UX, AN));
  check("LA duyurusu UZ'ye görünür", await sees(UZ, AN));
  check("LA duyurusu UY'ye görünmez", !(await sees(UY, AN)));
  check("genel duyuru UY'ye görünür", await sees(UY, AG));

  console.log(`\n${pass} geçti, ${fail} kaldı`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
