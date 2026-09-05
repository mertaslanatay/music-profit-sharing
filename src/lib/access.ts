import { query, queryOne } from "./db";

/**
 * Yetkilendirme çekirdeği.
 *
 * TEMEL KURAL: Bir kullanıcının görmemesi gereken veri istemciye HİÇBİR ZAMAN
 * gönderilmez. Ekranda gizlemek güvenlik değildir — süzme SQL'de yapılır.
 *
 * Varsayılan her zaman "hiçbir şey görme"dir; yetki açıkça verilir.
 */

export type Role = "admin" | "label_manager" | "artist" | "accountant";
export type UserStatus = "pending" | "active" | "suspended";

export interface Viewer {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  status: UserStatus;
  /** Görebildiği label'lar. admin için boş = kısıt yok. */
  labelIds: string[];
  /** Görebildiği sanatçılar (artist rolünde: kendisi). */
  artistIds: string[];
  /** Sanatçı, bağlı olduğu label'ın toplamlarını görebilsin mi? */
  canSeeLabelTotals: boolean;
  /** Sanatçı, label içindeki diğer sanatçıların rakamlarını görebilsin mi? */
  canSeeOtherArtists: boolean;
  /**
   * İki adımlı doğrulama (TOTP) sağlanmış mı? Yalnızca admin rolü için
   * anlamlı — session.ts tarafından Supabase Auth'un o anki oturum
   * seviyesine (AAL) bakılarak doldurulur. Diğer roller için her zaman true.
   */
  mfaOk: boolean;
}

/** Görüntüleme kapsamı — SQL süzmesine çevrilir. */
export interface AccessScope {
  /** null = kısıt yok (admin). Boş dizi = hiçbir şey görme. */
  labelIds: string[] | null;
  /** null = kısıt yok. Boş dizi = hiçbir şey görme. */
  artistIds: string[] | null;
  /** Hiçbir veri görülemiyor mu? */
  denied: boolean;
}

/* ------------------------------------------------------- yetki hesaplama */

/**
 * Bir kullanıcının veri kapsamını hesaplar.
 *
 * - admin      → her şey
 * - label_manager / accountant → yalnızca atandığı label'lar
 * - artist     → yalnızca kendi kayıtları; canSeeOtherArtists açıksa
 *                bağlı olduğu label'ın tamamı
 * - pending / suspended → hiçbir şey
 */
export function scopeFor(v: Viewer | null): AccessScope {
  const deny: AccessScope = { labelIds: [], artistIds: [], denied: true };
  if (!v) return deny;
  if (v.status !== "active") return deny;

  if (v.role === "admin") {
    // 2FA opsiyonel: kurulu değilse mfaOk her zaman true'dur. Ama admin
    // kendi hesabına TOTP kurduysa, o oturumda ikinci adım tamamlanmadan
    // tam-erişim kapsamı açılmaz — aksi hâlde isAdmin() kapıyı kapatırken
    // sıradan veri sorguları (Panel, Ödeme Listesi…) her şeyi göstermeye
    // devam ederdi.
    if (v.mfaOk === false) return deny;
    return { labelIds: null, artistIds: null, denied: false };
  }

  if (v.role === "label_manager" || v.role === "accountant") {
    if (v.labelIds.length === 0) return deny;
    return { labelIds: v.labelIds, artistIds: null, denied: false };
  }

  // artist
  if (v.canSeeOtherArtists && v.labelIds.length > 0) {
    // Label geneline yetkilendirilmiş sanatçı: label kısıtı var, sanatçı kısıtı yok
    return { labelIds: v.labelIds, artistIds: null, denied: false };
  }
  if (v.artistIds.length === 0) return deny;
  return {
    labelIds: v.labelIds.length > 0 ? v.labelIds : null,
    artistIds: v.artistIds,
    denied: false,
  };
}

/**
 * Bu kullanıcı yönetim ekranlarına girebilir mi?
 *
 * 2FA opsiyoneldir (M4NM Pulse § 5): kurulu değilse mfaOk true'dur ve
 * hiçbir engel yoktur. Kurulmuşsa, o oturumda ikinci adım tamamlanmadan
 * admin yetkileri açılmaz. mfaOk, session.ts içinde Supabase Auth'un o
 * anki AAL seviyesine bakılarak hesaplanır.
 */
export const isAdmin = (v: Viewer | null): boolean =>
  v?.role === "admin" && v.status === "active" && v.mfaOk !== false;

/**
 * Admin kendi hesabına 2FA kurmuş ama bu oturumda kodu henüz girmemiş —
 * /guvenlik ekranına yönlendirilip doğrulamayı tamamlaması gerekir.
 * (2FA kurulu DEĞİLSE bu her zaman false döner; kimse kuruluma zorlanmaz.)
 */
export const needsMfaVerification = (v: Viewer | null): boolean =>
  v?.role === "admin" && v.status === "active" && v.mfaOk === false;

/** Ödeme kaydedebilir / yetki atayabilir mi? */
export const canManagePayments = (v: Viewer | null): boolean => isAdmin(v);

