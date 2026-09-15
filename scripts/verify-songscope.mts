/**
 * faz-r — "Gelir devri kapsamı" açıkken 🔀 simgesinin hangi şarkılarda
 * çıkacağını belirleyen sorgu, gerçek Postgres'e karşı doğrulanır.
 *
 *   DATABASE_URL=postgresql://postgres@localhost:5432/fazr_test npm run verify:songscope
 *
 * Neden ayrı bir test: bu sorgu iki şeyi aynı anda doğru yapmak zorunda.
 *   1. ÜYELİK — şarkının SEÇİLİ ödeme partisinde kredisi var mı? (yanlışsa
 *      kullanıcı yine boşa tıklar, yani düzeltme hiç işe yaramamış olur)
 *   2. YETKİ  — kullanıcının görmeye yetkili olmadığı bir şarkının kimliği
 *      istemciye SIZMAMALI. Simge listesi masum görünür ama "şu şarkı şu
 *      partide var" bilgisini ele verir.
 */
import { query } from "../src/lib/db";
import { accessSql, type AccessScope } from "../src/lib/access";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? "  " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  " + detail : ""}`); }
};

/** Uç noktadaki (api/reports/[id]/songs) sorgunun BİREBİR aynısı. */
async function songIdsForReport(reportId: string, scope: AccessScope | null): Promise<Set<string>> {
  const params: unknown[] = [reportId];
  const conditions = ["c.report_id = $1", "c.song_id is not null"];
  if (scope) {
    const a = accessSql(scope, params.length, "c");
    conditions.push(...a.conditions);
    params.push(...a.params);
  }
  const rows = await query<{ song_id: string }>(
    `select distinct c.song_id from credits c where ${conditions.join(" and ")}`,
    params
  );
  return new Set(rows.map((r) => r.song_id));
}

const ids: Record<string, string> = {};
const uuid = (k: string) => (ids[k] ??= crypto.randomUUID());

async function seed() {
  await query(`truncate credits, songs, artists, labels, reports, periods cascade`);

  await query(`insert into labels (id, name, slug) values ($1,'Label Bir','l1'), ($2,'Label İki','l2')`,
    [uuid("L1"), uuid("L2")]);

  for (const [k, name] of [["A1", "Ağaçkakan"], ["A2", "Oldeaf"], ["A3", "Başka Sanatçı"]] as const) {
    await query(`insert into artists (id, fold_key, display_name) values ($1,$2,$3)`,
      [uuid(k), name.toLowerCase(), name]);
  }

  for (const [k, title] of [["S1", "Bataklık"], ["S2", "Diğer Şarkı"], ["S3", "Sonraki Parti"]] as const) {
    await query(`insert into songs (id, song_key, title, artist_string) values ($1,$2,$3,'x')`,
      [uuid(k), title.toLowerCase(), title]);
  }

  for (const [k, title] of [["R1", "Mart Partisi"], ["R2", "Nisan Partisi"]] as const) {
    await query(
      `insert into reports (id, title, file_name, file_hash, gross, deduction, received, row_count, status)
       values ($1,$2,$2,$2,1000,0,1000,1,'published')`,
      [uuid(k), title]
    );
  }

  await query(`insert into periods (id, label, sort, year, month) values ($1,'2026-03',202603,2026,3), ($2,'2026-04',202604,2026,4)`,
    [uuid("P1"), uuid("P2")]);

  // S1 → R1, A1/L1   |   S2 → R1, A3/L2   |   S3 → R2, A1/L1
  const kredi = async (song: string, report: string, period: string, artist: string, label: string) =>
    query(
      `insert into credits (report_id, period_id, artist_id, song_id, label_id, share, position,
                            total_artists, gross, quantity, territory, retailer)
       values ($1,$2,$3,$4,$5,1,0,1,500,100,'TR','spotify')`,
      [uuid(report), uuid(period), uuid(artist), uuid(song), uuid(label)]
    );

  await kredi("S1", "R1", "P1", "A1", "L1");
  await kredi("S2", "R1", "P1", "A3", "L2");
  await kredi("S3", "R2", "P2", "A1", "L1");

  // Rapor↔dönem bağı: ekrandaki parti etiketi ("Gelir devri kapsamı" şeridi)
  // bu tablodan geliyor. Testin sorgusu için şart değil ama eksik bırakılırsa
  // arayüz doğrulamasında parti adı "—" görünür ve yanıltır.
  await query(
    `insert into report_periods (report_id, period_id, gross, row_count)
     values ($1,$2,500,1), ($3,$4,500,1)`,
    [uuid("R1"), uuid("P1"), uuid("R2"), uuid("P2")]
  );
}

const eq = (got: Set<string>, want: string[]) =>
  got.size === want.length && want.every((k) => got.has(uuid(k)));

const adminScope: AccessScope = { labelIds: null, artistIds: null, denied: false };
const artistA1: AccessScope = { labelIds: [uuid("L1")], artistIds: [uuid("A1")], denied: false };
const labelL2: AccessScope = { labelIds: [uuid("L2")], artistIds: null, denied: false };
const deniedScope: AccessScope = { labelIds: [], artistIds: [], denied: true };

async function main() {
  await seed();

  console.log("\n=== 1. ÜYELİK: yalnızca seçili partideki şarkılar ===");
  const r1admin = await songIdsForReport(uuid("R1"), adminScope);
  check("R1 tam olarak S1 ve S2 döndürüyor", eq(r1admin, ["S1", "S2"]), `(${r1admin.size} kayıt)`);
  check("BAŞKA partideki S3 R1'de GÖRÜNMÜYOR", !r1admin.has(uuid("S3")));

  const r2admin = await songIdsForReport(uuid("R2"), adminScope);
  check("R2 tam olarak S3 döndürüyor", eq(r2admin, ["S3"]));
  check("R1'in şarkıları R2'ye sızmıyor", !r2admin.has(uuid("S1")) && !r2admin.has(uuid("S2")));

  console.log("\n=== 2. YETKİ: görmemesi gereken kimlik sızmıyor ===");
  const r1artist = await songIdsForReport(uuid("R1"), artistA1);
  check("sanatçı A1 yalnızca kendi şarkısını görüyor", eq(r1artist, ["S1"]));
  check("başka sanatçının şarkı kimliği SIZMIYOR", !r1artist.has(uuid("S2")));

  const r1label = await songIdsForReport(uuid("R1"), labelL2);
  check("label yöneticisi (L2) yalnızca kendi label'ını görüyor", eq(r1label, ["S2"]));
  check("diğer label'ın şarkısı SIZMIYOR", !r1label.has(uuid("S1")));

  const r1denied = await songIdsForReport(uuid("R1"), deniedScope);
  check("kapsamı reddedilen kullanıcı HİÇBİR ŞEY görmüyor", r1denied.size === 0);

  console.log("\n=== 3. KENARLAR ===");
  const bos = await songIdsForReport(crypto.randomUUID(), adminScope);
  check("var olmayan parti boş liste döndürüyor (patlamıyor)", bos.size === 0);

  const a1r2 = await songIdsForReport(uuid("R2"), artistA1);
  check("sanatçı A1, R2'de kendi şarkısını görüyor", eq(a1r2, ["S3"]));

  console.log(`\n  ${pass} geçti, ${fail} kaldı\n`);
  process.exit(fail ? 1 : 0);
}

void main();
