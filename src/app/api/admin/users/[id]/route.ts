import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, transaction } from "@/lib/db";
import { requireAdmin, logAction, denyResponse } from "@/lib/guard";
import { supabaseAdmin, authConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const VALID_ROLES = ["admin", "label_manager", "artist", "accountant"] as const;
const VALID_STATUSES = ["active", "suspended"] as const;

/**
 * PATCH /api/admin/users/[id]
 *
 * Kullanıcı durumunu, rolünü, bayraklarını ve erişim kapsamını günceller.
 * Kabul edilen alanlar:
 *   action:  "approve" | "reject" | "suspend" | "reactivate"
 *   role:    "admin" | "label_manager" | "artist" | "accountant"
 *   canSeeLabelTotals:  boolean
 *   canSeeOtherArtists: boolean
 *   statusNote: string
 *   labelIds:  string[]   — atanacak label id'leri (mevcut set değiştirilir)
 *   artistIds: string[]   — atanacak sanatçı id'leri
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin("admin_user_update_denied");
    const { id } = await params;
    const body = await req.json();

    // Hedef kullanıcıyı bul
    const target = await queryOne<{
      id: string; email: string; role: string; status: string; auth_id: string | null;
    }>(`select id, email, role, status, auth_id from users where id = $1`, [id]);

    if (!target) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
    }

    // Admin kendini askıya alamaz / düşüremez
    if (admin && target.id === admin.userId) {
      if (body.action === "suspend" || body.action === "reject") {
        return NextResponse.json(
          { error: "Kendinizi askıya alamazsınız." }, { status: 400 }
        );
      }
      if (body.role && body.role !== "admin") {
        return NextResponse.json(
          { error: "Kendi rolünüzü düşüremezsiniz." }, { status: 400 }
        );
      }
    }

    await transaction(async (c) => {
      // --- Durum değişiklikleri ---
      if (body.action === "approve") {
        await c.query(
          `update users set status = 'active', approved_at = now(), approved_by = $2,
           status_note = null where id = $1`,
          [id, admin?.userId]
        );
      } else if (body.action === "reject") {
        await c.query(
          `update users set status = 'suspended', status_note = $2 where id = $1`,
          [id, body.statusNote || "Kayıt reddedildi."]
        );
        // Supabase Auth'tan da kullanıcıyı devre dışı bırak (varsa)
        if (authConfigured() && target.auth_id) {
          const sb = supabaseAdmin();
          await sb.auth.admin.updateUserById(target.auth_id, { ban_duration: "876000h" });
        }
      } else if (body.action === "suspend") {
        await c.query(
          `update users set status = 'suspended', status_note = $2 where id = $1`,
          [id, body.statusNote || "Hesap askıya alındı."]
        );
        if (authConfigured() && target.auth_id) {
          const sb = supabaseAdmin();
          await sb.auth.admin.updateUserById(target.auth_id, { ban_duration: "876000h" });
        }
      } else if (body.action === "reactivate") {
        await c.query(
          `update users set status = 'active', status_note = null where id = $1`,
          [id]
        );
        if (authConfigured() && target.auth_id) {
          const sb = supabaseAdmin();
          await sb.auth.admin.updateUserById(target.auth_id, { ban_duration: "none" });
        }
      }

      // --- Rol değişikliği ---
      if (body.role && VALID_ROLES.includes(body.role)) {
        await c.query(`update users set role = $2 where id = $1`, [id, body.role]);
      }

      // --- Görünürlük bayrakları ---
      if (typeof body.canSeeLabelTotals === "boolean") {
        await c.query(
          `update users set can_see_label_totals = $2 where id = $1`,
          [id, body.canSeeLabelTotals]
        );
      }
      if (typeof body.canSeeOtherArtists === "boolean") {
        await c.query(
          `update users set can_see_other_artists = $2 where id = $1`,
          [id, body.canSeeOtherArtists]
        );
      }

      // --- Label erişimi ---
      if (Array.isArray(body.labelIds)) {
        await c.query(`delete from user_label_access where user_id = $1`, [id]);
        const role = body.role || target.role;
        for (const labelId of body.labelIds) {
          await c.query(
            `insert into user_label_access (user_id, label_id, role) values ($1, $2, $3)
             on conflict do nothing`,
            [id, labelId, role]
          );
        }
      }

      // --- Sanatçı erişimi ---
      if (Array.isArray(body.artistIds)) {
        await c.query(`delete from user_artist_access where user_id = $1`, [id]);
        for (const artistId of body.artistIds) {
          await c.query(
            `insert into user_artist_access (user_id, artist_id) values ($1, $2)
             on conflict do nothing`,
            [id, artistId]
          );
        }
      }
    });

    // Denetim kaydı
    await logAction(admin, "admin_user_update", `user:${id}`, {
      target: target.email,
      action: body.action || "update",
      role: body.role,
      labelIds: body.labelIds,
      artistIds: body.artistIds,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}

/**
 * DELETE /api/admin/users/[id]
 *
 * Kullanıcıyı ve Supabase Auth kaydını tamamen siler.
 * Yalnızca henüz onaylanmamış (pending) kullanıcılar silinebilir.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin("admin_user_delete_denied");
    const { id } = await params;

    const target = await queryOne<{
      id: string; email: string; status: string; auth_id: string | null;
    }>(`select id, email, status, auth_id from users where id = $1`, [id]);

    if (!target) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
    }

    if (target.status === "active") {
      return NextResponse.json(
        { error: "Aktif kullanıcılar silinemez. Önce askıya alın." },
        { status: 400 }
      );
    }

    // Supabase Auth'tan sil
    if (authConfigured() && target.auth_id) {
      const sb = supabaseAdmin();
      await sb.auth.admin.deleteUser(target.auth_id);
    }

    await query(`delete from users where id = $1`, [id]);

    await logAction(admin, "admin_user_delete", `user:${id}`, {
      target: target.email,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
