import { query } from "./db";
import { cachedByVersion } from "./dashboardCache";
import type { UserListRow } from "@/app/api/admin/users/route";
import { isAdmin, isLabelManager, type Viewer } from "./access";

/**
 * Label yöneticisi kapsamı — "bu label'a ait" sanatçılar ve kullanıcılar.
 *
 * Bir sanatçı, bir label'da kredisi varsa o label'a aittir (birden fazla
 * label'da çıkan sanatçı — ör. Çiğ — her iki label'ın kapsamındadır).
 * Bir kullanıcı, o label'a doğrudan atanmışsa (user_label_access) ya da
 * hesabına bağlı sanatçılardan biri o label'a aitse kapsamdadır.
 */

/** Label'larda kredisi olan sanatçılar — veri sürümüne göre önbellekli. */
export async function labelArtistIds(labelIds: string[]): Promise<string[]> {
  if (labelIds.length === 0) return [];
  const key = `label-artists:${[...labelIds].sort().join(",")}`;
  return cachedByVersion(key, async () => {
    const rows = await query<{ artist_id: string }>(
      `select distinct artist_id from credits where label_id = any($1::uuid[])`,
      [labelIds]
    );
    return rows.map((r) => r.artist_id);
  });
}

/**
 * Kapsamdaki kullanıcılar. `withUnassignedPending`: henüz hiçbir label'a /
 * sanatçıya atanmamış bekleyen kayıtlar da dönsün (label yöneticisi yeni
 * kaydı onaylayıp kendi label'ına atayabilsin diye). Yöneticiler hiçbir
 * zaman dönmez.
 */
export async function labelUserIds(
  labelIds: string[],
  opts: { withUnassignedPending?: boolean } = {}
): Promise<string[]> {
  if (labelIds.length === 0) return [];
  const artists = await labelArtistIds(labelIds);
  const rows = await query<{ id: string }>(
    `select u.id from users u
     where u.role <> 'admin' and (
       exists (select 1 from user_label_access a where a.user_id = u.id and a.label_id = any($1::uuid[]))
       or exists (select 1 from user_artist_access a where a.user_id = u.id and a.artist_id = any($2::uuid[]))
       or ($3::boolean and u.status = 'pending'
           and not exists (select 1 from user_label_access a where a.user_id = u.id)
           and not exists (select 1 from user_artist_access a where a.user_id = u.id))
     )`,
    [labelIds, artists, !!opts.withUnassignedPending]
  );
  return rows.map((r) => r.id);
}

/* ------------------------------------------------ kullanıcı listesi */


/**
 * Yönetim › Kullanıcılar verisi. labelIds = null → herkes (yönetici);
 * aksi hâlde yalnızca kapsamdaki kullanıcılar, yalnızca o label'lar ve
 * o label'ların sanatçıları (atama seçenekleri). Kapsamdaki bir kullanıcının
 * BAŞKA label / sanatçı atamaları label yöneticisine gönderilmez.
 */
export async function loadUsersFor(labelIds: string[] | null): Promise<{
  users: UserListRow[];
  labels: { id: string; name: string }[];
  artists: { id: string; name: string }[];
}> {
  const scopedIds = labelIds ? await labelUserIds(labelIds, { withUnassignedPending: true }) : null;
  const scopedArtists = labelIds ? await labelArtistIds(labelIds) : null;
  const [rows, labels, artists] = await Promise.all([
    query<{
      id: string; email: string; first_name: string; last_name: string;
      artist_name: string | null; role: string; status: string; status_note: string | null;
      can_see_label_totals: boolean; can_see_other_artists: boolean;
      created_at: string; approved_at: string | null; last_seen_at: string | null;
      label_ids: string[] | null; artist_ids: string[] | null;
    }>(
      `select * from v_user_access
       where ($1::uuid[] is null or id = any($1::uuid[]))
       order by case status when 'pending' then 0 when 'active' then 1 else 2 end, created_at desc`,
      [scopedIds]
    ),
    query<{ id: string; name: string }>(
      `select id, name from labels where ($1::uuid[] is null or id = any($1::uuid[])) order by name`,
      [labelIds]
    ),
    query<{ id: string; display_name: string }>(
      `select id, display_name from artists where ($1::uuid[] is null or id = any($1::uuid[])) order by display_name`,
      [scopedArtists]
    ),
  ]);
  const lset = labelIds ? new Set(labelIds) : null;
  const aset = scopedArtists ? new Set(scopedArtists) : null;
  return {
    users: rows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      artistName: r.artist_name,
      role: r.role,
      status: r.status,
      statusNote: r.status_note,
      canSeeLabelTotals: r.can_see_label_totals,
      canSeeOtherArtists: r.can_see_other_artists,
      createdAt: r.created_at,
      approvedAt: r.approved_at,
      lastSeenAt: r.last_seen_at,
      labelIds: (r.label_ids ?? []).filter((x) => !lset || lset.has(x)),
      artistIds: (r.artist_ids ?? []).filter((x) => !aset || aset.has(x)),
    })),
    labels,
    artists: artists.map((a) => ({ id: a.id, name: a.display_name })),
  };
}

/* ------------------------------------- label yöneticisi: kullanıcı düzenleme */

export interface UserPatchBody {
  action?: string;
  role?: string;
  canSeeLabelTotals?: boolean;
  canSeeOtherArtists?: boolean;
  statusNote?: string;
  labelIds?: string[];
  artistIds?: string[];
}

