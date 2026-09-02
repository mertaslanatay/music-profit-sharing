/**
 * YETKİLENDİRME TESTİ — bu dosyanın geçmesi, kimsenin görmemesi gereken
 * rakamı göremediğinin kanıtıdır.
 *
 * Kanıtlanan şeyler:
 *   1. Bir label yöneticisi diğer label'ın hiçbir rakamını göremez.
 *   2. Bir sanatçı diğer sanatçının hiçbir rakamını göremez.
 *   3. Onay bekleyen / askıya alınmış kullanıcı hiçbir şey göremez.
 *   4. Kısıtlı kullanıcının gördüğü toplamlar, kendi payının tam toplamıdır
 *      (eksik de değil fazla da değil) — yani süzme veriyi bozmuyor.
 *   5. Kesinti, kısıtlı kullanıcıya kendi payı oranında yansır.
 *   6. Rapor geneli ham satır sayısı ve satış sınıfı dağılımı sızmaz.
 *   7. Yetki kaldırıldığında kullanıcı anında kapanır (fail-closed).
 *
 *   npx tsx scripts/verify-access.mts <xlsx-yolu>
 */
import * as fs from "node:fs";
import * as XLSX from "@e965/xlsx";
import { readWorkbook, toRows } from "../src/lib/parse";
import { ingestReport } from "../src/lib/ingest";
import { loadResult, listPeriods } from "../src/lib/queries";
import { scopeFor, accessSql, canAccessArtist, canExport, isAdmin, type Viewer } from "../src/lib/access";
import { pool, transaction, query, queryOne, n } from "../src/lib/db";
import { DEFAULT_CONFIG } from "../src/lib/types";

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  " + detail : ""}`); }
};
const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;

const path = process.argv[2];
if (!path) { console.error("kullanım: npx tsx scripts/verify-access.mts <xlsx>"); process.exit(1); }
const buf = fs.readFileSync(path);
const parsed = readWorkbook(XLSX.read(buf, { type: "buffer" }), path);
const rows = toRows(parsed, parsed.map);

await query(`truncate credits, report_rows, report_periods, reports,
             songs, artists, labels, periods restart identity cascade`);
await query(`truncate user_artist_access, user_label_access, artist_user_link,
             audit_log, users restart identity cascade`);
await query(`truncate rate_limits`);

const DEDUCTION = 27.75;
const ing = await transaction((c) =>
  ingestReport(c, {
    title: "Yetki testi", fileName: "test.xlsx",
    deduction: DEDUCTION, rows, cfg: DEFAULT_CONFIG,
  })
);
await query(`update reports set status='published', published_at=now() where id=$1`, [ing.reportId]);

/* ------------------------------------------------------------ zemin gerçek */

const labels = await query<{ id: string; name: string; gross: number }>(
  `select l.id, l.name, sum(c.gross)::float8 gross
   from labels l join credits c on c.label_id = l.id
   group by l.id, l.name order by gross desc`
);
const artistsAll = await query<{ id: string; name: string; gross: number }>(
  `select a.id, a.display_name name, sum(c.gross)::float8 gross
   from artists a join credits c on c.artist_id = a.id
   group by a.id, a.display_name order by gross desc`
);
console.log(`\nVeri: ${labels.length} label, ${artistsAll.length} sanatçı, brüt ${ing.gross.toFixed(2)}`);
if (labels.length < 2) { console.error("Test için en az 2 label gerekli."); process.exit(1); }

const L1 = labels[0], L2 = labels[1];
const A1 = artistsAll[0];

/** Gerçek kesişim toplamı — doğrudan SQL'den, süzmeden bağımsız. */
const trueSum = async (labelIds: string[] | null, artistIds: string[] | null) => {
  const c: string[] = [], p: unknown[] = [];
  if (labelIds) { p.push(labelIds); c.push(`c.label_id = any($${p.length}::uuid[])`); }
  if (artistIds) { p.push(artistIds); c.push(`c.artist_id = any($${p.length}::uuid[])`); }
  const r = await queryOne<{ g: number; a: number; s: number }>(
    `select coalesce(sum(c.gross),0)::float8 g,
            count(distinct c.artist_id)::int a, count(distinct c.song_id)::int s
     from credits c join reports r on r.id = c.report_id
     where r.status in ('published','locked') ${c.length ? "and " + c.join(" and ") : ""}`, p);
  return { gross: n(r?.g), artists: r?.a ?? 0, songs: r?.s ?? 0 };
};

