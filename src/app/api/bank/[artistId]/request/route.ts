import { NextResponse } from "next/server";
import { createBankChangeRequest } from "@/lib/payments";
import { requireArtistAccess, denyResponse, logAction } from "@/lib/guard";
import { notifyMany, adminUserIds } from "@/lib/notify";
import { asCurrency } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Sanatçı banka bilgisi değişikliği ister. Hemen geçerli olmaz — admin
 * onaylayana kadar eski bilgi kullanılır (bkz. lib/payments.ts).
 */
export async function POST(req: Request, ctx: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await ctx.params;
  try {
    const viewer = await requireArtistAccess(artistId);
    const b = await req.json();
    const out = await createBankChangeRequest({
      artistId,
      requestedBy: viewer?.userId ?? null,
      accountHolder: String(b.accountHolder ?? ""),
      bankName: String(b.bankName ?? ""),
      iban: String(b.iban ?? ""),
      currency: asCurrency(b.currency),
      note: b.note ?? null,
    });
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: 400 });
    // IBAN'ın tamamı denetim kaydına yazılmaz — son 4 hane kimliklemeye yeter.
    await notifyMany(await adminUserIds(), {
      type: "bank",
      title: "Yeni banka bilgisi talebi",
      body: `${viewer?.fullName || "Bir sanatçı"} IBAN/banka bilgisi değişikliği istedi. Onayını bekliyor.`,
      resource: `artist:${artistId}`,
      actionUrl: "/admin",
      createdBy: viewer?.userId ?? null,
    });
    await logAction(viewer, "bank_change_requested", `artist:${artistId}`, {
      ibanSon4: String(b.iban ?? "").replace(/\s+/g, "").slice(-4),
    });
    return NextResponse.json({ ok: true, id: out.id });
  } catch (e) {
    return denyResponse(e);
  }
}