/**
 * Label yöneticisinin kullanıcı güncellemesini sınırlar ve TAM kümelere
 * çevirir (route'un geri kalanı yöneticiyle aynı yazma kodunu kullanır).
 *
 *  - Yalnızca kapsamdaki SANATÇI hesapları; kendi hesabı ve personel değil.
 *  - Durum: yalnızca bekleyen kaydı onaylama. Askıya alma / ret / yeniden
 *    açma yöneticide — birden fazla label'lı bir sanatçının hesabını tek bir
 *    label yöneticisinin kapatabilmesi istenmedi.
 *  - Rol değiştiremez.
 *  - Label / sanatçı ataması: yalnızca KENDİ label'ları ve onların
 *    sanatçıları eklenip çıkarılır; kullanıcının diğer atamaları aynen kalır.
 *  - Görünürlük bayrakları: yalnızca kullanıcının tüm erişimi bu label
 *    yöneticisinin kapsamındaysa (bayraklar kullanıcının TÜM label'larını etkiler).
 */
export async function limitUserPatch(
  labelIds: string[],
  selfId: string,
  target: { id: string; role: string; status: string },
  body: UserPatchBody
): Promise<{ body: UserPatchBody } | { error: string; status: number }> {
  if (target.id === selfId) return { error: "Kendi hesabını buradan düzenleyemezsin.", status: 403 };
  const inScope = new Set(await labelUserIds(labelIds, { withUnassignedPending: true }));
  if (!inScope.has(target.id)) return { error: "Kullanıcı bulunamadı.", status: 404 };
  if (target.role !== "artist") return { error: "Yalnızca sanatçı hesaplarını düzenleyebilirsin.", status: 403 };
  if (body.action && body.action !== "approve") {
    return { error: "Askıya alma ve reddetme yalnızca yöneticide.", status: 403 };
  }
  if (body.action === "approve" && target.status !== "pending") {
    return { error: "Bu hesap onay beklemiyor.", status: 400 };
  }
  if (body.role && body.role !== target.role) return { error: "Rol değiştirme yalnızca yöneticide.", status: 403 };

  const mine = new Set(labelIds);
  const myArtists = new Set(await labelArtistIds(labelIds));
  const cur = await query<{ label_ids: string[] | null; artist_ids: string[] | null }>(
    `select label_ids, artist_ids from v_user_access where id = $1`, [target.id]
  );
  const curLabels = cur[0]?.label_ids ?? [];
  const curArtists = cur[0]?.artist_ids ?? [];

  let finalLabels = curLabels;
  if (Array.isArray(body.labelIds)) {
    const want = body.labelIds.map(String);
    if (want.some((x) => !mine.has(x))) return { error: "Yalnızca kendi label'larını atayabilirsin.", status: 403 };
    finalLabels = [...new Set([...curLabels.filter((x) => !mine.has(x)), ...want])];
  }
  let finalArtists = curArtists;
  if (Array.isArray(body.artistIds)) {
    const want = body.artistIds.map(String);
    if (want.some((x) => !myArtists.has(x))) return { error: "Yalnızca kendi label'larındaki sanatçıları atayabilirsin.", status: 403 };
    finalArtists = [...new Set([...curArtists.filter((x) => !myArtists.has(x)), ...want])];
  }

  const flags = typeof body.canSeeLabelTotals === "boolean" || typeof body.canSeeOtherArtists === "boolean";
  if (flags) {
    const allMine = finalLabels.every((x) => mine.has(x)) && finalArtists.every((x) => myArtists.has(x));
    if (!allMine) {
      return { error: "Bu kullanıcının başka label'larda da erişimi var; görünürlük ayarlarını yalnızca yönetici değiştirebilir.", status: 403 };
    }
  }
  if (body.action === "approve") {
    const hasMine = finalLabels.some((x) => mine.has(x)) || finalArtists.some((x) => myArtists.has(x));
    if (!hasMine) return { error: "Onaylamadan önce kendi label'ından bir label veya sanatçı ata.", status: 400 };
  }

  return {
    body: {
      action: body.action,
      canSeeLabelTotals: body.canSeeLabelTotals,
      canSeeOtherArtists: body.canSeeOtherArtists,
      labelIds: Array.isArray(body.labelIds) ? finalLabels : undefined,
      artistIds: Array.isArray(body.artistIds) ? finalArtists : undefined,
    },
  };
}

/* --------------------------------------------- mesajlar: personel tarafı */


/**
 * Bu kullanıcı, sahibi `ownerId` olan konuşmaya "Label ekibi" tarafından
 * bakabilir mi? Yönetici her konuşmaya; label yöneticisi yalnızca kendi
 * label kapsamındaki kullanıcılarınkine (kendi konuşmasında o kullanıcı
 * tarafıdır, personel değil).
 */
export async function staffSideFor(viewer: Viewer, ownerId: string): Promise<boolean> {
  if (ownerId === viewer.userId) return false;
  if (isAdmin(viewer)) return true;
  if (!isLabelManager(viewer)) return false;
  return (await labelUserIds(viewer.labelIds)).includes(ownerId);
}

/** Bir kullanıcının label'larının label yöneticileri (bildirim için). */
export async function labelManagersOf(userId: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `select distinct m.id from users m
     join user_label_access ml on ml.user_id = m.id
     where m.role = 'label_manager' and m.status = 'active' and m.id <> $1
       and (exists (select 1 from user_label_access a where a.user_id = $1 and a.label_id = ml.label_id)
            or exists (select 1 from user_artist_access a join credits c on c.artist_id = a.artist_id
                       where a.user_id = $1 and c.label_id = ml.label_id))`,
    [userId]
  );
  return rows.map((r) => r.id);
}
