import { NextResponse } from "next/server";
import { getArtistLedger } from "@/lib/payments";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const led = await getArtistLedger(id);
    if (!led) return NextResponse.json({ error: "Sanatçı bulunamadı." }, { status: 404 });
    return NextResponse.json(led);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bilinmeyen hata" }, { status: 500 });
  }
}
