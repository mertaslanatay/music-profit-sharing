import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { audit, viewerByEmail } from "@/lib/access";
import { query } from "@/lib/db";

export const runtime = "nodejs";

/**
 * E-posta doğrulama ve şifre sıfırlama dönüşü.
 *
 * Supabase kullanıcıyı buraya bir `code` ile gönderir; kodu oturuma çeviririz.
 * Doğrulama tamamlandığında kullanıcı HÂLÂ giremez — admin onayı beklenir.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next");

  if (!code) {
    return NextResponse.redirect(new URL("/giris?hata=eksik-kod", url.origin));
  }

  try {
    const sb = await supabaseServer();
    const { data, error } = await sb.auth.exchangeCodeForSession(code);
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
