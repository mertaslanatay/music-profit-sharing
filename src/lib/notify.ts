import { query, queryOne } from "./db";
import { creditsSource } from "./schema";

/**
 * Bildirim merkezi — yazma tarafı (M4NM Pulse § 1).
 *
 * TASARIM KURALI: Bildirim yazmak hiçbir zaman asıl işlemi düşürmez.
 * Ödeme kaydedildiyse ödeme kaydedilmiştir; bildirim yazılamadıysa bu
 * loglanır ama istek başarısız olmaz (audit() ile aynı felsefe). Bu yüzden
 * buradaki her fonksiyon kendi hatasını yutar.
 */

export type NotificationType =
  | "payment_batch"      // yeni ödeme partisi yayınlandı
  | "payment"            // ödeme kaydedildi / geri alındı
  | "bank"               // banka bilgisi değişikliği
  | "request"            // ödeme isteği durumu
  | "account"            // hesap onayı / askı
  | "revenue_transfer"   // gelir hakkı devri (Faz C)
  | "song_split"         // kalıcı şarkı bölüşümü düzenlendi (şartname sonrası 5)
  | "message"            // iletişim merkezi (Faz D)
  | "system";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  resource?: string | null;
  actionUrl?: string | null;
  meta?: Record<string, unknown>;
  createdBy?: string | null;
}

/** Tek kullanıcıya bildirim yazar. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await query(
      `insert into notifications (user_id, type, title, body, resource, action_url, meta, created_by)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
      [
        input.userId,
        input.type,
        input.title,
        input.body ?? "",
        input.resource ?? null,
        input.actionUrl ?? null,
        JSON.stringify(input.meta ?? {}),
        input.createdBy ?? null,
      ]
    );
  } catch (e) {
    console.error("[notify] bildirim yazılamadı:", e);
  }
}

/** Birden çok kullanıcıya aynı bildirimi yazar (tek sorgu). */
export async function notifyMany(
  userIds: string[],
  input: Omit<NotifyInput, "userId">
): Promise<number> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return 0;
  try {
    await query(
      `insert into notifications (user_id, type, title, body, resource, action_url, meta, created_by)
       select u, $2, $3, $4, $5, $6, $7::jsonb, $8 from unnest($1::uuid[]) u`,
      [
        ids,
        input.type,
        input.title,
        input.body ?? "",
        input.resource ?? null,
        input.actionUrl ?? null,
        JSON.stringify(input.meta ?? {}),
        input.createdBy ?? null,
      ]
    );
    return ids.length;
  } catch (e) {
    console.error("[notify] toplu bildirim yazılamadı:", e);
    return 0;
  }
}

/**
 * Bir sanatçının hesabına bağlı kullanıcı(lar)ı bulur.
 *
 * Şemada iki bağ var: artist_user_link ("temsil ediyor", v1'den kalma ve
 * uygulamada FİİLEN KULLANILMIYOR) ve user_artist_access ("bu sanatçıyı
 * görebilir"). Sanatçı portalı (/hesabim) ve tüm yetki hesabı
 * user_artist_access üzerinden çalışıyor — bu yüzden bildirim hedeflemesi de
 * oraya bakmak ZORUNDA; yalnızca artist_user_link'e baksaydık üretimde
 * hiçbir sanatçıya bildirim ulaşmazdı.
 *
 * Rol süzmesi kasıtlı: bir label yöneticisine sanatçıyı görme yetkisi
 * verilmiş olabilir, ama ona "senin ödemen yapıldı" demek yanlış olur.
 * Bu yüzden yalnızca role = 'artist' olan kullanıcılar hedeflenir.
 */
export async function usersForArtist(artistId: string): Promise<string[]> {
  try {
    const rows = await query<{ user_id: string }>(
      `select u.id user_id
       from users u
       where u.status = 'active' and u.role = 'artist' and (
         exists (select 1 from user_artist_access a
                  where a.user_id = u.id and a.artist_id = $1)
         or exists (select 1 from artist_user_link l
                     where l.user_id = u.id and l.artist_id = $1)
       )`,
      [artistId]
    );
    return rows.map((r) => r.user_id);
  } catch {
    return [];
  }
}

/**
 * Bir raporda kaydı olan tüm sanatçıların kullanıcılarını bulur —
 * "yeni ödeme partisi yayınlandı" bildirimi için.
 */
export async function usersInReport(reportId: string): Promise<string[]> {
  try {
    // Etkin krediler: bir sanatçı o rapordan yalnızca DEVİR yoluyla kazanıyor
    // olabilir — o da bildirimi almalı.
    const src = await creditsSource();
    const rows = await query<{ user_id: string }>(
      `select distinct u.id user_id
       from ${src} c
       join users u on u.status = 'active' and u.role = 'artist' and (
         exists (select 1 from user_artist_access a
                  where a.user_id = u.id and a.artist_id = c.artist_id)
         or exists (select 1 from artist_user_link l
                     where l.user_id = u.id and l.artist_id = c.artist_id)
       )
       where c.report_id = $1`,
      [reportId]
    );
    return rows.map((r) => r.user_id);
  } catch {
    return [];
  }
}

