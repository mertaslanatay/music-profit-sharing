import { NextResponse } from "next/server";
import { getArtistLedger } from "@/lib/payments";
import { requireArtistAccess, denyResponse, logAction } from "@/lib/guard";

export const runtime = "nodejs";

/**
 * Bir sanatçının dönem dönem hakedişi, ödemeleri ve bakiyesi.
 * Sanatçı kendi defterini görür; yönetici hepsini.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const viewer = await requireArtistAccess(id);
    const led = await getArtistLedger(id);
    if (!led) return NextResponse.json({ error: "Sanatçı bulunamadı." }, { status: 404 });
    await logAction(viewer, "view_ledger", `artist:${id}`);
    return NextResponse.json(led);
  } catch (e) {
    return denyResponse(e);
  }
}
