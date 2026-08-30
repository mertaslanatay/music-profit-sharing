import { NextResponse } from "next/server";
import { audit, rateLimit, viewerByEmail } from "@/lib/access";
import { supabaseServer, authConfigured } from "@/lib/supabase/server";
import { readMfaState, mfaChallengeNeeded } from "@/lib/mfa";

export const runtime = "nodejs";

/**
 * Giriş.
 *
 * Sunucuda yapılır ki hem hız sınırı hem denetim kaydı atlanamasın.
 * Başarısız girişte "e-posta yanlış" ile "şifre yanlış" ayrımı YAPILMAZ —
 * aksi hâlde bu uç nokta kimin hesabı olduğunu söyleyen bir araca dönüşür.
 */
export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json({ error: "Giriş sistemi henüz yapılandırılmadı." }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "bilinmiyor";
  const ua = req.headers.get("user-agent");
  const body = await req.json().catch(() => ({}));
  const email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: "E-posta ve şifre gerekli." }, { status: 400 });
  }

  // İki ayrı kova: bir hesabı hedefleyen saldırı da, bir ağdan gelen
  // dağıtık deneme de sınırlanır.
  const byEmail = await rateLimit(`login:e:${email}`, 8, 900);
  const byIp = await rateLimit(`login:i:${ip}`, 25, 900);
  if (!byEmail.ok || !byIp.ok) {
    await audit({ userId: null, action: "login_rate_limited", resource: email, ip, userAgent: ua });
    return NextResponse.json(
      { error: "Çok fazla başarısız deneme. 15 dakika sonra tekrar dene." }, { status: 429 }
    );
  }

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    const known = await viewerByEmail(email);
    await audit({
      userId: known?.userId ?? null, action: "login_failed", resource: email, ip, userAgent: ua,
      meta: { reason: error?.message ?? "bilinmiyor" },
    });
    // E-posta doğrulanmamışsa bunu söylemek güvenli: kullanıcı zaten
    // o adrese erişebiliyorsa mesajı görür, erişemiyorsa bir işine yaramaz.
    if (error?.message?.toLowerCase().includes("not confirmed")) {
      return NextResponse.json(
        { error: "E-posta adresini henüz doğrulamadın. Gelen kutunu kontrol et.", unverified: true },
        { status: 403 }
      );
    }
    return NextResponse.json({ error: "E-posta veya şifre hatalı." }, { status: 401 });
  }

  const viewer = await viewerByEmail(email);

  // Bir TOTP faktörü doğrulanmışsa şifre tek başına yetmez — ikinci adım
  // (6 haneli kod) tamamlanana kadar girişi bitirmiyoruz. Yalnızca admin
  // hesabında faktör kurulu olabileceği için bu kontrol pratikte sadece
  // adminleri etkiler.
  const mfaState = await readMfaState(sb);
  if (mfaChallengeNeeded(mfaState) && mfaState.factorId) {
    await audit({
      userId: viewer?.userId ?? null, action: "login_mfa_pending", resource: email, ip, userAgent: ua,
    });
    return NextResponse.json({ ok: true, mfaRequired: true, factorId: mfaState.factorId });
  }

  await audit({
    userId: viewer?.userId ?? null, action: "login", resource: email, ip, userAgent: ua,
    meta: { role: viewer?.role ?? null, status: viewer?.status ?? "profilsiz" },
  });

  // Oturum açıldı; onay durumunu istemciye bildiriyoruz ki doğru sayfaya gitsin.
  const status = viewer?.status ?? "pending";
  return NextResponse.json({
    ok: true,
    status,
    role: viewer?.role ?? null,
    redirect: status === "active" ? "/" : "/beklemede",
  });
}
