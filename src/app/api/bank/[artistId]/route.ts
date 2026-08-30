import { NextResponse } from "next/server";
import { upsertBank, getBankAccount, getOpenBankChangeRequest } from "@/lib/payments";
import { requireAdmin, requireArtistAccess, denyResponse, logAction } from "@/lib/guard";

export const runtime = "nodejs";

/** Banka bilgisi görüntüleme — sanatçı kendisininkini, admin herkesinkini görür. */
export async function GET(_req: Request, ctx: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await ctx.params;
  try {
    await requireArtistAccess(artistId);
    const [bank, openRequest] = await Promise.all([
      getBankAccount(artistId),
      getOpenBankChangeRequest(artistId),
    ]);
    return NextResponse.json({ bank, openRequest });
  } catch (e) {
    return denyResponse(e);
  }
}

/**
 * Banka bilgisi güncelleme — YALNIZCA yönetici.
 *
 * Sanatçı kendi IBAN'ını doğrudan değiştiremez; değişiklik isteği açar ve
 * yönetici onaylar (bank_change_requests). Bir hesap ele geçirilse bile
 * para başka bir yere gitmesin diye.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ artistId: string }> }) {
  const { artistId } = await ctx.params;
  try {
    const admin = await requireAdmin("bank_update_denied");
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
    // IBAN'ın tamamı kaydedilmez — son 4 hane kimliklemeye yeter.
    await logAction(admin, "bank_updated", `artist:${artistId}`, {
      bank: String(b.bankName ?? ""), ibanSon4: iban.slice(-4), currency: b.currency ?? "USD",
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