/* ------------------------------------------------------- kullanıcı kurulumu */

const mkUser = async (
  email: string, role: Viewer["role"], status: Viewer["status"],
  opts: { labels?: string[]; artists?: string[]; otherArtists?: boolean } = {}
): Promise<Viewer> => {
  const u = await queryOne<{ id: string }>(
    `insert into users (email, first_name, last_name, role, status, can_see_other_artists)
     values ($1,$2,'Test',$3::app_role,$4::user_status,$5) returning id`,
    [email, email.split("@")[0], role, status, opts.otherArtists ?? false]
  );
  const id = u!.id;
  for (const l of opts.labels ?? [])
    await query(`insert into user_label_access (user_id, label_id) values ($1,$2)`, [id, l]);
  for (const a of opts.artists ?? [])
    await query(`insert into user_artist_access (user_id, artist_id) values ($1,$2)`, [id, a]);
  return {
    userId: id, email, fullName: email, role, status,
    labelIds: opts.labels ?? [], artistIds: opts.artists ?? [],
    canSeeLabelTotals: false, canSeeOtherArtists: opts.otherArtists ?? false,
  };
};

const admin    = await mkUser("admin@m4nm.net", "admin", "active");
const mgr1     = await mkUser("mgr1@m4nm.net", "label_manager", "active", { labels: [L1.id] });
const mgr2     = await mkUser("mgr2@m4nm.net", "label_manager", "active", { labels: [L2.id] });
const artist1  = await mkUser("a1@m4nm.net", "artist", "active", { artists: [A1.id] });
const pending  = await mkUser("bekleyen@m4nm.net", "artist", "pending", { artists: [A1.id] });
const suspend  = await mkUser("askida@m4nm.net", "label_manager", "suspended", { labels: [L1.id] });
const orphan   = await mkUser("bos@m4nm.net", "label_manager", "active"); // yetki atanmamış
const acct     = await mkUser("mali@m4nm.net", "accountant", "active", { labels: [L1.id] });

/* ============================== 1. KAPSAM HESABI ========================== */
console.log("\n=== 1. KAPSAM HESABI ===");
check("admin kısıtsız", scopeFor(admin).labelIds === null && scopeFor(admin).artistIds === null);
check("label yöneticisi yalnız kendi label'ı",
  JSON.stringify(scopeFor(mgr1).labelIds) === JSON.stringify([L1.id]) && scopeFor(mgr1).artistIds === null);
check("sanatçı yalnız kendisi",
  JSON.stringify(scopeFor(artist1).artistIds) === JSON.stringify([A1.id]));
check("onay bekleyen reddedilir", scopeFor(pending).denied);
check("askıya alınan reddedilir", scopeFor(suspend).denied);
check("yetkisiz yönetici reddedilir", scopeFor(orphan).denied);
check("oturumsuz reddedilir", scopeFor(null).denied);
check("muhasebeci label kapsamlı", JSON.stringify(scopeFor(acct).labelIds) === JSON.stringify([L1.id]));

console.log("\n=== 2. SQL SÜZMESİ ===");
const denySql = accessSql(scopeFor(pending), 0);
check("reddedilen kapsam 'false' üretir", denySql.conditions.join() === "false" && denySql.params.length === 0);
const mgrSql = accessSql(scopeFor(mgr1), 3);
check("parametre numarası kaydırılır", mgrSql.conditions[0].includes("$4"), mgrSql.conditions[0]);
check("admin koşul üretmez", accessSql(scopeFor(admin), 0).conditions.length === 0);
const bothSql = accessSql(scopeFor(artist1), 0);
check("sanatçıya sanatçı koşulu eklenir", bothSql.conditions.some((c) => c.includes("artist_id")));

