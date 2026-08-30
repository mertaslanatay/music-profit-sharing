import { query, n } from "./db";
import { applyProRata } from "./calc";
import { periodDisplay } from "./period";
import type { ArtistAgg, ArtistLabelSlice, LabelAgg, Result, SongAgg, Tally } from "./types";

/**
 * Veritabanından ekranların beklediği `Result` yapısını kurar.
 *
 * Neden bu yol: v1'in tüm analiz ekranları ve 70 kontrollük doğrulama testi
 * `Result` üzerinden çalışıyor. Veri kaynağını değiştirip arayüzü aynen
 * korumak, her ekranı yeniden yazmaktan hem daha hızlı hem çok daha az riskli.
 */

export interface Scope {
  /** Belirli dönemler. Boş/verilmezse tüm zamanlar. */
  periodIds?: string[];
  /** Tek bir yükleme partisi. */
  reportId?: string;
  /** Yalnızca yayınlanmış raporlar (varsayılan true; admin false verebilir). */
  publishedOnly?: boolean;
}

interface Where {
  sql: string;
  params: unknown[];
}

function buildWhere(scope: Scope, alias = "c"): Where {
  const parts: string[] = [];
  const params: unknown[] = [];
  if (scope.periodIds?.length) {
    params.push(scope.periodIds);
    parts.push(`${alias}.period_id = any($${params.length}::uuid[])`);
  }
  if (scope.reportId) {
    params.push(scope.reportId);
    parts.push(`${alias}.report_id = $${params.length}::uuid`);
  }
  if (scope.publishedOnly !== false) {
    parts.push(`r.status in ('published','locked')`);
  }
  return { sql: parts.length ? `where ${parts.join(" and ")}` : "", params };
}

const tally = (rows: { k: string; v: number }[]): Tally => {
  const t: Tally = {};
  for (const r of rows) t[r.k || "—"] = n(r.v);
  return t;
};

/* ------------------------------------------------------------ dönem listesi */

export interface PeriodRow {
  id: string;
  label: string;
  display: string;
  sort: number;
  year: number;
  month: number | null;
  quarter: number | null;
  gross: number;
  artistCount: number;
}

export async function listPeriods(publishedOnly = true): Promise<PeriodRow[]> {
  const rows = await query<{
    id: string; label: string; sort: number; year: number;
    month: number | null; quarter: number | null; gross: number; artist_count: number;
  }>(
    `select p.id, p.label, p.sort, p.year, p.month, p.quarter,
            coalesce(sum(c.gross),0)::float8 gross,
            count(distinct c.artist_id)::int artist_count
     from periods p
     left join credits c on c.period_id = p.id
     left join reports r on r.id = c.report_id
     ${publishedOnly ? `and r.status in ('published','locked')` : ""}
     group by p.id, p.label, p.sort, p.year, p.month, p.quarter
     having coalesce(sum(c.gross),0) <> 0
     order by p.sort desc`
  );
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    display: periodDisplay({ year: r.year, month: r.month, quarter: r.quarter, label: r.label }),
    sort: r.sort,
    year: r.year,
    month: r.month,
    quarter: r.quarter,
    gross: n(r.gross),
    artistCount: r.artist_count,
  }));
}

/* ------------------------------------------------------------- rapor listesi */

export interface ReportRow {
  id: string;
  title: string;
  fileName: string;
  gross: number;
  deduction: number;
  received: number;
  rowCount: number;
  status: "draft" | "published" | "locked";
  createdAt: string;
  periods: string[];
}

export async function listReports(): Promise<ReportRow[]> {
  const rows = await query<{
    id: string; title: string; file_name: string; gross: number; deduction: number;
    received: number; row_count: number; status: ReportRow["status"];
    created_at: string; periods: string[] | null;
  }>(
    `select r.id, r.title, r.file_name, r.gross::float8, r.deduction::float8,
            r.received::float8, r.row_count, r.status, r.created_at,
            array_agg(p.label order by p.sort) filter (where p.label is not null) periods
     from reports r
     left join report_periods rp on rp.report_id = r.id
     left join periods p on p.id = rp.period_id
     group by r.id
     order by r.created_at desc`
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    fileName: r.file_name,
    gross: n(r.gross),
    deduction: n(r.deduction),
    received: n(r.received),
    rowCount: r.row_count,
    status: r.status,
    createdAt: r.created_at,
    periods: r.periods ?? [],
  }));
}

/* ------------------------------------------------------- ana Result kurulumu */