/** Excel dışa aktarabilir mi? */
export const canExport = (v: Viewer | null): boolean =>
  !!v && v.status === "active" && v.role !== "artist";

/** Bu sanatçının verisine erişebilir mi? */
export function canAccessArtist(v: Viewer | null, artistId: string): boolean {
  const s = scopeFor(v);
  if (s.denied) return false;
  if (s.artistIds === null) return true;
  return s.artistIds.includes(artistId);
}

/* --------------------------------------------------- SQL süzme yardımcısı */

export interface AccessSql {
  /** credits tablosuna eklenecek koşullar (alias c) */
  conditions: string[];
  params: unknown[];
}

/**
 * Kapsamı SQL koşullarına çevirir. `startIndex` mevcut parametre sayısıdır —
 * çağıran taraf kendi parametrelerinden sonra devam eder.
 */
export function accessSql(scope: AccessScope, startIndex: number, alias = "c"): AccessSql {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = startIndex;

  if (scope.denied) {
    // Hiçbir satır dönmesin — yanlışlıkla açık kalmasındansa boş dönsün.
    conditions.push("false");
    return { conditions, params };
  }
  if (scope.labelIds !== null) {
    params.push(scope.labelIds);
    conditions.push(`${alias}.label_id = any($${++i}::uuid[])`);
  }
  if (scope.artistIds !== null) {
    params.push(scope.artistIds);
    conditions.push(`${alias}.artist_id = any($${++i}::uuid[])`);
  }
  return { conditions, params };
}

/* ------------------------------------------------------- kullanıcı okuma */

interface UserRow {
  id: string;
  auth_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  artist_name: string | null;
  role: Role;
  status: UserStatus;
  can_see_label_totals: boolean;
  can_see_other_artists: boolean;
  label_ids: string[] | null;
  artist_ids: string[] | null;
}

const toViewer = (r: UserRow): Viewer => ({
  userId: r.id,
  email: r.email,
  fullName: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email,
  role: r.role,
  status: r.status,
  labelIds: r.label_ids ?? [],
  artistIds: r.artist_ids ?? [],
  canSeeLabelTotals: r.can_see_label_totals,
  canSeeOtherArtists: r.can_see_other_artists,
  // Varsayılan true — admin için session.ts, o oturumun gerçek AAL durumuna
  // bakarak bunu güncelliyor. Burada (salt SQL okumasında) Supabase Auth
  // bağlamı yok, bu yüzden bilerek iyimser başlıyoruz.
  mfaOk: true,
});

/** Supabase Auth kullanıcı id'sinden profil ve yetkileri getirir. */
export async function viewerByAuthId(authId: string): Promise<Viewer | null> {
  const r = await queryOne<UserRow>(
    `select * from v_user_access where auth_id = $1`, [authId]
  );
  return r ? toViewer(r) : null;
}

export async function viewerByEmail(email: string): Promise<Viewer | null> {
  const r = await queryOne<UserRow>(
    `select * from v_user_access where lower(email) = lower($1)`, [email]
  );
  return r ? toViewer(r) : null;
}

export async function viewerById(userId: string): Promise<Viewer | null> {
  const r = await queryOne<UserRow>(
    `select * from v_user_access where id = $1`, [userId]
  );
  return r ? toViewer(r) : null;
}

/* ---------------------------------------------------------- denetim kaydı */

export interface AuditEntry {
  userId: string | null;
  action: string;
  resource?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}

/**
 * Denetim kaydı. Mali veri görüntüleme ve indirme her zaman kaydedilir.
 * Kayıt yazılamazsa istek başarısız olmamalı — bu yüzden hata yutulur
 * ama sunucu günlüğüne düşer.
 */
export async function audit(e: AuditEntry): Promise<void> {
  try {
    await query(
      `insert into audit_log (user_id, action, resource, ip, user_agent, meta)
       values ($1,$2,$3,$4::inet,$5,$6::jsonb)`,
      [
        e.userId,
        e.action,
        e.resource ?? null,
        e.ip || null,
        e.userAgent ?? null,
        JSON.stringify(e.meta ?? {}),
      ]
    );
  } catch (err) {
    console.error("[audit] kayıt yazılamadı:", err);
  }
}

/* ------------------------------------------------------------ hız sınırı */

/**
 * Kaba hız sınırı: pencere içinde `limit` denemeden fazlası engellenir.
 * Giriş, kayıt ve şifre sıfırlamada kullanılır.
 */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds = 900
): Promise<{ ok: boolean; remaining: number }> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const r = await queryOne<{ count: number }>(
    `insert into rate_limits (bucket, window_at, count) values ($1, $2, 1)
     on conflict (bucket, window_at) do update set count = rate_limits.count + 1
     returning count`,
    [bucket, windowStart]
  );
  const count = r?.count ?? 1;
  return { ok: count <= limit, remaining: Math.max(0, limit - count) };
}

/** Eski hız sınırı kayıtlarını temizler (gün sonu işi). */
export async function pruneRateLimits(): Promise<void> {
  await query(`delete from rate_limits where window_at < now() - interval '2 days'`);
}
