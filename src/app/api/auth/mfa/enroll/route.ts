import { NextResponse } from "next/server";
import { requireViewer, denyResponse } from "@/lib/guard";
import { supabaseServer, authConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * TOTP faktörü kaydı başlatır — QR kod ve gizli anahtarı döner.
 * Kayıt, kullanıcı 6 haneli kodu doğrulayana kadar (bkz. /verify) etkin
 * olmaz; bu yüzden burada henüz admin kısıtı uygulamıyoruz, sadece geçerli
 * bir oturum yeterli (/guvenlik ekranı zaten role === 'admin' kontrolü yapıyor).
 */
export async function POST() {
  if (!authConfigured()) {
    return NextResponse.json({ error: "Giriş sistemi henüz yapılandırılmadı." }, { status: 503 });
  }
  try {
    await requireViewer();
    const sb = await supabaseServer();

    // Yarım kalmış (doğrulanmamış) önceki denemeleri temizle — aksi hâlde
    // tekrar tekrar "Kuruluma başla"ya basmak eski taslak faktörleri biriktirir.
    const { data: existing } = await sb.auth.mfa.listFactors();
    const stale = (existing?.totp?.length ? existing.totp : existing?.all ?? [])
      .filter((f) => f.status !== "verified");
    for (const f of stale) {
      await sb.auth.mfa.unenroll({ factorId: f.id }).catch(() => {});
    }

    const { data, error } = await sb.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "M4NM Pulse",
    });
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Kayıt başlatılamadı." }, { status: 400 });
    }
    return NextResponse.json({
      factorId: data.id,
      qrCode: data.totp?.qr_code ?? null,
      secret: data.totp?.secret ?? null,
      uri: data.totp?.uri ?? null,
    });
  } catch (e) {
    return denyResponse(e);
  }
}
