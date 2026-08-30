import { NextResponse } from "next/server";
import { setRequestStatus } from "@/lib/payments";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const admin = await requireAdmin("request_patch_denied");
    const b = await req.json();
    const s = b.status;
    if (!["rejected", "cancelled", "pending"].includes(s)) {
      return NextResponse.json({ error: "Geçersiz durum." }, { status: 400 });
    }
    await setRequestStatus(id, s, b.adminNote ?? null);
    await logAction(admin, "request_status_changed", `request:${id}`, { status: s });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
