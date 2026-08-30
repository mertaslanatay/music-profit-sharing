import { NextResponse } from "next/server";
import { listBalances, recordPayment } from "@/lib/payments";

export const runtime = "nodejs";

const fail = (e: unknown, code = 500) =>
  NextResponse.json({ error: e instanceof Error ? e.message : "Bilinmeyen hata" }, { status: code });

export async function GET() {
  try {
    return NextResponse.json({ balances: await listBalances() });
  } catch (e) { return fail(e); }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const out = await recordPayment({
      artistId: String(body.artistId),
      allocations: (body.allocations ?? []).map((a: { periodId: string; amountUsd: number }) => ({
        periodId: String(a.periodId),
        amountUsd: Number(a.amountUsd),
      })),
      paidCurrency: body.paidCurrency === "TRY" ? "TRY" : "USD",
      paidAmount: Number(body.paidAmount),
      exchangeRate: body.exchangeRate === undefined || body.exchangeRate === null || body.exchangeRate === ""
        ? null : Number(body.exchangeRate),
      note: body.note ?? null,
      paidAt: body.paidAt ?? null,
    });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) { return fail(e, 400); }
}
