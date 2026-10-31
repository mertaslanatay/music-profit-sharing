import type { ArtistAgg, Result, SongAgg } from "./types";
import { foldKey } from "./normalize";

/**
 * Katalog ekranları (Sanatçılar, Albümler) için türetilmiş veriler.
 *
 * Yeni sorgu YOK — her şey panelin zaten yüklediği Result'tan hesaplanıyor.
 * Böylece dönem seçici, yetki süzmesi ve önbellek bu ekranlarda da aynen
 * geçerli: sanatçı yalnızca kendi albümlerini görür, dönem seçilince albüm
 * listesi o dönemlere daralır.
 */

export interface AlbumAgg {
  key: string;
  name: string;
  /** Kartta gösterilen sanatçı; ikiden fazla ana sanatçı varsa "Çeşitli sanatçılar". */
  artistLine: string;
  /** Albümdeki şarkılarda geçen tüm sanatçılar (bölüşüm sonrası adlar). */
  artists: string[];
  label: string;
  songCount: number;
  gross: number;
  quantity: number;
  /** periods.sort — veride gerçek yayın tarihi yok, ilk gelir dönemi kullanılıyor. */
  firstSort: number | null;
  lastSort: number | null;
  songs: SongAgg[];
}

export interface ArtistCatalogRow {
  artist: ArtistAgg;
  albumCount: number;
  topLabel: string;
  firstSort: number | null;
  lastSort: number | null;
}

export type CatalogSort = "gross" | "name-asc" | "name-desc" | "newest" | "oldest";

export const SORT_LABELS: Record<CatalogSort, string> = {
  gross: "Gelire göre",
  "name-asc": "İsim (A → Z)",
  "name-desc": "İsim (Z → A)",
  newest: "En yeni (ilk gelir)",
  oldest: "En eski (ilk gelir)",
};

const NO_ALBUM = "—";

export function buildAlbums(res: Result): AlbumAgg[] {
  const groups = new Map<string, SongAgg[]>();
  for (const s of res.songs) {
    const key = foldKey(s.album ?? "").trim() || NO_ALBUM;
    const arr = groups.get(key);
    if (arr) arr.push(s);
    else groups.set(key, [s]);
  }

  const out: AlbumAgg[] = [];
  for (const [key, songs] of groups) {
    songs.sort((a, b) => b.gross - a.gross);

    // Albüm adı: en çok kazanan şarkının yazımı (aynı albüm farklı büyük/küçük
    // harfle gelebiliyor).
    const name = key === NO_ALBUM ? "Albümsüz şarkılar" : (songs[0].album || "").trim();

    const primaryWeight = new Map<string, number>();
    const labelWeight = new Map<string, number>();
    const artistSet = new Set<string>();
    let gross = 0;
    let quantity = 0;
    let first: number | null = null;
    let last: number | null = null;

    for (const s of songs) {
      gross += s.gross;
      quantity += s.quantity;
      const w = Math.max(Math.abs(s.gross), 1e-9);
      primaryWeight.set(s.primaryArtist, (primaryWeight.get(s.primaryArtist) ?? 0) + w);
      labelWeight.set(s.label, (labelWeight.get(s.label) ?? 0) + w);
      for (const a of s.artists) artistSet.add(a);
      if (s.firstSort != null) first = first == null ? s.firstSort : Math.min(first, s.firstSort);
      if (s.lastSort != null) last = last == null ? s.lastSort : Math.max(last, s.lastSort);
    }

    const primaries = [...primaryWeight.entries()].sort((a, b) => b[1] - a[1]);
    const artistLine =
      primaries.length > 2 ? "Çeşitli sanatçılar"
        : primaries.map(([n]) => n).filter(Boolean).join(", ") || "—";

    out.push({
      key,
      name,
      artistLine,
      artists: [...artistSet].sort((a, b) => a.localeCompare(b, "tr")),
      label: [...labelWeight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—",
      songCount: songs.length,
      gross,
      quantity,
      firstSort: first,
      lastSort: last,
      songs,
    });
  }
  return out;
}

/** Sanatçının ilk/son gelir dönemi — ArtistAgg.periods dönem ETİKETİYLE tutulur. */
export function buildArtistRows(
  res: Result,
  sortByPeriodLabel: Map<string, number>
): ArtistCatalogRow[] {
  return res.artists.map((a) => {
    let first: number | null = null;
    let last: number | null = null;
    for (const label of Object.keys(a.periods)) {
      const s = sortByPeriodLabel.get(label);
      if (s == null) continue;
      first = first == null ? s : Math.min(first, s);
      last = last == null ? s : Math.max(last, s);
    }
    const albums = new Set(a.songs.map((s) => foldKey(s.album ?? "").trim()).filter(Boolean));
    const topLabel = Object.entries(a.labels).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "—";
    return { artist: a, albumCount: albums.size, topLabel, firstSort: first, lastSort: last };
  });
}

/** Ortak sıralayıcı. Tarihi olmayan kayıtlar her iki yönde de sona düşer. */
export function sortCatalog<T>(
  rows: T[],
  sort: CatalogSort,
  get: { name: (r: T) => string; gross: (r: T) => number; first: (r: T) => number | null }
): T[] {
  const byName = (a: T, b: T) => get.name(a).localeCompare(get.name(b), "tr", { sensitivity: "base" });
  return [...rows].sort((a, b) => {
    switch (sort) {
      case "name-asc": return byName(a, b);
      case "name-desc": return byName(b, a);
      case "newest":
      case "oldest": {
        const fa = get.first(a), fb = get.first(b);
        if (fa == null && fb == null) return byName(a, b);
        if (fa == null) return 1;
        if (fb == null) return -1;
        const r = sort === "newest" ? fb - fa : fa - fb;
        return r !== 0 ? r : get.gross(b) - get.gross(a);
      }
      default: return get.gross(b) - get.gross(a);
    }
  });
}