/* ============================== 3. VERİ SIZINTISI ========================= */
console.log("\n=== 3. KISITLI KULLANICI NE GÖRÜYOR ===");

const rAdmin = await loadResult({ access: scopeFor(admin) });
const rMgr1  = await loadResult({ access: scopeFor(mgr1) });
const rMgr2  = await loadResult({ access: scopeFor(mgr2) });
const rArt1  = await loadResult({ access: scopeFor(artist1) });
const rPend  = await loadResult({ access: scopeFor(pending) });
const rSusp  = await loadResult({ access: scopeFor(suspend) });
const rNone  = await loadResult({ access: scopeFor(null) });

const gL1 = await trueSum([L1.id], null);
const gL2 = await trueSum([L2.id], null);
const gA1 = await trueSum(null, [A1.id]);

check("admin tüm brütü görür", near(rAdmin.totals.gross, ing.gross, 1e-6),
  `${rAdmin.totals.gross.toFixed(2)} / ${ing.gross.toFixed(2)}`);
check(`${L1.name} yöneticisi tam olarak kendi brütünü görür`, near(rMgr1.totals.gross, gL1.gross, 1e-6),
  `${rMgr1.totals.gross.toFixed(2)} / ${gL1.gross.toFixed(2)}`);
check(`${L2.name} yöneticisi tam olarak kendi brütünü görür`, near(rMgr2.totals.gross, gL2.gross, 1e-6),
  `${rMgr2.totals.gross.toFixed(2)} / ${gL2.gross.toFixed(2)}`);
check("iki label toplamı ≤ genel toplam", gL1.gross + gL2.gross <= ing.gross + 1e-6);
check("label yöneticileri farklı rakam görür", !near(rMgr1.totals.gross, rMgr2.totals.gross, 1e-6));

check("mgr1 çıktısında yalnızca kendi label'ı var",
  rMgr1.labels.length === 1 && rMgr1.labels[0].label === L1.name,
  rMgr1.labels.map((l) => l.label).join(", "));
check("mgr2 çıktısında yalnızca kendi label'ı var",
  rMgr2.labels.length === 1 && rMgr2.labels[0].label === L2.name);
check("mgr1 sanatçılarında diğer label'ın kırılımı yok",
  rMgr1.artists.every((a) => Object.keys(a.labelBreakdown).every((k) => k === L1.name)));
check("mgr1 sanatçılarında label sözlüğü de temiz",
  rMgr1.artists.every((a) => Object.keys(a.labels).every((k) => k === L1.name)));

const mgr1Names = new Set(rMgr1.artists.map((a) => a.name));
const mgr2Names = new Set(rMgr2.artists.map((a) => a.name));
check("mgr1 sanatçı sayısı doğru", rMgr1.artists.length === gL1.artists,
  `${rMgr1.artists.length} / ${gL1.artists}`);
check("mgr2 sanatçı sayısı doğru", rMgr2.artists.length === gL2.artists);
check("mgr1 şarkı sayısı doğru", rMgr1.songs.length === gL1.songs,
  `${rMgr1.songs.length} / ${gL1.songs}`);

check("sanatçı yalnız kendini görür",
  rArt1.artists.length === 1 && rArt1.artists[0].name === A1.name,
  rArt1.artists.map((a) => a.name).join(", "));
check("sanatçının brütü kendi payına eşit", near(rArt1.totals.gross, gA1.gross, 1e-6),
  `${rArt1.totals.gross.toFixed(2)} / ${gA1.gross.toFixed(2)}`);
check("sanatçı diğer sanatçının şarkısını görmez",
  rArt1.songs.every((s) => s.artists.includes(A1.name) || s.artistString.includes(A1.name)));
check("sanatçı genel toplamı göremez", rArt1.totals.gross < ing.gross);

check("onay bekleyen hiçbir şey görmez",
  rPend.artists.length === 0 && rPend.songs.length === 0 &&
  rPend.labels.length === 0 && rPend.totals.gross === 0);
check("askıya alınan hiçbir şey görmez",
  rSusp.artists.length === 0 && rSusp.totals.gross === 0);
