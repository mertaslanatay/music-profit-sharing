import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin, logAction, denyResponse } from "@/lib/guard";

export const dynamic = "force-dynamic";

export interface UserListRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  artistName: string | null;
  role: string;
  status: string;
  statusNote: string | null;
  canSeeLabelTotals: boolean;
  canSeeOtherArtists: boolean;
  createdAt: string;
  approvedAt: string | null;
  lastSeenAt: string | null;
  labelIds: string[];
  artistIds: string[];
}

/**
 * GET /api/admin/users — Tüm kullanıcıları yetki bilgileriyle listeler.
 */
export async function GET() {
  try {
    const v = await requireAdmin("admin_users_list_denied");

    const rows = await query<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      artist_name: string | null;
      role: string;
      status: string;
      status_note: string | null;
      can_see_label_totals: boolean;
      can_see_other_artists: boolean;
      created_at: string;
      approved_at: string | null;
      last_seen_at: string | null;
      label_ids: string[];
      artist_ids: string[];
    }>(
      `select * from v_user_access order by
         case status when 'pending' then 0 when 'active' then 1 else 2 end,
         created_at desc`
    );

    const users: UserListRow[] = rows.map((r) => ({
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
      labelIds: r.label_ids ?? [],
      artistIds: r.artist_ids ?? [],
    }));

    // Atanabilir label ve sanatçı listesi (yetki atama ekranı için)
    const labels = await query<{ id: string; name: string }>(
      `select id, name from labels order by name`
    );
    const artists = await query<{ id: string; display_name: string }>(
      `select id, display_name from artists order by display_name`
    );

    await logAction(v, "admin_users_list", null, { count: users.length });

    return NextResponse.json({
      users,
      labels: labels.map((l) => ({ id: l.id, name: l.name })),
      artists: artists.map((a) => ({ id: a.id, name: a.display_name })),
    });
  } catch (e) {
    return denyResponse(e);
  }
}
