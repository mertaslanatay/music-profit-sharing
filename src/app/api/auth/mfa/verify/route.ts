import { NextResponse } from "next/server";
import { rateLimit, audit } from "@/lib/access";
import { requireViewer, denyResponse, logAction } from "@/lib/guard";
import { supabaseServer, authConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * 6 haneli TOTP kodunu doğrular. İki durumda kullanılır:
 *  1) Yeni kayıt sonrası ilk doğrulama (faktörü etkinleştirir)
 *  2) Şifre girişinden sonraki ikinci adım (oturumu aal2'ye çıkarır)
 * İkisi de aynı Supabase çağrısı (challengeAndVerify) — kodu doğru tahmin
 * etmeye çalışan biri için hız sınırı var.
 */
export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ error: "Giriş sistemi henüz yapılandırılmadı." }, { status: 503 });
  }
  try {
    const viewer = await requireViewer();
    const body = await req.json().catch(() => ({}));
    const factorId = String(body.factorId ?? "");
    const code = String(body.code ?? "").replace(/\s+/g, "");
    if (!factorId || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: "6 haneli kodu eksiksiz gir." }, { status: 400 });
    }

    const bucket = `mfa:${viewer?.userId ?? factorId}`;
    const limited = await rateLimit(bucket, 8, 900);
    if (!limited.ok) {
      return NextResponse.json({ error: "Çok fazla deneme. Biraz sonra tekrar dene." }, { status: 429 });
    }

    const sb = await supabaseServer();
    const { data, error } = await sb.auth.mfa.challengeAndVerify({ factorId, code });
    if (error || !data) {
      await audit({ userId: viewer?.userId ?? null, action: "mfa_verify_failed", resource: factorId });
      return NextResponse.json({ error: "Kod hatalı ya da süresi dolmuş." }, { status: 400 });
    }

    await logAction(viewer, "mfa_verified", factorId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