check("oturumsuz hiçbir şey görmez",
  rNone.artists.length === 0 && rNone.totals.gross === 0);
check("reddedilen kullanıcıya kesinti de sızmaz",
  rPend.totals.deduction === 0 && rPend.totals.received === 0);

/* ============================== 4. KESİNTİ ============================== */
console.log("\n=== 4. KESİNTİ PAYLAŞIMI ===");
const expL1Ded = DEDUCTION * (gL1.gross / ing.gross);
check("kesinti label payına göre dağıtılır", near(rMgr1.totals.deduction, expL1Ded, 1e-6),
  `${rMgr1.totals.deduction.toFixed(4)} / ${expL1Ded.toFixed(4)}`);
check("kısıtlı net oranı genel oranla aynı",
  near(rMgr1.totals.netRate, rAdmin.totals.netRate, 1e-9),
  `${rMgr1.totals.netRate.toFixed(9)} / ${rAdmin.totals.netRate.toFixed(9)}`);
const mgr1NetSum = rMgr1.artists.reduce((s, a) => s + a.net, 0);
check("mgr1 sanatçı netleri kendi yatanına toplanır",
  Math.abs(mgr1NetSum - rMgr1.totals.received) < 0.005,
  `${mgr1NetSum.toFixed(4)} / ${rMgr1.totals.received.toFixed(4)}`);

/* ========================= 5. HAM RAPOR VERİSİ ========================== */
console.log("\n=== 5. HAM RAPOR VERİSİ SIZMIYOR ===");
check("admin satış sınıflarını görür", Object.keys(rAdmin.salesClasses).length > 0);
check("kısıtlı kullanıcı satış sınıfı görmez", Object.keys(rMgr1.salesClasses).length === 0);
check("kısıtlı satır sayısı rapor genelinden küçük",
  rMgr1.totals.rowCount > 0 && rMgr1.totals.rowCount !== rAdmin.totals.rowCount,
  `${rMgr1.totals.rowCount} / ${rAdmin.totals.rowCount}`);
check("reddedilen kullanıcı satır sayısı 0", rPend.totals.rowCount === 0);

/* ========================= 6. DÖNEM LİSTESİ ============================= */
console.log("\n=== 6. DÖNEM LİSTESİ ===");
const pAdmin = await listPeriods(true, scopeFor(admin));
const pMgr1  = await listPeriods(true, scopeFor(mgr1));
const pPend  = await listPeriods(true, scopeFor(pending));
check("admin dönemleri görür", pAdmin.length > 0);
check("kısıtlı dönem brütü genel brütten küçük",
  pMgr1.every((p) => {
    const g = pAdmin.find((x) => x.id === p.id);
    return !!g && p.gross <= g.gross + 1e-6;
  }));
check("kısıtlı dönem brütü toplamı kendi brütüne eşit",
  near(pMgr1.reduce((s, p) => s + p.gross, 0), gL1.gross, 1e-4),
  `${pMgr1.reduce((s, p) => s + p.gross, 0).toFixed(2)} / ${gL1.gross.toFixed(2)}`);
check("reddedilen kullanıcı dönem görmez", pPend.length === 0);

/* ========================= 7. EYLEM YETKİLERİ =========================== */
console.log("\n=== 7. EYLEM YETKİLERİ ===");
check("yalnız admin yönetim görür",
  isAdmin(admin) && !isAdmin(mgr1) && !isAdmin(artist1) && !isAdmin(acct));
check("askıya alınan admin bile olsa giremez",
  !isAdmin({ ...admin, status: "suspended" }));
check("sanatçı dışa aktaramaz", !canExport(artist1) && canExport(mgr1) && canExport(admin));
check("bekleyen dışa aktaramaz", !canExport(pending));
check("sanatçı yalnız kendi kaydına erişir",
  canAccessArtist(artist1, A1.id) &&
  !canAccessArtist(artist1, artistsAll.find((a) => a.id !== A1.id)!.id));
