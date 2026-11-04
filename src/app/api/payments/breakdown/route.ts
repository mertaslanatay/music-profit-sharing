import { NextResponse } from "next/server";
import { getPaymentBreakdown } from "@/lib/payments";
import { requireAdmin, denyResponse } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Label / ödeme partisi kırılımı — tüm sanatçıların rakamları, yalnızca admin. */
export async function GET() {
  try {
    await requireAdmin("balances_denied");
    return NextResponse.json(await getPaymentBreakdown());
  } catch (e) { return denyResponse(e); }
}
