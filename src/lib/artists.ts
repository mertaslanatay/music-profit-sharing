import { DEFAULT_SEPARATORS, type Separator, type SplitOptions } from "./types";
import { tidy } from "./normalize";

const SEP = "\u0000";

/** Regex'te özel anlamı olan karakterleri kaçırır (ör. "." → "\.", "/" → "\/"). */
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Eski bayrak tabanlı ayarları (SplitOptions) belirteç listesine çevirir.
 *
 * Belirteçler artık veritabanından yönetiliyor; ama istemci tarafındaki
 * hesap makinesi (localStorage'daki EngineConfig) ve doğrulama script'leri
 * hâlâ bayraklarla çalışıyor. Bu köprü sayesinde iki yol da AYNI ayrıştırma
 * kodunu kullanır — davranışın çatallanma riski yok.
 */
export function separatorsFromOptions(opt: SplitOptions): Separator[] {
  const on: Record<string, boolean> = {
    feat: opt.feat, featuring: opt.feat, ft: opt.feat, with: opt.feat,
    vs: opt.vs, versus: opt.vs,
    x: opt.x,
    "&": opt.amp,
    "/": opt.slash,
    ",": opt.comma,
  };
  return DEFAULT_SEPARATORS.map((s, i) => ({
    ...s,
    id: `opt-${i}`,
    isActive: on[s.token] ?? false,
  }));
}

/**
 * Belirteç listesini uygulanabilir regex'lere derler.
 *
 *  • word   → `\s+(?:token\.?)\s+`  (büyük/küçük harf duyarsız)
 *  • symbol → `\s*token\s*`
 *
 * Yalnızca aktif belirteçler derlenir; sıralama `sort` alanına göredir
 * (çok kelimeli belirteçler önce, virgül en sonda).
 */
export function compileSeparators(list: Separator[]): RegExp[] {
  return list
    .filter((s) => s.isActive && s.token.trim().length > 0)
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .map((s) => {
      // Kelime belirteçlerinde sondaki noktayı ayrıca ele alıyoruz ki
      // "feat" belirteci "feat." yazımını da yakalasın.
      const t = escapeRe(
        s.kind === "word" ? s.token.trim().replace(/\.+$/, "") : s.token.trim()
      );
      return s.kind === "word"
        ? new RegExp(`\\s+(?:${t}\\.?)\\s+`, "gi")
        : new RegExp(`\\s*${t}\\s*`, "g");
    });
}

/**
 * Sanatçı dizisini tek tek isimlere ayırır. Sıra korunur — DÖNEN DİZİNİN
 * İLK ELEMANI HER ZAMAN ANA SANATÇIDIR.
 *
 *   "Ağaçkakan, Oldeaf"                        → [Ağaçkakan, Oldeaf]
 *   "Ağaçkakan, Emiladil feat. Barış Demirel"  → [Ağaçkakan, Emiladil, Barış Demirel]
 *   "Ağaçkakan x Savai x Emiladil"             → [Ağaçkakan, Savai, Emiladil]
 *   "Armonycoma or slt"                        → [Armonycoma or slt]   (bölünmez)
 *   "Herkestam feat. Nilipek."                 → [Herkestam, Nilipek.] (sondaki nokta korunur)
 *
 * İkinci parametre ya yöneticinin tanımladığı belirteç listesi (veritabanı
 * yolu) ya da eski bayrak nesnesidir (istemci/hesap makinesi yolu) —
 * ikisi de aynı derleyiciden geçer.
 */
export function splitArtists(raw: string, opt: SplitOptions | Separator[]): string[] {
  const source = tidy(raw ?? "");
  if (!source) return [];

  const seps = Array.isArray(opt) ? opt : separatorsFromOptions(opt);

  // Baş/son boşluk pedi: kelime belirteçleri kenarlarda \s+ bekliyor.
  let s = ` ${source} `;
  for (const re of compileSeparators(seps)) s = s.replace(re, SEP);

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
