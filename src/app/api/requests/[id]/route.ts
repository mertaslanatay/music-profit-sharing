import { NextResponse } from "next/server";
import { setRequestStatus } from "@/lib/payments";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";
import { queryOne } from "@/lib/db";
import { notifyMany, usersForArtist } from "@/lib/notify";

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
    const reqRow = await queryOne<{ artist_id: string }>(
      `select artist_id from payment_requests where id = $1`, [id]
    );
    await setRequestStatus(id, s, b.adminNote ?? null);

    if (reqRow) {
      const baslik: Record<string, string> = {
        rejected: "Ödeme talebin reddedildi",
        cancelled: "Ödeme talebin iptal edildi",
        pending: "Ödeme talebin yeniden açıldı",
      };
      await notifyMany(await usersForArtist(reqRow.artist_id), {
        type: "request",
        title: baslik[s] ?? "Ödeme talebinin durumu değişti",
        body: b.adminNote ? String(b.adminNote).slice(0, 300) : "Durumu hesabım ekranından görebilirsin.",
        resource: `request:${id}`,
        actionUrl: "/hesabim",
        createdBy: admin?.userId ?? null,
      });
    }

    await logAction(admin, "request_status_changed", `request:${id}`, { status: s });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
