import { equalWeights, normalizeWeights, splitArtists } from "./artists";
import { foldKey, levenshtein, tidy } from "./normalize";
import type {
  AliasSuggestion,
  ArtistAgg,
  ComboAgg,
  EngineConfig,
  LabelAgg,
  RawRow,
  Result,
  SongAgg,
  SongCredit,
  Tally,
} from "./types";

const add = (t: Tally, k: string, v: number) => {
  if (!k) k = "—";
  t[k] = (t[k] ?? 0) + v;
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Ham satırdan şarkı kimliği. ISRC varsa o kullanılır — en güvenilir anahtar. */
function songKeyOf(r: RawRow): string {
  if (r.isrc) return `isrc:${r.isrc.toUpperCase()}`;
  const t = foldKey(r.song || r.album);
  return `t:${foldKey(r.artist)}|${t}`;
}

interface ArtistBucket extends Omit<ArtistAgg, "songs" | "spellings" | "songCount"> {
  spellingGross: Map<string, number>;
  songMap: Map<string, SongCredit>;
}

/**
 * Ana hesaplama. Saf fonksiyon — aynı girdi her zaman aynı çıktıyı verir.
 */
export function compute(rows: RawRow[], cfg: EngineConfig): Result {
  const artistBuckets = new Map<string, ArtistBucket>();
  const songMap = new Map<string, SongAgg>();
  const labelMap = new Map<string, { gross: number; quantity: number; artists: Map<string, number>; songs: Set<string> }>();
  const territories: Tally = {};
  const retailers: Tally = {};
  const periods: Tally = {};
  const salesClasses: Tally = {};

  // --- 1. Benzersiz sanatçı dizilerini bir kez ayrıştır (15k satır, ~150 dizi) ---
  const comboCache = new Map<string, { parts: string[]; weights: number[]; overridden: boolean }>();
  const comboStats = new Map<string, { gross: number; rowCount: number; songs: Set<string> }>();

  const resolveCombo = (artistString: string) => {
    let c = comboCache.get(artistString);
    if (!c) {
      const parts = splitArtists(artistString, cfg.split);
      const ov = cfg.overrides[artistString];
      const overridden = Array.isArray(ov) && ov.length > 0;
      const weights = overridden ? normalizeWeights(ov, parts.length) : equalWeights(parts.length);
      c = { parts, weights, overridden };
      comboCache.set(artistString, c);
    }
    return c;
  };

  /** foldKey'i alias zinciri üzerinden kanonik anahtara çevirir (döngüye karşı korumalı). */
  const canonical = (raw: string): string => {
    let k = foldKey(raw);
    const seen = new Set<string>();
    while (cfg.aliases[k] && !seen.has(k)) {
      seen.add(k);
      k = cfg.aliases[k];
    }
    return k;
  };

  let totalGross = 0;
  let totalQuantity = 0;
  let negativeRows = 0;

  // --- 2. Satırları gez ---
  for (const r of rows) {
    const net = Number(r.net) || 0;
    const qty = Number(r.quantity) || 0;
    if (net < 0) negativeRows++;
    totalGross += net;
    totalQuantity += qty;

    add(territories, r.territory, net);
    add(retailers, r.retailer, net);
    add(periods, r.period, net);
    add(salesClasses, r.salesClass, net);

    const sk = songKeyOf(r);
    const combo = resolveCombo(r.artist);

    // --- şarkı toplamı ---
    let song = songMap.get(sk);
    if (!song) {
      song = {
        key: sk,
        song: tidy(r.song || r.album || "—"),
        album: tidy(r.album),
        isrc: r.isrc,
        label: r.label,
        artistString: r.artist,
        primaryArtist: combo.parts[0] ?? r.artist,
        artists: combo.parts,
        gross: 0,
        quantity: 0,
        territories: {},
        retailers: {},
      };
      songMap.set(sk, song);
    }
    song.gross += net;
    song.quantity += qty;
    add(song.territories, r.territory, net);
    add(song.retailers, r.retailer, net);

    // --- label toplamı ---
    const labelName = r.label || "—";
    let lab = labelMap.get(labelName);
    if (!lab) {
      lab = { gross: 0, quantity: 0, artists: new Map(), songs: new Set() };
      labelMap.set(labelName, lab);
    }
    lab.gross += net;
    lab.quantity += qty;
    lab.songs.add(sk);

    // --- kombinasyon istatistiği ---
    let cs = comboStats.get(r.artist);
    if (!cs) {
      cs = { gross: 0, rowCount: 0, songs: new Set() };
      comboStats.set(r.artist, cs);
    }
    cs.gross += net;
    cs.rowCount += 1;
    cs.songs.add(sk);

    // --- 3. Payları sanatçılara dağıt ---
    for (let i = 0; i < combo.parts.length; i++) {
      const rawName = combo.parts[i];
      const share = combo.weights[i] ?? 0;
      const credit = net * share;
      const creditQty = qty * share;
      const key = canonical(rawName);
      if (!key) continue;

      let b = artistBuckets.get(key);
      if (!b) {
        b = {
          key,
          name: rawName,
          gross: 0,
          net: 0,
          deduction: 0,
          primaryGross: 0,
          featureGross: 0,
          soloGross: 0,
          quantity: 0,
          rowCount: 0,
          territories: {},
          retailers: {},
          labels: {},
          periods: {},
          collaborators: {},
          spellingGross: new Map(),
          songMap: new Map(),
        };
        artistBuckets.set(key, b);
      }

      b.gross += credit;
      b.quantity += creditQty;
      b.rowCount += 1;
      if (combo.parts.length === 1) b.soloGross += credit;
      else if (i === 0) b.primaryGross += credit;
      else b.featureGross += credit;

      add(b.territories, r.territory, credit);
      add(b.retailers, r.retailer, credit);
      add(b.labels, labelName, credit);
      add(b.periods, r.period, credit);
      b.spellingGross.set(rawName, (b.spellingGross.get(rawName) ?? 0) + credit);

      if (combo.parts.length > 1) {
        for (let j = 0; j < combo.parts.length; j++) {
          if (j === i) continue;
          add(b.collaborators, combo.parts[j], credit);
        }
      }

      let sc = b.songMap.get(sk);
      if (!sc) {
        sc = {
          songKey: sk,
          song: song.song,
          album: song.album,
          artistString: r.artist,
          label: labelName,
          share,
          position: i,
          totalArtists: combo.parts.length,
          gross: 0,
          quantity: 0,
        };
        b.songMap.set(sk, sc);
      }
      sc.gross += credit;
      sc.quantity += creditQty;

      lab.artists.set(key, (lab.artists.get(key) ?? 0) + credit);
    }
  }

  // --- 4. Sanatçıları sonuçlandır: görünen ad = en çok kazandıran yazım ---
  const artists: ArtistAgg[] = [];
  for (const b of artistBuckets.values()) {
    let bestName = b.name;
    let bestVal = -Infinity;
    const spellings: string[] = [];
    for (const [sp, val] of b.spellingGross) {
      spellings.push(sp);
      if (val > bestVal) {
        bestVal = val;
        bestName = sp;
      }
    }
    const songs = Array.from(b.songMap.values()).sort((a, c) => c.gross - a.gross);
    artists.push({
      key: b.key,
      name: bestName,
      spellings: spellings.sort(),
      gross: b.gross,
      net: 0,
      deduction: 0,
      primaryGross: b.primaryGross,
      featureGross: b.featureGross,
      soloGross: b.soloGross,
      quantity: b.quantity,
      rowCount: b.rowCount,
      songCount: songs.length,
      territories: b.territories,
      retailers: b.retailers,
      labels: b.labels,
      periods: b.periods,
      collaborators: b.collaborators,
      songs,
    });
  }
  artists.sort((a, b) => b.gross - a.gross);

  // --- 5. Oransal (pro-rata) SWIFT kesintisi ---
  const gross = totalGross;
  const received = cfg.received === null || !Number.isFinite(cfg.received) ? gross : cfg.received;
  const deduction = gross - received;
  const netRate = gross !== 0 ? received / gross : 1;
  applyProRata(artists, netRate, received);

  // --- 6. Label'ları sonuçlandır ---
  const labels: LabelAgg[] = [];
  const nameByKey = new Map(artists.map((a) => [a.key, a.name] as const));
  for (const [label, v] of labelMap) {
    const top = Array.from(v.artists.entries())
      .map(([k, g]) => ({ name: nameByKey.get(k) ?? k, gross: g }))
      .sort((a, b) => b.gross - a.gross);
    labels.push({
      label,
      gross: v.gross,
      net: v.gross * netRate,
      quantity: v.quantity,
      artistCount: v.artists.size,
      songCount: v.songs.size,
      topArtists: top,
    });
  }
  labels.sort((a, b) => b.gross - a.gross);

  // --- 7. Kombinasyonlar (özel oran ekranı için) ---
  const combos: ComboAgg[] = [];
  for (const [artistString, stat] of comboStats) {
    const c = resolveCombo(artistString);
    if (c.parts.length < 2) continue;
    combos.push({
      artistString,
      parts: c.parts,
      gross: stat.gross,
      rowCount: stat.rowCount,
      songCount: stat.songs.size,
      weights: c.weights,
      isOverridden: c.overridden,
    });
  }
  combos.sort((a, b) => b.gross - a.gross);

  const songs = Array.from(songMap.values()).sort((a, b) => b.gross - a.gross);

  return {
    artists,
    songs,
    labels,
    combos,
    territories,
    retailers,
    periods,
    salesClasses,
    aliasSuggestions: suggestAliases(artists),
    totals: {
      gross,
      received,
      deduction,
      deductionRate: gross !== 0 ? deduction / gross : 0,
      netRate,
      quantity: totalQuantity,
      rowCount: rows.length,
      artistCount: artists.length,
      songCount: songs.length,
      labelCount: labels.length,
      territoryCount: Object.keys(territories).length,
      retailerCount: Object.keys(retailers).length,
      negativeRows,
    },
  };
}

/**
 * Net tutarları kuruşuna kadar dağıtır (en büyük kalan yöntemi).
 * Yuvarlanmış netlerin toplamı, bankaya yatan tutara TAM olarak eşit olur.
 */
export function applyProRata(artists: ArtistAgg[], netRate: number, received: number): void {
  if (artists.length === 0) return;

  const targetCents = Math.round(received * 100);
  const rawCents = artists.map((a) => a.gross * netRate * 100);

  // Math.floor negatif sayılarda da doğru çalışır (floor(-1.3) = -2), dolayısıyla
  // kalan (frac) her zaman [0,1) aralığındadır ve en büyük kalan yöntemi
  // negatif bakiyeli sanatçılarda da geçerlidir. Böylece hiçbir sanatçının
  // net tutarı matematiksel değerinden 1 kuruştan fazla sapmaz.
  const floors = rawCents.map((c) => Math.floor(c));
  const used = floors.reduce((a, b) => a + b, 0);
  let residual = targetCents - used;

  const order = rawCents
    .map((c, i) => ({ i, frac: c - Math.floor(c) }))
    .sort((a, b) => b.frac - a.frac || rawCents[b.i] - rawCents[a.i]);

  const cents = floors.slice();
  // Kalan kuruşları en büyük ondalık artığı olanlara birer birer dağıt.
  // Beklenen residual aralığı [0, n]; olağandışı bir durumda tur atarak tüketilir.
  let guard = 0;
  while (residual > 0 && guard < 4) {
    for (let k = 0; k < order.length && residual > 0; k++, residual--) {
      cents[order[k].i] += 1;
    }
    guard++;
  }
  guard = 0;
  while (residual < 0 && guard < 4) {
    for (let k = order.length - 1; k >= 0 && residual < 0; k--, residual++) {
      cents[order[k].i] -= 1;
    }
    guard++;
  }

  artists.forEach((a, i) => {
    a.net = cents[i] / 100;
    a.deduction = round2(a.gross - a.net);
  });
}

/**
 * Aynı kişi olma ihtimali yüksek isim çiftlerini önerir.
 * Kullanıcı onaylamadan HİÇBİR birleştirme yapılmaz.
 */
export function suggestAliases(artists: ArtistAgg[]): AliasSuggestion[] {
  const out: AliasSuggestion[] = [];
  const list = artists.filter((a) => a.key.length >= 3);

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const ka = a.key;
      const kb = b.key;
      if (ka === kb) continue;

      let reason = "";
      let score = 0;

      if (ka.length >= 5 && kb.startsWith(ka)) {
        reason = `"${b.name}" adı "${a.name}" ile başlıyor`;
        score = 0.8;
      } else if (kb.length >= 5 && ka.startsWith(kb)) {
        reason = `"${a.name}" adı "${b.name}" ile başlıyor`;
        score = 0.8;
      } else {
        const maxLen = Math.max(ka.length, kb.length);
        if (maxLen >= 5) {
          const d = levenshtein(ka, kb, 2);
          if (d <= 2 && d / maxLen <= 0.25) {
            reason = `Yazım farkı ${d} karakter`;
            score = 0.9 - d * 0.15;
          }
        }
      }

      if (!reason) continue;
      // düşük kazançlı olan yüksek kazançlıya bağlanır
      const [from, to] = a.gross >= b.gross ? [b, a] : [a, b];
      out.push({
        from: from.key,
        to: to.key,
        fromName: from.name,
        toName: to.name,
        fromGross: from.gross,
        toGross: to.gross,
        reason,
        score,
      });
    }
  }

  return out.sort((x, y) => y.score - x.score || y.fromGross - x.fromGross).slice(0, 40);
}
