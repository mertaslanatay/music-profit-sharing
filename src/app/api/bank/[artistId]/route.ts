import { NextResponse } from "next/server";
import { upsertBank } from "@/lib/payments";

export const runtime = "nodejs";

export async function PUT(req: Request, ctx: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await ctx.params;
  try {
    const b = await req.json();
    const iban = String(b.iban ?? "").replace(/\s+/g, "").toUpperCase();
    // Hafif format kontrolü — IBAN ülke kodu + 2 hane ile başlar.
    if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) {
      return NextResponse.json(
        { error: "IBAN biçimi geçersiz görünüyor. Örnek: TR33 0006 1005 1978 6457 8413 26" },
        { status: 400 }
      );
    }
    await upsertBank(artistId, {
      accountHolder: String(b.accountHolder ?? ""),
      bankName: String(b.bankName ?? ""),
      iban,
      currency: b.currency === "TRY" ? "TRY" : "USD",
      note: b.note ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bilinmeyen hata" }, { status: 500 });
  }
}
