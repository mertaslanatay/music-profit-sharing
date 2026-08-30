import { NextResponse } from "next/server";
import { createRequest, listRequests } from "@/lib/payments";
import { requireAdmin, requireArtistAccess, denyResponse, logAction } from "@/lib/guard";

export const runtime = "nodejs";

/** Admin: tüm ödeme isteklerini listeler (durum filtresi opsiyonel). */
export async function GET(req: Request) {
  try {
    const admin = await requireAdmin("payment_requests_list_denied");
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as
      | "pending" | "paid" | "rejected" | "cancelled" | null;
    const requests = await listRequests(status ?? undefined);
    void admin;
    return NextResponse.json({ requests });
  } catch (e) {
    return denyResponse(e);
  }
}

/**
 * Sanatçı kendi bakiyesi için ödeme isteği açar. Tutar elle girilmez —
 * o anki bakiyedir (bkz. lib/payments.ts → createRequest).
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const artistId = String(body.artistId ?? "");
    const viewer = await requireArtistAccess(artistId);
    const out = await createRequest(artistId, body.note ?? null);
    if ("error" in out) return NextResponse.json({ error: out.error }, { status: 400 });
    await logAction(viewer, "payment_request_created", `artist:${artistId}`);
    return NextResponse.json({ ok: true, id: out.id });
  } catch (e) {
    return denyResponse(e);
  }
}
