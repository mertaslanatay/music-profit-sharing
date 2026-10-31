/**
 * Kısa video / sosyal platformlar. Raporlarındaki "adet", sesin videolarda
 * kullanılma (oynatılma) sayısıdır, şarkının dinlenmesi değil — canlı veride
 * (31 Eki 2026) tüm "adet"in %52'si, gelirin %1,1'i; 1.000 adet ≈ $0,005
 * (Spotify $0,49). Uygulamada "dinlenme" her yerde bunlar HARİÇ sayılır;
 * kullanım ayrıca "video kullanımı" olarak gösterilir. (faz-z7/z8)
 *
 * Sunucu (SQL) ve istemci aynı listeyi kullanır — küçük harf, tam eşleşme.
 */
export const UGC_RETAILERS = ["tiktok", "facebook", "instagram", "youtube shorts"] as const;

export const isUgcRetailer = (name: string | null | undefined): boolean =>
  (UGC_RETAILERS as readonly string[]).includes((name ?? "").trim().toLowerCase());

/** SQL koşulu: c.retailer bir müzik platformu (video platformu değil). */
export const MUSIC_SQL =
  `coalesce(lower(c.retailer), '') not in (${UGC_RETAILERS.map((r) => `'${r}'`).join(", ")})`;
