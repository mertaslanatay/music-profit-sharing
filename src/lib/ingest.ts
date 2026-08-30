import type { PoolClient } from "pg";
import { equalWeights, normalizeWeights, splitArtists } from "./artists";
import { foldKey, tidy } from "./normalize";
import { parsePeriod } from "./period";
import type { EngineConfig, RawRow } from "./types";

/**
 * Ham satırları veritabanına yazılabilir "credit" kayıtlarına düzleştirir.
 *
 * calc.ts'teki compute() ile AYNI bölüşüm mantığını kullanır — fark şu:
 * compute() sonucu ekran için toplarken, bu fonksiyon satır × sanatçı
 * granülerliğinde düz liste üretir. Böylece ülke/platform kırılımı da
 * sanatçı ve label bazında sorgulanabilir.
 *
 * Doğrulama: bu listenin sanatçı bazında toplamı compute() çıktısına
 * kuruşuna kadar eşit olmalıdır (scripts/verify-db.ts bunu test eder).
 */
export interface FlatCredit {
  rowIndex: number;
  periodLabel: string;
  artistFoldKey: string;
  artistRawName: string;
  songKey: string;
  labelName: string;
  share: number;
  position: number;
  totalArtists: number;
  gross: number;
  quantity: number;
  territory: string;
  retailer: string;
}

export interface FlattenResult {
  credits: FlatCredit[];
  /** foldKey -> en çok kazandıran yazım (görünen ad) */
  artistNames: Map<string, string>;
  /** foldKey -> görülen tüm yazımlar */
  artistSpellings: Map<string, Set<string>>;
  songs: Map<string, { title: string; album: string; isrc: string; artistString: string }>;
  labels: Set<string>;
  periods: Map<string, ReturnType<typeof parsePeriod>>;
  totals: { gross: number; quantity: number; rowCount: number; negativeRows: number };
}

export function flattenCredits(rows: RawRow[], cfg: EngineConfig): FlattenResult {
  const credits: FlatCredit[] = [];
  const artistGross = new Map<string, Map<string, number>>(); // foldKey -> yazım -> brüt
  const songs: FlattenResult["songs"] = new Map();
  const labels = new Set<string>();
  const periods: FlattenResult["periods"] = new Map();

  const comboCache = new Map<string, { parts: string[]; weights: number[] }>();
  const resolveCombo = (artistString: string) => {
    let c = comboCache.get(artistString);
    if (!c) {
      const parts = splitArtists(artistString, cfg.split);
      const ov = cfg.overrides[artistString];
      const weights =
        Array.isArray(ov) && ov.length > 0
          ? normalizeWeights(ov, parts.length)
          : equalWeights(parts.length);
      c = { parts, weights };
      comboCache.set(artistString, c);
    }
    return c;
  };

  const canonical = (raw: string): string => {
    let k = foldKey(raw);
    const seen = new Set<string>();
    while (cfg.aliases[k] && !seen.has(k)) {
      seen.add(k);
      k = cfg.aliases[k];
    }
    return k;
  };

  let gross = 0;
  let quantity = 0;
  let negativeRows = 0;

  rows.forEach((r, rowIndex) => {
    const net = Number(r.net) || 0;
    const qty = Number(r.quantity) || 0;
    if (net < 0) negativeRows++;
    gross += net;
    quantity += qty;

    const labelName = r.label || "—";
    labels.add(labelName);

    const periodLabel = r.period || "—";
    if (!periods.has(periodLabel)) periods.set(periodLabel, parsePeriod(periodLabel));

    // şarkı kimliği — calc.ts ile birebir aynı kural
    const songKey = r.isrc
      ? `isrc:${r.isrc.toUpperCase()}`
      : `t:${foldKey(r.artist)}|${foldKey(r.song || r.album)}`;
    if (!songs.has(songKey)) {
      songs.set(songKey, {
        title: tidy(r.song || r.album || "—"),
        album: tidy(r.album),
        isrc: r.isrc,
        artistString: r.artist,
      });
    }

    const combo = resolveCombo(r.artist);
    for (let i = 0; i < combo.parts.length; i++) {
      const rawName = combo.parts[i];
      const share = combo.weights[i] ?? 0;
      const key = canonical(rawName);
      if (!key) continue;

      const credit = net * share;
      credits.push({
        rowIndex,
        periodLabel,
        artistFoldKey: key,
        artistRawName: rawName,
        songKey,
        labelName,
        share,
        position: i,
        totalArtists: combo.parts.length,
        gross: credit,
        quantity: qty * share,
        territory: r.territory,
        retailer: r.retailer,
      });

      let spellMap = artistGross.get(key);
      if (!spellMap) {
        spellMap = new Map();
        artistGross.set(key, spellMap);
      }
      spellMap.set(rawName, (spellMap.get(rawName) ?? 0) + credit);
    }
  });

  // görünen ad = en çok kazandıran yazım
  const artistNames = new Map<string, string>();
  const artistSpellings = new Map<string, Set<string>>();
  for (const [key, spellMap] of artistGross) {
    let best = "";
    let bestVal = -Infinity;
    const all = new Set<string>();
    for (const [sp, val] of spellMap) {
      all.add(sp);
      if (val > bestVal) {
        bestVal = val;
        best = sp;
      }
    }
    artistNames.set(key, best);
    artistSpellings.set(key, all);
  }

  return {
    credits,
    artistNames,
    artistSpellings,
    songs,
    labels,
    periods,
    totals: { gross, quantity, rowCount: rows.length, negativeRows },
  };
}

