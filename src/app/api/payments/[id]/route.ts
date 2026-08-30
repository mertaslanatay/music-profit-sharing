import { NextResponse } from "next/server";
import { deletePayment } from "@/lib/payments";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";

export const runtime = "nodejs";

/** Yanlış girilen ödemeyi geri al. Varsa kapattığı istek tekrar açılır. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const admin = await requireAdmin("payment_delete_denied");
    await deletePayment(id);
    await logAction(admin, "payment_deleted", `payment:${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
