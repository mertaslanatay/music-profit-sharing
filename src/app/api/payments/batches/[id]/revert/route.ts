import { NextResponse } from "next/server";
import { revertBatch } from "@/lib/payments";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";
import { notifyMany, usersForArtist } from "@/lib/notify";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Toplu kapatmayı geri al. Gövde: { notify?: boolean }
 * notify açıksa geri alınan her sanatçıya "ödeme kaydın düzeltildi" bildirimi.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const admin = await requireAdmin("payment_delete_denied");
    if (!UUID.test(id)) return NextResponse.json({ error: "Geçersiz işlem." }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const out = await revertBatch(id.toLowerCase(), admin?.userId ?? null);

    for (const r of out.reverted) {
      await logAction(admin, "payment_deleted", `payment:${r.paymentId}`, { via: "bulk_revert", batchId: id });
      if (body.notify) {
        try {
          await notifyMany(await usersForArtist(r.artistId), {
            type: "payment",
            title: "Ödeme kaydın düzeltildi",
            body: `${r.paidAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${r.currency} tutarındaki ödeme kaydı hatalı girildiği için geri alındı. Bakiyen güncellendi.`,
            resource: `artist:${r.artistId}`,
            actionUrl: "/hesabim",
            createdBy: admin?.userId ?? null,
          });
        } catch { /* bildirim geri almayı düşürmez */ }
      }
    }
    await logAction(admin, "payment_bulk_revert", `batch:${id}`, {
      reverted: out.reverted.length,
      locked: out.locked,
      amountUsd: Math.round(out.reverted.reduce((a, r) => a + r.amountUsd, 0) * 100) / 100,
      notified: !!body.notify,
    });
    return NextResponse.json({
      reverted: out.reverted.length,
      amountUsd: out.reverted.reduce((a, r) => a + r.amountUsd, 0),
      locked: out.locked,
    });
  } catch (e) { return denyResponse(e); }
}
