import type { Result } from "./types";

/**
 * KURAL (31 Eki 2026, Mert): Yönetici olmayan hiç kimse — label toplamlarını
 * görme yetkisi olsa bile — başka bir sanatçının hakedişini / netini göremez.
 *
 * Bu süzme SUNUCUDA, sayfa veriyi istemciye göndermeden önce yapılır; ekranda
 * gizlemek yetmez (veri tarayıcıya ulaşırsa okunabilir).
 *
 * Ne kalır:
 *  - Label / kapsam toplamları (brüt, kesinti, net, sanatçı ve şarkı SAYISI)
 *  - Şarkı ve albüm gelirleri (bölüşüm öncesi şarkı geliri — kişinin hakedişi değil)
 *  - Kullanıcının KENDİ sanatçı kimliklerinin hakediş satırları
 * Ne gider:
 *  - Diğer sanatçıların ArtistAgg satırları (Ödeme Listesi, en çok kazananlar,
 *    sanatçı dökümü, Sanatçılar ekranı bunlardan beslenir)
 *  - Label kartlarındaki "en çok kazanan sanatçılar" listesinde diğerleri
 *
 * Önbellekteki nesne paylaşımlı — KOPYA döndürülür, asla yerinde değiştirilmez.
 */
export function redactOtherArtists(res: Result, ownArtistIds: string[]): Result {
  const own = new Set(ownArtistIds);
  const artists = res.artists.filter((a) => a.id && own.has(a.id));
  const ownNames = new Set(artists.map((a) => a.name));
  return {
    ...res,
    artists,
    labels: res.labels.map((l) => ({
      ...l,
      topArtists: l.topArtists.filter((t) => ownNames.has(t.name)),
    })),
    aliasSuggestions: [],
  };
}
