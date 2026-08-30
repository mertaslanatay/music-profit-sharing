import { NextResponse } from "next/server";
import { audit, rateLimit, viewerByEmail } from "@/lib/access";
import { supabaseAnon, supabaseServer, authConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Şifre sıfırlama isteği.
 *
 * Adres kayıtlı olsa da olmasa da AYNI cevap döner — aksi hâlde bu uç nokta
 * "bu kişinin hesabı var mı" sorusunu yanıtlayan bir araca dönüşür.
 */
export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ error: "Sistem henüz yapılandırılmadı." }, { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "bilinmiyor";
  const body = await req.json().catch(() => ({}));
  const email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "E-posta gerekli." }, { status: 400 });

  const rl = await rateLimit(`reset:${email}`, 3, 3600);
  const rlIp = await rateLimit(`reset:i:${ip}`, 10, 3600);
  if (!rl.ok || !rlIp.ok) {
    await audit({ userId: null, action: "reset_rate_limited", resource: email, ip });
    return NextResponse.json({ ok: true }); // sessiz başarı
  }

  const viewer = await viewerByEmail(email);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  try {
    await supabaseAnon().auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?type=recovery`,
    });
  } catch { /* yine de sessiz başarı */ }

  await audit({ userId: viewer?.userId ?? null, action: "reset_requested", resource: email, ip });
  return NextResponse.json({ ok: true });
}

/** Yeni şifreyi kaydeder — kullanıcı sıfırlama bağlantısıyla gelmiş olmalı. */
export async function PUT(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ error: "Sistem henüz yapılandırılmadı." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 10) {
    return NextResponse.json({ error: "Şifre en az 10 karakter olmalı." }, { status: 400 });
  }
  if (!/[0-9]/.test(password) || !/[a-zçğıöşü]/i.test(password)) {
    return NextResponse.json({ error: "Şifre harf ve rakam içermeli." }, { status: 400 });
  }

  const sb = await supabaseServer();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Bağlantının süresi dolmuş." }, { status: 401 });

  const { error } = await sb.auth.updateUser({ password });
  if (error) return NextResponse.json({ error: "Şifre değiştirilemedi." }, { status: 400 });

  const viewer = u.user.email ? await viewerByEmail(u.user.email) : null;
  await audit({
    userId: viewer?.userId ?? null, action: "password_changed", resource: u.user.email ?? null,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
  });
  return NextResponse.json({ ok: true });
}
