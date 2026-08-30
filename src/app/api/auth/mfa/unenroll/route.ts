import { NextResponse } from "next/server";
import { requireViewer, denyResponse, logAction } from "@/lib/guard";
import { supabaseServer, authConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** İki adımlı doğrulamayı kaldırır. Admin hesabında bu şiddetle önerilmez. */
export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ error: "Giriş sistemi henüz yapılandırılmadı." }, { status: 503 });
  }
  try {
    const viewer = await requireViewer();
    const body = await req.json().catch(() => ({}));
    const factorId = String(body.factorId ?? "");
    if (!factorId) return NextResponse.json({ error: "Faktör bulunamadı." }, { status: 400 });

    const sb = await supabaseServer();
    const { error } = await sb.auth.mfa.unenroll({ factorId });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await logAction(viewer, "mfa_unenrolled", factorId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
