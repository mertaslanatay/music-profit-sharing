import { NextResponse } from "next/server";
import { filterBreakdown, getPaymentBreakdown } from "@/lib/payments";
import { requireStaff, denyResponse } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Label / ödeme partisi kırılımı. Yönetici tümünü, label yöneticisi
 * yalnızca kendi label'larının hücrelerini alır (sunucuda süzülür).
 */
export async function GET() {
  try {
    const st = await requireStaff("balances_denied");
    const bd = await getPaymentBreakdown();
    return NextResponse.json(st.labelIds ? filterBreakdown(bd, st.labelIds) : bd);
  } catch (e) { return denyResponse(e); }
}
