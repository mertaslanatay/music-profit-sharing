import { NextResponse } from "next/server";
import { listBatches } from "@/lib/payments";
import { requireAdmin, denyResponse } from "@/lib/guard";

export const runtime = "nodejs";

/** Son toplu kapatma işlemleri — yalnızca admin. */
export async function GET() {
  try {
    await requireAdmin("balances_denied");
    return NextResponse.json({ batches: await listBatches() });
  } catch (e) { return denyResponse(e); }
}
