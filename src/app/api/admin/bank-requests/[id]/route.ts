import { NextResponse } from "next/server";
import { resolveBankChangeRequest } from "@/lib/payments";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";
import { queryOne } from "@/lib/db";
import { notifyMany, usersForArtist } from "@/lib/notify";

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

    // Sanatçı IBAN'ını doğrudan değiştiremiyor, istek açıyor — sonucu
    // öğrenmesi gerekiyor.
    const reqRow = await queryOne<{ artist_id: string }>(
      `select artist_id from bank_change_requests where id = $1`, [id]
    );
    if (reqRow) {
      await notifyMany(await usersForArtist(reqRow.artist_id), {
        type: "bank",
        title: action === "approve" ? "Banka bilgin güncellendi" : "Banka bilgisi talebin reddedildi",
        body: action === "approve"
          ? "Gönderdiğin IBAN/banka bilgisi onaylandı ve hesabına işlendi."
          : `Gönderdiğin banka bilgisi değişikliği onaylanmadı.${b.adminNote ? ` Not: ${String(b.adminNote).slice(0, 300)}` : ""}`,
        resource: `request:${id}`,
        actionUrl: "/hesabim",
        createdBy: admin?.userId ?? null,
      });
    }

    await logAction(admin, "bank_change_resolved", `request:${id}`, { action });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
