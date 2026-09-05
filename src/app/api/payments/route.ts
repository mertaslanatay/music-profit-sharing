import { NextResponse } from "next/server";
import { listBalances, recordPayment } from "@/lib/payments";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";
import { notifyMany, usersForArtist } from "@/lib/notify";
import { asCurrency } from "@/lib/types";

export const runtime = "nodejs";

/** Bakiye listesi — tüm sanatçıların rakamlarını içerdiği için yalnızca admin. */
export async function GET() {
  try {
    await requireAdmin("balances_denied");
    return NextResponse.json({ balances: await listBalances() });
  } catch (e) { return denyResponse(e); }
}

/** Ödeme kaydet. Para hareketi olduğu için her zaman denetim kaydına yazılır. */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin("payment_create_denied");
    const body = await req.json();
    const out = await recordPayment({
      artistId: String(body.artistId),
      allocations: (body.allocations ?? []).map((a: { periodId: string; amountUsd: number }) => ({
        periodId: String(a.periodId),
        amountUsd: Number(a.amountUsd),
      })),
      paidCurrency: asCurrency(body.paidCurrency),
      paidAmount: Number(body.paidAmount),
      exchangeRate: body.exchangeRate === undefined || body.exchangeRate === null || body.exchangeRate === ""
        ? null : Number(body.exchangeRate),
      note: body.note ?? null,
      paidAt: body.paidAt ?? null,
      createdBy: admin?.userId ?? null,
    });
    const paid = Number(body.paidAmount);
    const cur = asCurrency(body.paidCurrency);
    await notifyMany(await usersForArtist(String(body.artistId)), {
      type: "payment",
      title: "Ödemen kaydedildi",
      body: `${paid.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur} tutarındaki ödemen hesabına işlendi.`,
      resource: `artist:${body.artistId}`,
      actionUrl: "/hesabim",
      createdBy: admin?.userId ?? null,
    });

    await logAction(admin, "payment_recorded", `artist:${body.artistId}`, {
      paidAmount: Number(body.paidAmount),
      currency: asCurrency(body.paidCurrency),
      periods: (body.allocations ?? []).length,
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) { return denyResponse(e); }
}
