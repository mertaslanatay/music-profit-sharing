/**
 * Türkçe-duyarlı isim normalizasyonu.
 *
 * Kritik nokta: JavaScript'in varsayılan toLowerCase()'i Türkçe "I" harfini "i"
 * yapar, oysa Türkçe'de "I" → "ı" ve "İ" → "i" olmalıdır. Bu yüzden önce
 * Türkçe'ye özgü harfleri elle eşliyoruz.
 */
const TR_MAP: Record<string, string> = {
  "İ": "i",
  "I": "ı",
  "Ş": "ş",
  "Ğ": "ğ",
  "Ü": "ü",
  "Ö": "ö",
  "Ç": "ç",
};

export function trLower(input: string): string {
  return input.replace(/[İIŞĞÜÖÇ]/g, (c) => TR_MAP[c]).toLowerCase();
}

/**
 * Eşleştirme anahtarı: küçük harfe indirir, Türkçe diakritikleri ASCII'ye
 * katlar (ğ→g, ç→c, ş→s, ı→i, ö→o, ü→u), noktalama ve boşlukları atar.
 *
 *   "Ağaçkakan"  → "agackakan"
 *   "AĞAÇKAKAN"  → "agackakan"   (aynı)
 *   "I.mpty"     → "impty"
 *   "Armonycoma or Slt" → "armonycomaorslt"
 */
export function foldKey(input: string): string {
  return trLower(input ?? "")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Görüntüleme için sadeleştirme: fazla boşlukları toplar. */
export function tidy(input: string): string {
  return (input ?? "").replace(/\s+/g, " ").trim();
}

/** Levenshtein mesafesi (kısa isimler için, erken çıkışlı). */
export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > max) return max + 1;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}
