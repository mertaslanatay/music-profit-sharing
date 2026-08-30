import { NextResponse } from "next/server";
import { resolveBankChangeRequest } from "@/lib/payments";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";

export const dynamic = "force-dynamic";

/** Admin: banka değişiklik isteğini onaylar/reddeder. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const admin = await requireAdmin("bank_request_resolve_denied");
    const b = await req.json();
    const action = b.action === "approve" ? "approve" : b.action === "reject" ? "reject" : null;
    if (!action) return NextResponse.json({ error: "Geçersiz işlem." }, { status: 400 });

    const out = await resolveBankChangeRequest(id, action, admin?.userId ?? null, b.adminNote ?? null);
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: 400 });

    await logAction(admin, "bank_change_resolved", `request:${id}`, { action });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