export async function loadResult(scope: Scope = {}): Promise<Result> {
  const w = buildWhere(scope);
  const J = `from credits c join reports r on r.id = c.report_id`;

  // --- kesinti tahsisi ---------------------------------------------------
  // Kesinti rapor bazında. Kapsam bir raporun bir kısmını içeriyorsa
  // (örn. iki dönemli bir rapordan tek dönem), kesinti de o oranda alınır.
  const dedRows = await query<{ deduction: number; report_gross: number; included: number }>(
    `select r.deduction::float8 deduction, r.gross::float8 report_gross,
            sum(c.gross)::float8 included
     ${J} ${w.sql}
     group by r.id, r.deduction, r.gross`,
    w.params
  );
  let deduction = 0;
  for (const d of dedRows) {
    const rg = n(d.report_gross);
    deduction += rg !== 0 ? n(d.deduction) * (n(d.included) / rg) : 0;
  }

  // --- genel toplamlar ---------------------------------------------------
  const totalsRow = await query<{
    gross: number; quantity: number; artists: number; songs: number;
    labels: number; territories: number; retailers: number; periods: number;
  }>(
    `select coalesce(sum(c.gross),0)::float8 gross,
            coalesce(sum(c.quantity),0)::float8 quantity,
            count(distinct c.artist_id)::int artists,
            count(distinct c.song_id)::int songs,
            count(distinct c.label_id)::int labels,
            count(distinct c.territory)::int territories,
            count(distinct c.retailer)::int retailers,
            count(distinct c.period_id)::int periods
     ${J} ${w.sql}`,
    w.params
  );
  const T = totalsRow[0];
  const gross = n(T?.gross);

  // Ham satır sayısı — credits değil, orijinal Excel satırı
  const rowCountRow = await query<{ c: number; neg: number }>(
    `select count(*)::int c, count(*) filter (where rr.net < 0)::int neg
     from report_rows rr join reports r on r.id = rr.report_id
     ${buildWhere(scope, "rr").sql}`,
    buildWhere(scope, "rr").params
  );

  // --- sanatçı ana toplamları --------------------------------------------
  const aRows = await query<{
    id: string; fold_key: string; display_name: string; spellings: string[];
    gross: number; quantity: number; credits: number; songs: number;
    solo: number; primary_g: number; feature: number;
  }>(
    `select a.id, a.fold_key, a.display_name, a.spellings,
            sum(c.gross)::float8 gross,
            sum(c.quantity)::float8 quantity,
            count(*)::int credits,
            count(distinct c.song_id)::int songs,
            sum(case when c.total_artists = 1 then c.gross else 0 end)::float8 solo,
            sum(case when c.total_artists > 1 and c.position = 0 then c.gross else 0 end)::float8 primary_g,
            sum(case when c.position > 0 then c.gross else 0 end)::float8 feature
     ${J} join artists a on a.id = c.artist_id
     ${w.sql}
     group by a.id, a.fold_key, a.display_name, a.spellings
     order by gross desc`,
    w.params
  );

  const byId = new Map<string, ArtistAgg>();
  const artists: ArtistAgg[] = aRows.map((r) => {
    const a: ArtistAgg = {
      key: r.fold_key,
      name: r.display_name,
      spellings: r.spellings ?? [],
      gross: n(r.gross),
      net: 0,
      deduction: 0,
      primaryGross: n(r.primary_g),
      featureGross: n(r.feature),
      soloGross: n(r.solo),
      quantity: n(r.quantity),
      rowCount: r.credits,
      songCount: r.songs,
      territories: {},
      retailers: {},
      labels: {},
      labelBreakdown: {},
      periods: {},
      collaborators: {},
      songs: [],
    };
    byId.set(r.id, a);
    return a;
  });

  // --- sanatçı kırılımları (tek sorguda hepsi) ---------------------------
  const dims: [string, keyof Pick<ArtistAgg, "territories" | "retailers" | "labels" | "periods">][] = [
    ["c.territory", "territories"],
    ["c.retailer", "retailers"],
    ["l.name", "labels"],
    ["p.label", "periods"],
  ];
  for (const [expr, field] of dims) {
    const join =
      field === "labels" ? "join labels l on l.id = c.label_id"
      : field === "periods" ? "join periods p on p.id = c.period_id"
      : "";
    const rows = await query<{ aid: string; k: string; v: number }>(
      `select c.artist_id aid, ${expr} k, sum(c.gross)::float8 v
       ${J} ${join} ${w.sql}
       group by c.artist_id, ${expr}`,
      w.params
    );
    for (const r of rows) {
      const a = byId.get(r.aid);
      if (a) a[field][r.k || "—"] = n(r.v);
    }
  }

  // --- sanatçı × label dilimi (ödeme listesi label filtresi) -------------
  const alRows = await query<{
    aid: string; label_name: string; gross: number; quantity: number;
    songs: number; solo: number; primary_g: number; feature: number;
  }>(
    `select c.artist_id aid, l.name label_name,
            sum(c.gross)::float8 gross, sum(c.quantity)::float8 quantity,
            count(distinct c.song_id)::int songs,
            sum(case when c.total_artists = 1 then c.gross else 0 end)::float8 solo,
            sum(case when c.total_artists > 1 and c.position = 0 then c.gross else 0 end)::float8 primary_g,
            sum(case when c.position > 0 then c.gross else 0 end)::float8 feature
     ${J} join labels l on l.id = c.label_id ${w.sql}
     group by c.artist_id, l.name`,
    w.params
  );
  for (const r of alRows) {
    const a = byId.get(r.aid);
    if (!a) continue;
    const slice: ArtistLabelSlice = {
      gross: n(r.gross),
      quantity: n(r.quantity),
      songCount: r.songs,
      soloGross: n(r.solo),
      primaryGross: n(r.primary_g),
      featureGross: n(r.feature),
      territories: {},
      retailers: {},
    };
    a.labelBreakdown[r.label_name] = slice;
  }

  // Label filtresi açıkken tabloda gösterilen "ana ülke / platform" için
  // sanatçı × label başına yalnızca en büyüğü çekiyoruz — tam kırılım
  // 65 bin satır olurdu, gereksiz.
  for (const [expr, field] of [["territory", "territories"], ["retailer", "retailers"]] as const) {
    const rows = await query<{ aid: string; label_name: string; k: string; v: number }>(
      `select distinct on (c.artist_id, l.name)
              c.artist_id aid, l.name label_name, c.${expr} k, sum(c.gross)::float8 v
       ${J} join labels l on l.id = c.label_id ${w.sql}
       group by c.artist_id, l.name, c.${expr}
       order by c.artist_id, l.name, sum(c.gross) desc`,
      w.params
    );
    for (const r of rows) {
      const slice = byId.get(r.aid)?.labelBreakdown[r.label_name];
      if (slice) slice[field][r.k || "—"] = n(r.v);
    }
  }

  // --- sanatçı × şarkı (detay paneli) ------------------------------------
  const asRows = await query<{
    aid: string; song_key: string; title: string; album: string; artist_string: string;
    label_name: string; share: number; position: number; total_artists: number;
    gross: number; quantity: number;
  }>(
    `select c.artist_id aid, s.song_key, s.title, s.album, s.artist_string,
            l.name label_name,
            max(c.share)::float8 share, min(c.position)::int position,
            max(c.total_artists)::int total_artists,
            sum(c.gross)::float8 gross, sum(c.quantity)::float8 quantity
     ${J} join songs s on s.id = c.song_id join labels l on l.id = c.label_id
     ${w.sql}
     group by c.artist_id, s.song_key, s.title, s.album, s.artist_string, l.name
     order by sum(c.gross) desc`,
    w.params
  );
  for (const r of asRows) {
    const a = byId.get(r.aid);
    if (!a) continue;
    a.songs.push({
      songKey: r.song_key,
      song: r.title,
      album: r.album,
      artistString: r.artist_string,
      label: r.label_name,
      share: n(r.share),
      position: r.position,
      totalArtists: r.total_artists,
      gross: n(r.gross),
      quantity: n(r.quantity),
    });
  }

  // --- birlikte çalışılan sanatçılar (ortak şarkılar üzerinden) ----------
  const coRows = await query<{ aid: string; other: string; v: number }>(
    `select c.artist_id aid, a2.display_name other, sum(c.gross)::float8 v
     ${J}
     join credits c2 on c2.song_id = c.song_id and c2.report_id = c.report_id
                    and c2.artist_id <> c.artist_id
     join artists a2 on a2.id = c2.artist_id
     ${w.sql}
     group by c.artist_id, a2.display_name`,
    w.params
  );
  for (const r of coRows) {
    const a = byId.get(r.aid);
    if (a) a.collaborators[r.other] = n(r.v);
  }

  // --- pro-rata kesinti ---------------------------------------------------
  const received = gross - deduction;
  const netRate = gross !== 0 ? received / gross : 1;
  applyProRata(artists, netRate, received);

  // --- şarkılar -----------------------------------------------------------
  const sRows = await query<{
    song_key: string; title: string; album: string; isrc: string; artist_string: string;
    label_name: string; gross: number; quantity: number;
  }>(
    `select s.song_key, s.title, s.album, s.isrc, s.artist_string,
            (array_agg(l.name order by c.gross desc))[1] label_name,
            sum(c.gross)::float8 gross, sum(c.quantity)::float8 quantity
     ${J} join songs s on s.id = c.song_id join labels l on l.id = c.label_id
     ${w.sql}
     group by s.song_key, s.title, s.album, s.isrc, s.artist_string
     order by gross desc`,
    w.params
  );
  // şarkı × ülke / platform — yalnızca en büyüğü (tablo tek değer gösteriyor)
  const songTop = new Map<string, { t: Tally; r: Tally }>();
  for (const [expr, key] of [["territory", "t"], ["retailer", "r"]] as const) {
    const rows = await query<{ song_key: string; k: string; v: number }>(
      `select distinct on (s.song_key) s.song_key, c.${expr} k, sum(c.gross)::float8 v
       ${J} join songs s on s.id = c.song_id ${w.sql}
       group by s.song_key, c.${expr}
       order by s.song_key, sum(c.gross) desc`,
      w.params
    );
    for (const r of rows) {
      let e = songTop.get(r.song_key);
      if (!e) { e = { t: {}, r: {} }; songTop.set(r.song_key, e); }
      e[key][r.k || "—"] = n(r.v);
    }
  }
  const songs: SongAgg[] = sRows.map((r) => {
    const top = songTop.get(r.song_key);
    return {
      key: r.song_key,
      song: r.title,
      album: r.album,
      isrc: r.isrc,
      label: r.label_name,
      artistString: r.artist_string,
      primaryArtist: r.artist_string.split(/[,]/)[0]?.trim() ?? r.artist_string,
      artists: [],
      gross: n(r.gross),
      quantity: n(r.quantity),
      territories: top?.t ?? {},
      retailers: top?.r ?? {},
    };
  });
  // şarkı başına sanatçı sayısı
  const spa = await query<{ song_key: string; cnt: number; names: string[] }>(
    `select s.song_key, max(c.total_artists)::int cnt,
            array_agg(distinct a.display_name) names
     ${J} join songs s on s.id = c.song_id join artists a on a.id = c.artist_id
     ${w.sql} group by s.song_key`,
    w.params
  );
  const spaMap = new Map(spa.map((r) => [r.song_key, r]));
  for (const s of songs) {
    const e = spaMap.get(s.key);
    if (e) s.artists = e.names ?? [];
  }

  // --- label'lar ----------------------------------------------------------
  const lRows = await query<{
    label_name: string; gross: number; quantity: number;
    artists: number; songs: number;
  }>(
    `select l.name label_name, sum(c.gross)::float8 gross, sum(c.quantity)::float8 quantity,
            count(distinct c.artist_id)::int artists, count(distinct c.song_id)::int songs
     ${J} join labels l on l.id = c.label_id ${w.sql}
     group by l.name order by gross desc`,
    w.params
  );
  const topByLabel = new Map<string, { name: string; gross: number }[]>();
  for (const r of alRows) {
    const a = byId.get(r.aid);
    if (!a) continue;
    const arr = topByLabel.get(r.label_name) ?? [];
    arr.push({ name: a.name, gross: n(r.gross) });
    topByLabel.set(r.label_name, arr);
  }
  const labels: LabelAgg[] = lRows.map((r) => ({
    label: r.label_name,
    gross: n(r.gross),
    net: n(r.gross) * netRate,
    quantity: n(r.quantity),
    artistCount: r.artists,
    songCount: r.songs,
    topArtists: (topByLabel.get(r.label_name) ?? []).sort((a, b) => b.gross - a.gross),
  }));

  // --- global tallies ------------------------------------------------------
  const globalTally = async (expr: string, join = "") =>
    tally(
      await query<{ k: string; v: number }>(
        `select ${expr} k, sum(c.gross)::float8 v ${J} ${join} ${w.sql} group by ${expr}`,
        w.params
      )
    );
  const territories = await globalTally("c.territory");
  const retailers = await globalTally("c.retailer");
  const periods = await globalTally("p.label", "join periods p on p.id = c.period_id");

  const scRows = await query<{ k: string; v: number }>(
    `select rr.sales_class k, sum(rr.net)::float8 v
     from report_rows rr join reports r on r.id = rr.report_id
     ${buildWhere(scope, "rr").sql} group by rr.sales_class`,
    buildWhere(scope, "rr").params
  );

  return {
    artists,
    songs,
    labels,
    combos: [],            // kural ekranı için; admin tarafında ayrı yüklenir
    territories,
    retailers,
    periods,
    salesClasses: tally(scRows),
    aliasSuggestions: [],  // kural ekranı için; admin tarafında ayrı yüklenir
    totals: {
      gross,
      received,
      deduction,
      deductionRate: gross !== 0 ? deduction / gross : 0,
      netRate,
      quantity: n(T?.quantity),
      rowCount: rowCountRow[0]?.c ?? 0,
      artistCount: T?.artists ?? 0,
      songCount: T?.songs ?? 0,
      labelCount: T?.labels ?? 0,
      territoryCount: T?.territories ?? 0,
      retailerCount: T?.retailers ?? 0,
      negativeRows: rowCountRow[0]?.neg ?? 0,
    },
  };
}
