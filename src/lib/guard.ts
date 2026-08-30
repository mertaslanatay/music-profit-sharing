import { NextResponse } from "next/server";
import { getSession, requestMeta } from "./session";
import { authConfigured } from "./supabase/server";
import { audit, isAdmin, canAccessArtist, scopeFor, type Viewer } from "./access";

/**
 * Rota işleyicileri için tek kapı.
 *
 * KURAL: Veri döndüren ya da veri değiştiren her rota bu dosyadaki bir
 * fonksiyondan geçer. Arayüzde düğmeyi gizlemek yetmez — kullanıcı adresi
 * elle yazabilir, isteği kendi eliyle atabilir.
 */

export class Denied extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const denyResponse = (e: unknown) =>
  e instanceof Denied
    ? NextResponse.json({ error: e.message }, { status: e.status })
    : NextResponse.json(
        { error: e instanceof Error ? e.message : "Bilinmeyen hata" }, { status: 500 }
      );

/**
 * Oturum açmış ve onaylanmış kullanıcıyı döndürür.
 * Auth henüz yapılandırılmadıysa (yerel geliştirme) null döner ve kısıt uygulanmaz.
 */
export async function requireViewer(): Promise<Viewer | null> {
  if (!authConfigured()) return null;
  const { viewer, reason } = await getSession();
  if (viewer) return viewer;
  throw new Denied(
    reason === "no-session" ? 401 : 403,
    reason === "pending" ? "Hesabın henüz onaylanmadı."
      : reason === "suspended" ? "Hesabın askıya alınmış."
      : reason === "unverified" ? "E-posta adresini doğrulaman gerekiyor."
      : reason === "no-profile" ? "Bu hesaba ait profil bulunamadı."
      : "Giriş yapman gerekiyor."
  );
}

/** Yönetici olmayan hiçbir şekilde geçemez. Reddedilen deneme kaydedilir. */
export async function requireAdmin(action = "admin_denied"): Promise<Viewer | null> {
  const v = await requireViewer();
  if (v === null) return null; // auth kapalı — yerel geliştirme
  if (!isAdmin(v)) {
    const m = await requestMeta();
    await audit({ userId: v.userId, action, resource: v.email, ip: m.ip, userAgent: m.userAgent,
                  meta: { role: v.role } });
    throw new Denied(403, "Bu işlem için yönetici yetkisi gerekiyor.");
  }
  return v;
}

/** Bu sanatçının verisine erişim — sanatçı kendi kaydını görür, admin hepsini. */
export async function requireArtistAccess(artistId: string): Promise<Viewer | null> {
  const v = await requireViewer();
  if (v === null) return null;
  if (!canAccessArtist(v, artistId)) {
    const m = await requestMeta();
    await audit({ userId: v.userId, action: "artist_access_denied", resource: `artist:${artistId}`,
                  ip: m.ip, userAgent: m.userAgent });
    throw new Denied(403, "Bu sanatçının verisine erişim yetkin yok.");
  }
  return v;
}

/** Sorgu katmanına geçirilecek kapsam. Auth kapalıysa undefined = kısıtsız. */
export const scopeOf = (v: Viewer | null) => (v ? scopeFor(v) : undefined);

/** Başarılı işlemi kaydeder. */
export async function logAction(
  v: Viewer | null, action: string, resource?: string | null,
  meta?: Record<string, unknown>
) {
  const m = await requestMeta();
  await audit({ userId: v?.userId ?? null, action, resource, ip: m.ip, userAgent: m.userAgent, meta });
}