/* ------------------------------------------------------------------ yazma */

const slugify = (s: string): string =>
  foldKey(s).slice(0, 60) || "label";

/** Toplu insert: parametre sınırına takılmamak için parçalara böler. */
async function bulkInsert(
  c: PoolClient,
  table: string,
  columns: string[],
  rows: unknown[][],
  chunkSize = 500
): Promise<void> {
  if (rows.length === 0) return;
  const cols = columns.join(", ");
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const values: unknown[] = [];
    const tuples = chunk.map((row) => {
      const ph = row.map((v) => {
        values.push(v);
        return `$${values.length}`;
      });
      return `(${ph.join(",")})`;
    });
    await c.query(`insert into ${table} (${cols}) values ${tuples.join(",")}`, values);
  }
}

export interface IngestInput {
  title: string;
  fileName: string;
  fileHash?: string | null;
  storagePath?: string | null;
  /** SWIFT / banka kesintisi (pozitif tutar) */
  deduction: number;
  rows: RawRow[];
  cfg: EngineConfig;
  uploadedBy?: string | null;
  notes?: string | null;
}

export interface IngestResult {
  reportId: string;
  gross: number;
  received: number;
  deduction: number;
  rowCount: number;
  creditCount: number;
  artistCount: number;
  songCount: number;
  labelCount: number;
  periods: { label: string; year: number; month: number | null; gross: number }[];
}

/**
 * Bir raporu tek transaction içinde veritabanına yazar.
 * Hata olursa hiçbir şey kalmaz — yarım yüklenmiş rapor oluşmaz.
 */
