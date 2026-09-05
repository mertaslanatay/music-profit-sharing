import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { audit, viewerByEmail } from "@/lib/access";
import { query } from "@/lib/db";

export const runtime = "nodejs";

const OTP_TYPES: readonly EmailOtpType[] = [
  "signup", "invite", "magiclink", "recovery", "email_change", "email",
];
function asOtpType(v: string | null): EmailOtpType | null {
  return v && (OTP_TYPES as readonly string[]).includes(v) ? (v as EmailOtpType) : null;
}

/**
 * E-posta doğrulama ve şifre sıfırlama dönüşü.
 *
 * İki olası biçim var:
 *  1) `token_hash` + `type` — Supabase'in `verifyOtp` ile doğrudan, oturum
 *     açmadan doğrulanan biçimi. Kayıt/şifre-sıfırlama isteğini BİZİM
 *     SUNUCUMUZ başlattığı için (kullanıcının tarayıcısı değil), PKCE'nin
 *     gerektirdiği `code_verifier` hiçbir tarayıcıda saklanmış olmuyor —
 *     bu yüzden `code` biçimi bizim akışımızla YAPISAL OLARAK uyumsuz
 *     ("eksik kod" hatasının asıl kökeni buydu). `token_hash` biçimi
 *     durumsuzdur (stateless), bu sorunu tamamen ortadan kaldırır.
 *     Supabase panelinde e-posta şablonlarının bu biçime geçmesi gerekir
 *     (bkz. proje notu).
 *  2) `code` — eski/PKCE biçimi, geriye dönük uyumluluk için hâlâ denenir.
 *
 * Doğrulama tamamlandığında kullanıcı HÂLÂ giremez — admin onayı beklenir.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next");

  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL("/giris?hata=eksik-kod", url.origin));
  }

  try {
    const sb = await supabaseServer();
    const { data, error } = tokenHash
      ? await sb.auth.verifyOtp({ type: asOtpType(type) ?? "email", token_hash: tokenHash })
      : await sb.auth.exchangeCodeForSession(code!);
    if (error || !data.user) throw new Error(error?.message ?? "kod geçersiz");

    const email = data.user.email ?? "";
    const viewer = email ? await viewerByEmail(email) : null;

    if (viewer) {
      await query(
        `update users set
           auth_id = coalesce(auth_id, $1),
           email_verified_at = coalesce(email_verified_at, now())
         where id = $2`,
        [data.user.id, viewer.userId]
      );
    }
    await audit({
      userId: viewer?.userId ?? null,
      action: type === "recovery" ? "password_recovery" : "email_verified",
      resource: email,
      ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
    });

    // Şifre sıfırlamada kullanıcı yeni şifresini belirlemeli.
    if (type === "recovery") return NextResponse.redirect(new URL("/sifre-belirle", url.origin));

    const dest = viewer?.status === "active" ? (next || "/") : "/beklemede?dogrulandi=1";
    return NextResponse.redirect(new URL(dest, url.origin));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "bilinmeyen";
    await audit({ userId: null, action: "email_verify_failed", resource: msg });
    return NextResponse.redirect(new URL("/giris?hata=baglanti-gecersiz", url.origin));
  }
}
