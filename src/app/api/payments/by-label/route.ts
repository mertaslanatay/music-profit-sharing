import { NextResponse } from "next/server";
import { getLabelLedger } from "@/lib/payments";
import { requireAdmin, denyResponse } from "@/lib/guard";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Label bazında sanatçı × dönem bakiyesi — tüm sanatçıların rakamları, yalnızca admin. */
export async function GET(req: Request) {
  try {
    await requireAdmin("balances_denied");
    const labelId = new URL(req.url).searchParams.get("labelId") ?? "";
    if (!UUID.test(labelId)) {
      return NextResponse.json({ error: "Geçersiz label." }, { status: 400 });
    }
    return NextResponse.json(await getLabelLedger(labelId.toLowerCase()));
  } catch (e) { return denyResponse(e); }
}
