import type { SplitOptions } from "./types";
import { tidy } from "./normalize";

const SEP = "\u0000";

/**
 * Sanatçı dizisini tek tek isimlere ayırır. Sıra korunur — DÖNEN DİZİNİN
 * İLK ELEMANI HER ZAMAN ANA SANATÇIDIR.
 *
 *   "Ağaçkakan, Oldeaf"                        → [Ağaçkakan, Oldeaf]
 *   "Ağaçkakan, Emiladil feat. Barış Demirel"  → [Ağaçkakan, Emiladil, Barış Demirel]
 *   "Ağaçkakan x Savai x Emiladil"             → [Ağaçkakan, Savai, Emiladil]
 *   "Armonycoma or slt"                        → [Armonycoma or slt]   (bölünmez)
 *   "Herkestam feat. Nilipek."                 → [Herkestam, Nilipek.] (sondaki nokta korunur)
 */
export function splitArtists(raw: string, opt: SplitOptions): string[] {
  const source = tidy(raw ?? "");
  if (!source) return [];

  // Baş/son boşluk pedi: ayırıcı regexleri kelime sınırında \s+ bekliyor.
  let s = ` ${source} `;

  // Sıra önemli: önce çok kelimeli tokenler, en son virgül.
  if (opt.feat) {
    s = s.replace(/\s+(?:feat\.?|featuring|ft\.?|with)\s+/gi, SEP);
  }
  if (opt.vs) {
    s = s.replace(/\s+(?:vs\.?|versus)\s+/gi, SEP);
  }
  if (opt.x) {
    // Yalnızca boşlukla çevrili tek "x": "Ağaçkakan x dafraktal".
    // "Cxngxvxr" veya "Gxblin" gibi isim içi x'ler etkilenmez.
    s = s.replace(/\s+[xX]\s+/g, SEP);
  }
  if (opt.amp) {
    s = s.replace(/\s*&\s*/g, SEP);
  }
  if (opt.slash) {
    s = s.replace(/\s*\/\s*/g, SEP);
  }
  if (opt.comma) {
    s = s.replace(/\s*,\s*/g, SEP);
  }

  const parts = s
    .split(SEP)
    .map((p) => tidy(p))
    .filter((p) => p.length > 0);

  return parts.length > 0 ? parts : [source];
}

/** Eşit bölüşüm ağırlıkları. */
export function equalWeights(n: number): number[] {
  if (n <= 0) return [];
  return new Array<number>(n).fill(1 / n);
}

/** Kullanıcı ağırlıklarını n uzunluğuna getirip toplamı 1 olacak şekilde normalize eder. */
export function normalizeWeights(input: number[] | undefined, n: number): number[] {
  if (!input || input.length === 0) return equalWeights(n);
  const w = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const v = Number(input[i]);
    w[i] = Number.isFinite(v) && v > 0 ? v : 0;
  }
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) return equalWeights(n);
  return w.map((v) => v / sum);
}
