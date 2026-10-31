import { cookies } from "next/headers";
import { queryOne } from "./db";
import { isAdmin, viewerById, type Viewer } from "./access";

/**
 * "Sanatçının gözünden gör" — yönetici önizlemesi.
 *
 * GÜVENLİK MODELİ
 * ---------------
 * - Çerez yalnızca bir sanatçı kimliği taşır. Tek başına hiçbir yetki
 *   vermez: resolveViewAs() onu ancak GERÇEK oturum sahibi yöneticiyse
 *   dikkate alır. Sanatçı çerezi kendisi yazsa bile hiçbir şey değişmez.
 * - Önizleme yalnızca SAYFA okumalarını etkiler (/ ve /hesabim). Hiçbir API
 *   rotası bu çerezi okumaz; API'ler her zaman gerçek oturumla çalışır.
 * - Önizleme açıkken middleware tüm yazma isteklerini (POST/PUT/PATCH/DELETE
 *   → /api/*) 403 ile reddeder. Yani yönetici önizlemedeyken yanlışlıkla
 *   sanatçı adına ödeme talebi açamaz, banka bilgisi değiştiremez.
 * - Çerez 1 saat sonra kendiliğinden düşer. Başlatma/bitirme denetim
 *   kaydına yazılır (api/admin/view-as).
 */

export const VIEW_AS_COOKIE = "pulse_view_as";
export const VIEW_AS_MAX_AGE = 60 * 60; // saniye

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export interface ViewAsResult {
  /** Sayfanın kapsam ve rozet için kullanacağı (sanatçı) görüntüleyici. */
  viewer: Viewer;
  /** Gerçek oturum sahibi — denetim kaydı her zaman buna yazılır. */
  realViewer: Viewer;
  artistId: string;
  artistName: string;
  /** Sanatçının bağlı bir kullanıcı hesabı var mı (yoksa varsayılan yetkiler). */
  hasAccount: boolean;
  accountEmail: string | null;
}

/**
 * Gerçek görüntüleyici yönetici değilse veya çerez yoksa null döner — sayfa
 * normal akışına devam eder. Hata olursa da null (önizleme hiçbir zaman
 * sayfayı düşürmemeli).
 */
export async function resolveViewAs(real: Viewer | null): Promise<ViewAsResult | null> {
  if (!real || !isAdmin(real)) return null;

  let artistId: string | undefined;
  try {
    artistId = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  } catch {
    return null;
  }
  if (!isUuid(artistId)) return null;

  try {
    const row = await queryOne<{ id: string; display_name: string; uid: string | null }>(
      `select a.id, a.display_name,
              (select u.id from v_user_access u
                where u.role = 'artist' and u.status = 'active' and $1::uuid = any(u.artist_ids)
                order by u.created_at limit 1) uid
         from artists a where a.id = $1::uuid`,
      [artistId]
    );
    if (!row) return null;

    // Hesabı olan sanatçı: birebir onun yetkileri (label toplamlarını görme,
    // diğer sanatçıları görme gibi ayarlar dahil).
    if (row.uid) {
      const v = await viewerById(row.uid);
      if (v) {
        return {
          viewer: { ...v, mfaOk: true },
          realViewer: real,
          artistId: row.id,
          artistName: row.display_name,
          hasAccount: true,
          accountEmail: v.email,
        };
      }
    }

    // Hesabı yok: yeni onaylanmış bir sanatçının varsayılan yetkileri —
    // yalnızca kendi kayıtları.
    const synthetic: Viewer = {
      userId: real.userId, // yazma zaten engelli; denetim kayıtları gerçek yöneticiye düşer
      email: "",
      fullName: row.display_name,
      role: "artist",
      status: "active",
      labelIds: [],
      artistIds: [row.id],
      canSeeLabelTotals: false,
      canSeeOtherArtists: false,
      mfaOk: true,
    };
    return {
      viewer: synthetic,
      realViewer: real,
      artistId: row.id,
      artistName: row.display_name,
      hasAccount: false,
      accountEmail: null,
    };
  } catch {
    return null;
  }
}
