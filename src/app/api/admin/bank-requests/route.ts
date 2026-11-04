import { NextResponse } from "next/server";
import { listBankChangeRequests } from "@/lib/payments";
import { requireStaff, denyResponse } from "@/lib/guard";
import { labelArtistIds } from "@/lib/staff";

export const dynamic = "force-dynamic";

/**
 * Banka değişiklik isteklerini listeler (varsayılan: hepsi). Label
 * yöneticisi yalnızca kendi label'larındaki sanatçılarınkini görür;
 * onay/ret yalnızca yöneticide ([id] PATCH).
 */
export async function GET(req: Request) {
  try {
    const st = await requireStaff("bank_requests_list_denied");
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as "pending" | "approved" | "rejected" | null;
    let requests = await listBankChangeRequests(status ?? undefined);
    if (st.labelIds) {
      const mine = new Set(await labelArtistIds(st.labelIds));
      requests = requests.filter((r) => mine.has(r.artistId));
    }
    return NextResponse.json({ requests });
  } catch (e) {
    return denyResponse(e);
  }
}
