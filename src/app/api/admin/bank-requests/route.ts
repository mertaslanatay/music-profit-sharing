import { NextResponse } from "next/server";
import { listBankChangeRequests } from "@/lib/payments";
import { requireAdmin, denyResponse } from "@/lib/guard";

export const dynamic = "force-dynamic";

/** Admin: banka değişiklik isteklerini listeler (varsayılan: hepsi). */
export async function GET(req: Request) {
  try {
    await requireAdmin("bank_requests_list_denied");
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as "pending" | "approved" | "rejected" | null;
    const requests = await listBankChangeRequests(status ?? undefined);
    return NextResponse.json({ requests });
  } catch (e) {
    return denyResponse(e);
  }
}
