import { headers } from "next/headers";
import { query, queryOne } from "./db";
import { supabaseServer, authConfigured } from "./supabase/server";
import { viewerByAuthId, viewerByEmail, audit, type Viewer } from "./access";

/**
 * Oturum → Viewer köprüsü.
 *
 * Supabase Auth kimliği doğrular; kim ne görebilir kararını bizim users
 * tablomuz verir. Bu ayrım bilinçlidir: Supabase panelinden bir kullanıcı
 * eklense bile bizim onayımız olmadan hiçbir mali veriye erişemez.
 */

/** Kurulum tamamlanmamışsa (Auth anahtarları yok) geliştirme kolaylığı. */
const AUTH_OFF = () => !authConfigured();

export interface SessionInfo {
  viewer: Viewer | null;
  /** Supabase'de oturum var ama bizde profil/onay yok mu? */
  reason: null | "no-session" | "no-profile" | "pending" | "suspended" | "unverified";
  authEmail: string | null;
}

/**
 * Geçerli oturumu çözer. Sunucu bileşenlerinden ve rota işleyicilerinden
 * çağrılır. Asla istemciye güvenmez — kimlik her zaman çerezden doğrulanır.
 */
export async function getSession(): Promise<SessionInfo> {
  if (AUTH_OFF()) return { viewer: null, reason: "no-session", authEmail: null };

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getUser();
  const user = data?.user;
  if (error || !user) return { viewer: null, reason: "no-session", authEmail: null };

  const email = user.email ?? null;

  // E-posta doğrulanmadan hiçbir şey yok.
  if (!user.email_confirmed_at) {
    return { viewer: null, reason: "unverified", authEmail: email };
  }

  let viewer = await viewerByAuthId(user.id);

  // İlk girişte bağlama: profil e-posta ile önceden oluşturulmuş olabilir
  // (admin tohumlaması veya kayıt kaydı). auth_id'yi bir kez yazarız.
  if (!viewer && email) {
    const existing = await viewerByEmail(email);
    if (existing) {
      const linked = await queryOne<{ id: string }>(
        `update users set auth_id = $1, email_verified_at = coalesce(email_verified_at, now())
         where id = $2 and auth_id is null returning id`,
        [user.id, existing.userId]
      );
      if (linked) {
        await audit({ userId: existing.userId, action: "auth_linked", resource: email });
        viewer = await viewerByAuthId(user.id);
      }
    }
  }

  if (!viewer) return { viewer: null, reason: "no-profile", authEmail: email };
  if (viewer.status === "pending") return { viewer: null, reason: "pending", authEmail: email };
  if (viewer.status === "suspended") return { viewer: null, reason: "suspended", authEmail: email };

  // Son görülme — dakikada bir güncellenir, her istekte değil.
  void query(
    `update users set last_seen_at = now() where id = $1
     and (last_seen_at is null or last_seen_at < now() - interval '1 minute')`,
    [viewer.userId]
  ).catch(() => {});

  return { viewer, reason: null, authEmail: email };
}

/** Yalnızca Viewer gerekiyorsa kısayol. */
export async function currentViewer(): Promise<Viewer | null> {
  return (await getSession()).viewer;
}

/** İstek üstbilgilerinden IP ve tarayıcı — denetim kaydı için. */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    return {
      ip: fwd ? fwd.split(",")[0].trim() : h.get("x-real-ip"),
      userAgent: h.get("user-agent"),
    };
  } catch {
    return { ip: null, userAgent: null };
  }
}