export async function ingestReport(c: PoolClient, input: IngestInput): Promise<IngestResult> {
  const flat = flattenCredits(input.rows, input.cfg);

  // --- 1. boyutlar: label, dönem, sanatçı, şarkı (upsert) ---
  const labelIds = new Map<string, string>();
  for (const name of flat.labels) {
    const r = await c.query<{ id: string }>(
      `insert into labels (name, slug) values ($1, $2)
       on conflict (name) do update set name = excluded.name
       returning id`,
      [name, slugify(name)]
    );
    labelIds.set(name, r.rows[0].id);
  }

  const periodIds = new Map<string, string>();
  for (const [label, p] of flat.periods) {
    const r = await c.query<{ id: string }>(
      `insert into periods (label, sort, year, month, quarter) values ($1,$2,$3,$4,$5)
       on conflict (label) do update set sort = excluded.sort
       returning id`,
      [label, p.sort, p.year, p.month, p.quarter]
    );
    periodIds.set(label, r.rows[0].id);
  }

  const artistIds = new Map<string, string>();
  for (const [key, name] of flat.artistNames) {
    const spellings = Array.from(flat.artistSpellings.get(key) ?? []).sort();
    // Mevcut sanatçının adını ezmeyelim; yazımları birleştirelim.
    const r = await c.query<{ id: string }>(
      `insert into artists (fold_key, display_name, spellings) values ($1,$2,$3)
       on conflict (fold_key) do update
         set spellings = (
               select array(select distinct unnest(artists.spellings || excluded.spellings) order by 1)
             ),
             updated_at = now()
       returning id`,
      [key, name, spellings]
    );
    artistIds.set(key, r.rows[0].id);
  }

  const songIds = new Map<string, string>();
  for (const [key, s] of flat.songs) {
    const r = await c.query<{ id: string }>(
      `insert into songs (song_key, title, album, isrc, artist_string) values ($1,$2,$3,$4,$5)
       on conflict (song_key) do update set title = excluded.title
       returning id`,
      [key, s.title, s.album, s.isrc, s.artistString]
    );
    songIds.set(key, r.rows[0].id);
  }

  // --- 2. rapor başlığı ---
  const gross = flat.totals.gross;
  const deduction = Number(input.deduction) || 0;
  const received = gross - deduction;

  const rep = await c.query<{ id: string }>(
    `insert into reports (title, file_name, file_hash, storage_path, gross, deduction, received, row_count, status, uploaded_by, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10) returning id`,
    [
      input.title,
      input.fileName,
      input.fileHash ?? null,
      input.storagePath ?? null,
      gross,
      deduction,
      received,
      input.rows.length,
      input.uploadedBy ?? null,
      input.notes ?? null,
    ]
  );
  const reportId = rep.rows[0].id;

  // --- 3. ham satırlar ---
  await bulkInsert(
    c,
    "report_rows",
    [
      "report_id", "period_id", "period", "retailer", "label_name", "artist_string",
      "album", "song_title", "isrc", "territory", "country_iso", "asset_type",
      "sales_class", "quantity", "revenue", "net",
    ],
    input.rows.map((r) => [
      reportId,
      periodIds.get(r.period || "—") ?? null,
      r.period, r.retailer, r.label, r.artist, r.album, r.song, r.isrc,
      r.territory, r.countryIso, r.assetType, r.salesClass,
      r.quantity, r.revenue, r.net,
    ]),
    400
  );

  // --- 4. credits ---
  await bulkInsert(
    c,
    "credits",
    [
      "report_id", "period_id", "artist_id", "song_id", "label_id",
      "share", "position", "total_artists", "gross", "quantity", "territory", "retailer",
    ],
    flat.credits.map((cr) => [
      reportId,
      periodIds.get(cr.periodLabel)!,
      artistIds.get(cr.artistFoldKey)!,
      songIds.get(cr.songKey)!,
      labelIds.get(cr.labelName)!,
      cr.share, cr.position, cr.totalArtists, cr.gross, cr.quantity,
      cr.territory, cr.retailer,
    ]),
    400
  );

  // --- 5. rapor × dönem özeti ---
  const perPeriod = new Map<string, { gross: number; rows: number }>();
  for (const r of input.rows) {
    const k = r.period || "—";
    const cur = perPeriod.get(k) ?? { gross: 0, rows: 0 };
    cur.gross += Number(r.net) || 0;
    cur.rows += 1;
    perPeriod.set(k, cur);
  }
  await bulkInsert(
    c,
    "report_periods",
    ["report_id", "period_id", "gross", "row_count"],
    Array.from(perPeriod.entries()).map(([label, v]) => [
      reportId, periodIds.get(label)!, v.gross, v.rows,
    ])
  );

  return {
    reportId,
    gross,
    received,
    deduction,
    rowCount: input.rows.length,
    creditCount: flat.credits.length,
    artistCount: flat.artistNames.size,
    songCount: flat.songs.size,
    labelCount: flat.labels.size,
    periods: Array.from(perPeriod.entries()).map(([label, v]) => {
      const p = flat.periods.get(label)!;
      return { label, year: p.year, month: p.month, gross: v.gross };
    }),
  };
}
