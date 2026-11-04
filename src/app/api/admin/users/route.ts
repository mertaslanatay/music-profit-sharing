import { NextResponse } from "next/server";
import { requireStaff, logAction, denyResponse } from "@/lib/guard";
import { loadUsersFor } from "@/lib/staff";

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
 * GET /api/admin/users — kullanıcılar ve yetki seçenekleri. Yönetici herkesi,
 * label yöneticisi yalnızca kendi label kapsamını görür (bkz. loadUsersFor).
 */
export async function GET() {
  try {
    const st = await requireStaff("admin_users_list_denied");
    const out = await loadUsersFor(st.labelIds);
    await logAction(st.viewer, "admin_users_list", null, { count: out.users.length, scoped: !!st.labelIds });
    return NextResponse.json(out);
  } catch (e) {
    return denyResponse(e);
  }
}