/** Tüm aktif yöneticiler — sanatçı tarafından yapılan bir işlemi haber vermek için. */
export async function adminUserIds(): Promise<string[]> {
  try {
    const rows = await query<{ id: string }>(
      `select id from users where role = 'admin' and status = 'active'`
    );
    return rows.map((r) => r.id);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------- okuma tarafı */

export interface NotificationRow {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  resource: string | null;
  actionUrl: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
  readAt: string | null;
}

export interface InboxSummary {
  notifications: NotificationRow[];
  announcements: AnnouncementRow[];
  unread: number;
  unreadAnnouncements: number;
}

/** Kullanıcının bildirim kutusu — bildirimler + duyurular + okunmamış sayıları. */
export async function inboxFor(userId: string, limit = 50): Promise<InboxSummary> {
  const empty: InboxSummary = {
    notifications: [], announcements: [], unread: 0, unreadAnnouncements: 0,
  };
  try {
    const [nRows, aRows, counts] = await Promise.all([
      query<{
        id: string; type: NotificationType; title: string; body: string;
        resource: string | null; action_url: string | null;
        created_at: string; read_at: string | null;
      }>(
        `select id, type, title, body, resource, action_url, created_at, read_at
         from notifications where user_id = $1
         order by created_at desc limit $2`,
        [userId, limit]
      ),
      query<{
        id: string; title: string; body: string;
        published_at: string | null; read_at: string | null;
      }>(
        `select a.id, a.title, a.body, a.published_at, r.read_at
         from announcements a
         left join announcement_reads r on r.announcement_id = a.id and r.user_id = $1
         where a.published_at is not null
         order by a.published_at desc limit $2`,
        [userId, limit]
      ),
      queryOne<{ unread: number; unread_ann: number }>(
        `select
           (select count(*) from notifications
             where user_id = $1 and read_at is null)::int unread,
           (select count(*) from announcements a
             where a.published_at is not null
               and not exists (
                 select 1 from announcement_reads r
                 where r.announcement_id = a.id and r.user_id = $1))::int unread_ann`,
        [userId]
      ),
    ]);

    return {
      notifications: nRows.map((r) => ({
        id: r.id, type: r.type, title: r.title, body: r.body,
        resource: r.resource, actionUrl: r.action_url,
        createdAt: r.created_at, readAt: r.read_at,
      })),
      announcements: aRows.map((r) => ({
        id: r.id, title: r.title, body: r.body,
        publishedAt: r.published_at, readAt: r.read_at,
      })),
      unread: counts?.unread ?? 0,
      unreadAnnouncements: counts?.unread_ann ?? 0,
    };
  } catch (e) {
    // Tablolar henüz yoksa (0007 çalışmadıysa) uygulama çalışmaya devam etsin.
    console.error("[notify] kutu okunamadı:", e);
    return empty;
  }
}

/** Yalnızca okunmamış sayıları — kenar çubuğu rozeti için ucuz sorgu. */
export async function unreadCount(userId: string): Promise<number> {
  try {
    const r = await queryOne<{ c: number }>(
      `select (
         (select count(*) from notifications where user_id = $1 and read_at is null) +
         (select count(*) from announcements a
           where a.published_at is not null
             and not exists (select 1 from announcement_reads r
                             where r.announcement_id = a.id and r.user_id = $1))
       )::int c`,
      [userId]
    );
    return r?.c ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Okundu işaretleme.
 *
 * Yazma tarafındaki fonksiyonlarla aynı ilke: tablolar henüz yoksa (0007
 * migration'ı çalışmadıysa) istek 500 ile düşmemeli — bildirim okundu
 * işaretlenememesi, kullanıcının ekranını bozacak kadar önemli değil.
 */
export async function markRead(userId: string, id: string): Promise<void> {
  try {
    await query(
      `update notifications set read_at = coalesce(read_at, now())
       where id = $1 and user_id = $2`,
      [id, userId]
    );
  } catch (e) {
    console.error("[notify] okundu işaretlenemedi:", e);
  }
}

export async function markAnnouncementRead(userId: string, id: string): Promise<void> {
  try {
    await query(
      `insert into announcement_reads (announcement_id, user_id)
       values ($1, $2) on conflict do nothing`,
      [id, userId]
    );
  } catch (e) {
    console.error("[notify] duyuru okundu işaretlenemedi:", e);
  }
}

/** Hem bildirimleri hem duyuruları okundu işaretler. */
export async function markAllRead(userId: string): Promise<void> {
  try {
    await query(
      `update notifications set read_at = now() where user_id = $1 and read_at is null`,
      [userId]
    );
    await query(
      `insert into announcement_reads (announcement_id, user_id)
       select a.id, $1 from announcements a
       where a.published_at is not null
       on conflict do nothing`,
      [userId]
    );
  } catch (e) {
    console.error("[notify] toplu okundu işaretlenemedi:", e);
  }
}