check("admin her sanatçıya erişir", canAccessArtist(admin, artistsAll[artistsAll.length - 1].id));
check("bekleyen hiçbir sanatçıya erişemez", !canAccessArtist(pending, A1.id));

/* ==================== 8. YETKİ KALDIRMA ANINDA ETKİLİ =================== */
console.log("\n=== 8. YETKİ KALDIRMA ===");
await query(`delete from user_label_access where user_id = $1`, [mgr1.userId]);
const { viewerById } = await import("../src/lib/access");
const mgr1After = await viewerById(mgr1.userId);
check("yetki silinince kapsam boşalır", mgr1After !== null && mgr1After.labelIds.length === 0);
check("yetkisiz yönetici reddedilir", scopeFor(mgr1After).denied);
const rAfter = await loadResult({ access: scopeFor(mgr1After) });
check("yetki silindikten sonra veri görmez", rAfter.totals.gross === 0 && rAfter.artists.length === 0);

await query(`update users set status='suspended' where id=$1`, [artist1.userId]);
const art1After = await viewerById(artist1.userId);
check("askıya alınınca anında kapanır", scopeFor(art1After).denied);

/* ========================= 9. DENETİM KAYDI ============================= */
console.log("\n=== 9. DENETİM KAYDI ===");
const { audit, rateLimit } = await import("../src/lib/access");
await audit({ userId: admin.userId, action: "view_payouts", resource: `label:${L1.name}`, ip: "1.2.3.4" });
await audit({ userId: null, action: "login_failed", resource: "yok@m4nm.net" });
const logs = await query<{ action: string; user_id: string | null }>(
  `select action, user_id from audit_log order by created_at desc`);
check("denetim kaydı yazıldı", logs.length === 2, logs.map((l) => l.action).join(", "));
check("oturumsuz eylem de kaydedilir", logs.some((l) => l.user_id === null));

const rl1 = await rateLimit("test:1.2.3.4", 3, 900);
const rl2 = await rateLimit("test:1.2.3.4", 3, 900);
const rl3 = await rateLimit("test:1.2.3.4", 3, 900);
const rl4 = await rateLimit("test:1.2.3.4", 3, 900);
check("hız sınırı ilk üçe izin verir", rl1.ok && rl2.ok && rl3.ok);
check("hız sınırı dördüncüyü engeller", !rl4.ok);
check("kalan sayaç doğru", rl1.remaining === 2 && rl3.remaining === 0);

/* ================= 10. HER ROTA BİR KAPIDAN GEÇİYOR MU ================== */
// Bu, kod okumaya dayalı bir kontroldür: yeni bir uç nokta eklenip yetki
// denetimi unutulursa test kırılır. Asıl koruma çalışma zamanındadır ama
// unutmayı yakalayacak bir şey gerekiyor.
console.log("\n=== 10. ROTA KAPI DENETİMİ ===");
const routeFiles: string[] = [];
const walk = (dir: string) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p);
    else if (e.name === "route.ts") routeFiles.push(p);
  }
};
walk("src/app/api");
const GUARDS = ["requireAdmin", "requireViewer", "requireArtistAccess"];
// /api/auth/* zaten oturumsuz çalışmak zorunda; kendi hız sınırı ve
// denetim kaydı var, ayrı ayrı doğrulandı.
const openByDesign = (p: string) => p.startsWith("src/app/api/auth/");
for (const f of routeFiles) {
  const src = fs.readFileSync(f, "utf8");
  const short = f.replace("src/app/api/", "");
  if (openByDesign(f)) {
    check(`${short} — bilerek açık, hız sınırı var`,
      src.includes("rateLimit") || f.endsWith("logout/route.ts"));
  } else {
    check(`${short} — yetki kapısı var`, GUARDS.some((g) => src.includes(g + "(")));
    check(`${short} — denetim kaydı var`, src.includes("logAction("));
  }
}

/* ------------------------------------------------------------------ sonuç */
console.log(`\n${"=".repeat(52)}`);
console.log(`  ${pass} PASS   ${fail} FAIL`);
console.log("=".repeat(52));
await pool().end();
process.exit(fail === 0 ? 0 : 1);
