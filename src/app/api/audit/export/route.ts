import { NextResponse } from "next/server";
import { requireViewer, denyResponse, logAction } from "@/lib/guard";

export const runtime = "nodejs";

/**
 * Excel indirme istemci tarafında (SheetJS) yapılıyor; dosyanın kendisi
 * sunucudan geçmiyor. Ama "kim ne indirdi" denetim kaydına yazılmalı
 * (bkz. v2-sartname.md § 6), bu yüzden indirme başladığında bu uç nokta
 * ayrıca çağrılıp olay kaydediliyor.
 */
export async function POST(req: Request) {
  try {
    const viewer = await requireViewer();
    const body = await req.json().catch(() => ({}));
    await logAction(viewer, "export_xlsx", body.scope ? String(body.scope) : null, {
      rowCount: body.rowCount, gross: body.gross,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
