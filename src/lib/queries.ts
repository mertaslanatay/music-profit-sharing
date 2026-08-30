import { query, n } from "./db";
import { applyProRata } from "./calc";
import { periodDisplay } from "./period";
import { equalWeights, splitArtists } from "./artists";
import { DEFAULT_SPLIT } from "./types";
import type { ArtistAgg, ArtistLabelSlice, ComboAgg, EngineConfig, LabelAgg, Result, SongAgg, Tally } from "./types";

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
    // Durum filtresi ALT SORGUDA olmalı. LEFT JOIN'in ON koşuluna konursa
    // eşleşmeyen rapor satırı elenmez, yalnızca NULL'lanır — taslak raporun
    // credits satırları toplama dahil olurdu.
    `select p.id, p.label, p.sort, p.year, p.month, p.quarter,
            coalesce(sum(v.gross),0)::float8 gross,
            count(distinct v.artist_id)::int artist_count
     from periods p
     left join (
       select c.period_id, c.gross, c.artist_id
       from credits c join reports r on r.id = c.report_id
       ${publishedOnly ? `where r.status in ('published','locked')` : ""}
     ) v on v.period_id = p.id
     group by p.id, p.label, p.sort, p.year, p.month, p.quarter
     having coalesce(sum(v.gross),0) <> 0
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
  /** Excel'deki ham dönem etiketleri: ["P03 26(Mar 26)", "P04 26(Apr 26)"] */
  periods: string[];
  /** Kısa ham etiket: "P03 26 – P04 26" */
  periodRange: string;
  /** Okunur ad: "Mart – Nisan 2026" */
  periodDisplay: string;
}

export async function listReports(): Promise<ReportRow[]> {
  const rows = await query<{
    id: string; title: string; file_name: string; gross: number; deduction: number;
    received: number; row_count: number; status: ReportRow["status"];
    created_at: string; periods: string[] | null;
    meta: { year: number; month: number | null; quarter: number | null; label: string }[] | null;
  }>(
    `select r.id, r.title, r.file_name, r.gross::float8, r.deduction::float8,
            r.received::float8, r.row_count, r.status, r.created_at,
            array_agg(p.label order by p.sort) filter (where p.label is not null) periods,
            coalesce(
              json_agg(json_build_object('year', p.year, 'month', p.month,
                                         'quarter', p.quarter, 'label', p.label)
                       order by p.sort) filter (where p.id is not null),
              '[]'::json
            ) meta
     from reports r
     left join report_periods rp on rp.report_id = r.id
     left join periods p on p.id = rp.period_id
     group by r.id
     order by r.created_at desc`
  );
  return rows.map((r) => {
    const meta = (r.meta ?? []).filter(Boolean);
    return {
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
      periodRange: shortRange(r.periods ?? []),
      periodDisplay: friendlyRange(meta),
    };
  });
}

/** "P03 26(Mar 26)" → "P03 26";  birden fazlaysa "P03 26 – P04 26" */
function shortRange(labels: string[]): string {
  const trimmed = labels.map((l) => l.replace(/\s*\(.*\)\s*$/, "").trim()).filter(Boolean);
  if (trimmed.length === 0) return "—";
  if (trimmed.length === 1) return trimmed[0];
  return `${trimmed[0]} – ${trimmed[trimmed.length - 1]}`;
}

/** Aynı yıl içindeyse "Mart – Nisan 2026", değilse "Aralık 2025 – Ocak 2026" */
function friendlyRange(meta: { year: number; month: number | null; quarter: number | null; label: string }[]): string {
  if (meta.length === 0) return "";
  const sorted = [...meta].sort((a, b) => (a.year * 100 + (a.month ?? 0)) - (b.year * 100 + (b.month ?? 0)));
  const first = periodDisplay(sorted[0]);
  if (sorted.length === 1) return first;
  const last = periodDisplay(sorted[sorted.length - 1]);
  const fy = sorted[0].year;
  const ly = sorted[sorted.length - 1].year;
  if (fy === ly) return `${first.replace(` ${fy}`, "")} – ${last}`;
  return `${first} – ${last}`;
}

/* ------------------------------------------------------- ana Result kurulumu */

export async function loadResult(scope: Scope = {}): Promise<Result> {
  const w = buildWhere(scope);
  const F = `from credits c join reports r on r.id = c.report_id`;
  const wr = buildWhere(scope, "rr");

  // Tüm sorgular birbirinden bağımsız — paralel çalıştırıyoruz.
  // Sıralı çalıştırıldığında yerelde 1,7 sn sürüyordu; Supabase'e her sorgu
  // ~40 ms gidiş-dönüş eklediği için sıralı hâli kabul edilemezdi.
  const [
    dedRows, totalsRow, rowCountRow, aRows,
    dimTerr, dimRet, dimLabel, dimPeriod,
    alRows, alTopTerr, alTopRet,
    asRows, sRows, songTopTerr, songTopRet, spa,
    lRows, gTerr, gRet, gPeriod, scRows, comboRows, splitRow,
  ] = await Promise.all([
    // kesinti tahsisi — kapsam bir raporun bir kısmıysa kesinti de o oranda
    query<{ deduction: number; report_gross: number; included: number }>(
      `select r.deduction::float8 deduction, r.gross::float8 report_gross,
              sum(c.gross)::float8 included
       ${F} ${w.sql} group by r.id, r.deduction, r.gross`, w.params),

    query<{ gross: number; quantity: number; artists: number; songs: number;
            labels: number; territories: number; retailers: number }>(
      `select coalesce(sum(c.gross),0)::float8 gross,
              coalesce(sum(c.quantity),0)::float8 quantity,
              count(distinct c.artist_id)::int artists,
              count(distinct c.song_id)::int songs,
              count(distinct c.label_id)::int labels,
              count(distinct c.territory)::int territories,
              count(distinct c.retailer)::int retailers
       ${F} ${w.sql}`, w.params),

    query<{ c: number; neg: number }>(
      `select count(*)::int c, count(*) filter (where rr.net < 0)::int neg
       from report_rows rr join reports r on r.id = rr.report_id ${wr.sql}`, wr.params),

    query<{ id: string; fold_key: string; display_name: string; spellings: string[];
            gross: number; quantity: number; credits: number; songs: number;
            solo: number; primary_g: number; feature: number }>(
      `select a.id, a.fold_key, a.display_name, a.spellings,
              sum(c.gross)::float8 gross, sum(c.quantity)::float8 quantity,
              count(*)::int credits, count(distinct c.song_id)::int songs,
              sum(case when c.total_artists = 1 then c.gross else 0 end)::float8 solo,
              sum(case when c.total_artists > 1 and c.position = 0 then c.gross else 0 end)::float8 primary_g,
              sum(case when c.position > 0 then c.gross else 0 end)::float8 feature
       ${F} join artists a on a.id = c.artist_id ${w.sql}
       group by a.id, a.fold_key, a.display_name, a.spellings
       order by gross desc`, w.params),

    query<{ aid: string; k: string; v: number }>(
      `select c.artist_id aid, c.territory k, sum(c.gross)::float8 v
       ${F} ${w.sql} group by c.artist_id, c.territory`, w.params),
    query<{ aid: string; k: string; v: number }>(
      `select c.artist_id aid, c.retailer k, sum(c.gross)::float8 v
       ${F} ${w.sql} group by c.artist_id, c.retailer`, w.params),
    query<{ aid: string; k: string; v: number }>(
      `select c.artist_id aid, l.name k, sum(c.gross)::float8 v
       ${F} join labels l on l.id = c.label_id ${w.sql} group by c.artist_id, l.name`, w.params),
    query<{ aid: string; k: string; v: number }>(
      `select c.artist_id aid, p.label k, sum(c.gross)::float8 v
       ${F} join periods p on p.id = c.period_id ${w.sql} group by c.artist_id, p.label`, w.params),

    query<{ aid: string; label_name: string; gross: number; quantity: number;
            songs: number; solo: number; primary_g: number; feature: number }>(
      `select c.artist_id aid, l.name label_name,
              sum(c.gross)::float8 gross, sum(c.quantity)::float8 quantity,
              count(distinct c.song_id)::int songs,
              sum(case when c.total_artists = 1 then c.gross else 0 end)::float8 solo,
              sum(case when c.total_artists > 1 and c.position = 0 then c.gross else 0 end)::float8 primary_g,
              sum(case when c.position > 0 then c.gross else 0 end)::float8 feature
       ${F} join labels l on l.id = c.label_id ${w.sql}
       group by c.artist_id, l.name`, w.params),

    // Label filtresi açıkken gösterilen "ana ülke/platform" — tam kırılım
    // 65 bin satır olurdu, sadece en büyüğünü alıyoruz.
    query<{ aid: string; label_name: string; k: string; v: number }>(
      `select distinct on (c.artist_id, l.name)
              c.artist_id aid, l.name label_name, c.territory k, sum(c.gross)::float8 v
       ${F} join labels l on l.id = c.label_id ${w.sql}
       group by c.artist_id, l.name, c.territory
       order by c.artist_id, l.name, sum(c.gross) desc`, w.params),
    query<{ aid: string; label_name: string; k: string; v: number }>(
      `select distinct on (c.artist_id, l.name)
              c.artist_id aid, l.name label_name, c.retailer k, sum(c.gross)::float8 v
       ${F} join labels l on l.id = c.label_id ${w.sql}
       group by c.artist_id, l.name, c.retailer
       order by c.artist_id, l.name, sum(c.gross) desc`, w.params),

    query<{ aid: string; song_key: string; title: string; album: string; artist_string: string;
            label_name: string; share: number; position: number; total_artists: number;
            gross: number; quantity: number }>(
      `select c.artist_id aid, s.song_key, s.title, s.album, s.artist_string, l.name label_name,
              max(c.share)::float8 share, min(c.position)::int position,
              max(c.total_artists)::int total_artists,
              sum(c.gross)::float8 gross, sum(c.quantity)::float8 quantity
       ${F} join songs s on s.id = c.song_id join labels l on l.id = c.label_id ${w.sql}
       group by c.artist_id, s.song_key, s.title, s.album, s.artist_string, l.name
       order by sum(c.gross) desc`, w.params),

    query<{ song_key: string; title: string; album: string; isrc: string;
            artist_string: string; label_name: string; gross: number; quantity: number }>(
      `select s.song_key, s.title, s.album, s.isrc, s.artist_string,
              (array_agg(l.name order by c.gross desc))[1] label_name,
              sum(c.gross)::float8 gross, sum(c.quantity)::float8 quantity
       ${F} join songs s on s.id = c.song_id join labels l on l.id = c.label_id ${w.sql}
       group by s.song_key, s.title, s.album, s.isrc, s.artist_string
       order by gross desc`, w.params),

    query<{ song_key: string; k: string; v: number }>(
      `select distinct on (s.song_key) s.song_key, c.territory k, sum(c.gross)::float8 v
       ${F} join songs s on s.id = c.song_id ${w.sql}
       group by s.song_key, c.territory order by s.song_key, sum(c.gross) desc`, w.params),
    query<{ song_key: string; k: string; v: number }>(
      `select distinct on (s.song_key) s.song_key, c.retailer k, sum(c.gross)::float8 v
       ${F} join songs s on s.id = c.song_id ${w.sql}
       group by s.song_key, c.retailer order by s.song_key, sum(c.gross) desc`, w.params),

    query<{ song_key: string; names: string[] }>(
      `select s.song_key, array_agg(distinct a.display_name) names
       ${F} join songs s on s.id = c.song_id join artists a on a.id = c.artist_id ${w.sql}
       group by s.song_key`, w.params),

    query<{ label_name: string; gross: number; quantity: number; artists: number; songs: number }>(
      `select l.name label_name, sum(c.gross)::float8 gross, sum(c.quantity)::float8 quantity,
              count(distinct c.artist_id)::int artists, count(distinct c.song_id)::int songs
       ${F} join labels l on l.id = c.label_id ${w.sql}
       group by l.name order by gross desc`, w.params),

    query<{ k: string; v: number }>(
      `select c.territory k, sum(c.gross)::float8 v ${F} ${w.sql} group by c.territory`, w.params),
    query<{ k: string; v: number }>(
      `select c.retailer k, sum(c.gross)::float8 v ${F} ${w.sql} group by c.retailer`, w.params),
    query<{ k: string; v: number }>(
      `select p.label k, sum(c.gross)::float8 v ${F}
       join periods p on p.id = c.period_id ${w.sql} group by p.label`, w.params),

    query<{ k: string; v: number }>(
      `select rr.sales_class k, sum(rr.net)::float8 v
       from report_rows rr join reports r on r.id = rr.report_id ${wr.sql}
       group by rr.sales_class`, wr.params),

    // Bir şarkının tüm payları toplandığında satır gelirine eşittir (paylar 1'e tamamlanır).
    query<{ artist_string: string; n: number; gross: number; songs: number; rows: number }>(
      `select s.artist_string, max(c.total_artists)::int n, sum(c.gross)::float8 gross,
              count(distinct c.song_id)::int songs, count(*)::int rows
       ${F} join songs s on s.id = c.song_id
       ${w.sql}${w.sql ? " and" : "where"} c.total_artists > 1
       group by s.artist_string order by gross desc`, w.params),

    query<{ split: EngineConfig["split"] }>(
      `select split from engine_rules where is_active limit 1`),
  ]);

  const T = totalsRow[0];
  const gross = n(T?.gross);

  let deduction = 0;
  for (const d of dedRows) {
    const rg = n(d.report_gross);
    deduction += rg !== 0 ? n(d.deduction) * (n(d.included) / rg) : 0;
  }

  // --- sanatçıları kur -----------------------------------------------------
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

  const fill = (rows: { aid: string; k: string; v: number }[],
                field: "territories" | "retailers" | "labels" | "periods") => {
    for (const r of rows) {
      const a = byId.get(r.aid);
      if (a) a[field][r.k || "—"] = n(r.v);
    }
  };
  fill(dimTerr, "territories");
  fill(dimRet, "retailers");
  fill(dimLabel, "labels");
  fill(dimPeriod, "periods");

  for (const r of alRows) {
    const a = byId.get(r.aid);
    if (!a) continue;
    a.labelBreakdown[r.label_name] = {
      gross: n(r.gross), quantity: n(r.quantity), songCount: r.songs,
      soloGross: n(r.solo), primaryGross: n(r.primary_g), featureGross: n(r.feature),
      territories: {}, retailers: {},
    };
  }
  for (const [rows, field] of [[alTopTerr, "territories"], [alTopRet, "retailers"]] as const) {
    for (const r of rows) {
      const slice = byId.get(r.aid)?.labelBreakdown[r.label_name];
      if (slice) slice[field][r.k || "—"] = n(r.v);
    }
  }

  for (const r of asRows) {
    byId.get(r.aid)?.songs.push({
      songKey: r.song_key, song: r.title, album: r.album, artistString: r.artist_string,
      label: r.label_name, share: n(r.share), position: r.position,
      totalArtists: r.total_artists, gross: n(r.gross), quantity: n(r.quantity),
    });
  }

  // --- birlikte çalışılan sanatçılar ---------------------------------------
  // SQL'de credits'i kendisiyle birleştirmek 1,4 saniye sürüyordu (20 bin × 20 bin).
  // Aynı sonucu zaten çektiğimiz sanatçı×şarkı ve şarkı×sanatçı verisinden
  // bellekte kuruyoruz — ek sorgu yok, ölçülebilir maliyeti sıfır.
  const songArtists = new Map<string, string[]>();
  for (const r of spa) songArtists.set(r.song_key, r.names ?? []);
  for (const a of artists) {
    for (const sc of a.songs) {
      if (sc.totalArtists < 2) continue;
      for (const other of songArtists.get(sc.songKey) ?? []) {
        if (other === a.name) continue;
        a.collaborators[other] = (a.collaborators[other] ?? 0) + sc.gross;
      }
    }
  }

  // --- pro-rata kesinti ----------------------------------------------------
  const received = gross - deduction;
  const netRate = gross !== 0 ? received / gross : 1;
  applyProRata(artists, netRate, received);

  // --- şarkılar ------------------------------------------------------------
  const songTop = new Map<string, { t: Tally; r: Tally }>();
  const put = (rows: { song_key: string; k: string; v: number }[], key: "t" | "r") => {
    for (const r of rows) {
      let e = songTop.get(r.song_key);
      if (!e) { e = { t: {}, r: {} }; songTop.set(r.song_key, e); }
      e[key][r.k || "—"] = n(r.v);
    }
  };
  put(songTopTerr, "t");
  put(songTopRet, "r");

  const songs: SongAgg[] = sRows.map((r) => {
    const top = songTop.get(r.song_key);
    return {
      key: r.song_key, song: r.title, album: r.album, isrc: r.isrc,
      label: r.label_name, artistString: r.artist_string,
      primaryArtist: r.artist_string.split(",")[0]?.trim() ?? r.artist_string,
      artists: songArtists.get(r.song_key) ?? [],
      gross: n(r.gross), quantity: n(r.quantity),
      territories: top?.t ?? {}, retailers: top?.r ?? {},
    };
  });

  // --- label'lar -----------------------------------------------------------
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

  // --- ortak yapımlar ------------------------------------------------------
  const activeSplit = { ...DEFAULT_SPLIT, ...(splitRow[0]?.split ?? {}) };
  const combos: ComboAgg[] = comboRows.map((r) => {
    const parts = splitArtists(r.artist_string, activeSplit);
    return {
      artistString: r.artist_string,
      parts,
      gross: n(r.gross),
      rowCount: r.rows,
      songCount: r.songs,
      weights: equalWeights(parts.length),
      isOverridden: false,
    };
  });

  return {
    artists,
    songs,
    labels,
    combos,
    territories: tally(gTerr),
    retailers: tally(gRet),
    periods: tally(gPeriod),
    salesClasses: tally(scRows),
    aliasSuggestions: [],
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
