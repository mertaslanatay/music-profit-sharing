import { NextResponse } from "next/server";
import { deletePayment } from "@/lib/payments";

export const runtime = "nodejs";

/** Yanlış girilen ödemeyi geri al. Varsa kapattığı istek tekrar açılır. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    await deletePayment(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bilinmeyen hata" },
      { status: 500 }
    );
  }
}
