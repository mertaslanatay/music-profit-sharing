import { NextResponse } from "next/server";
import { setRequestStatus } from "@/lib/payments";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const b = await req.json();
    const s = b.status;
    if (!["rejected", "cancelled", "pending"].includes(s)) {
      return NextResponse.json({ error: "Geçersiz durum." }, { status: 400 });
    }
    await setRequestStatus(id, s, b.adminNote ?? null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bilinmeyen hata" }, { status: 500 });
  }
}
