import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { audit, rateLimit } from "@/lib/access";
import { supabaseAnon, authConfigured } from "@/lib/supabase/server";
import { notifyMany, adminUserIds } from "@/lib/notify";
import { countryByCode, normalizePhoneDigits, isValidPhoneDigits } from "@/lib/countries";

export const runtime = "nodejs";

/**
 * Kayıt.
 *
 * Akış: profil satırı yazılır (onay bekliyor) → Supabase doğrulama e-postası
 * gönderir → kullanıcı e-postasını doğrular → ADMIN onaylar → giriş açılır.
 *
 * Doğrulanmış e-posta tek başına yetmez; mali veri söz konusu olduğu için
 * kimin gireceğine her zaman bir insan karar verir.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function passwordProblem(p: string): string | null {
  if (p.length < 10) return "Şifre en az 10 karakter olmalı.";
  if (!/[a-zçğıöşü]/i.test(p)) return "Şifre en az bir harf içermeli.";
  if (!/[0-9]/.test(p)) return "Şifre en az bir rakam içermeli.";
  const weak = ["password", "12345678", "qwerty", "sifre", "parola", "m4nm"];
  if (weak.some((w) => p.toLowerCase().includes(w))) return "Şifre fazla tahmin edilebilir.";
  return null;
}

const clean = (v: unknown, max = 120) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export async function POST(req: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { error: "Kayıt sistemi henüz yapılandırılmadı." }, { status: 503 }
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "bilinmiyor";
  const body = await req.json().catch(() => ({}));

  const email       = clean(body.email, 254).toLowerCase();
  const firstName   = clean(body.firstName, 60);
  const lastName    = clean(body.lastName, 60);
  const artistName  = clean(body.artistName, 120);
  const password    = typeof body.password === "string" ? body.password : "";
  const kvkk        = body.kvkk === true;
  const phoneCountryRaw = clean(body.phoneCountry, 2).toUpperCase();
  const phoneDigitsRaw  = normalizePhoneDigits(clean(body.phone, 30));

  // --- hız sınırı: aynı IP'den saatte 5 kayıt ---
  const rl = await rateLimit(`register:${ip}`, 5, 3600);
  if (!rl.ok) {
    await audit({ userId: null, action: "register_rate_limited", resource: email, ip });
    return NextResponse.json(
      { error: "Çok fazla deneme yapıldı. Bir saat sonra tekrar dene." }, { status: 429 }
    );
  }

  // --- doğrulama ---
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Geçerli bir e-posta gir." }, { status: 400 });
  if (!firstName || !lastName) return NextResponse.json({ error: "Ad ve soyad zorunlu." }, { status: 400 });
  if (!kvkk) return NextResponse.json({ error: "Aydınlatma metnini onaylaman gerekiyor." }, { status: 400 });
  const pw = passwordProblem(password);
  if (pw) return NextResponse.json({ error: pw }, { status: 400 });

  // --- telefon: isteğe bağlı. Ülke seçimi formda her zaman bir varsayılana
  // sahiptir (ör. "TR"), bu yüzden "girildi mi" kararını SADECE numara
  // basamaklarının varlığına göre veririz — yoksa boş bırakan herkes
  // (ülke alanı dolu göründüğü için) hatalı biçimde reddedilir.
  let phone: string | null = null;
  let phoneCountry: string | null = null;
  if (phoneDigitsRaw) {
    const country = countryByCode(phoneCountryRaw);
    if (!country) return NextResponse.json({ error: "Geçerli bir ülke seç." }, { status: 400 });
    if (!isValidPhoneDigits(phoneDigitsRaw)) {
      return NextResponse.json({ error: "Telefon numarasını kontrol et." }, { status: 400 });
    }
    phone = phoneDigitsRaw;
    phoneCountry = country.code;
  }

  // --- e-posta zaten kayıtlı mı ---
  const existing = await queryOne<{ id: string; status: string }>(
    `select id, status from users where lower(email) = $1`, [email]
  );
  if (existing) {
    // Var olan hesabı ele vermeyiz — aynı mesajı döneriz.
    await audit({ userId: existing.id, action: "register_duplicate", resource: email, ip });
    return NextResponse.json({ ok: true, duplicate: true });
  }

  // --- profil satırı (önce bizde, sonra Supabase'de) ---
  // Kod dağıtımı ile migration'ın (Supabase SQL Editor'de elle çalıştırılıyor)
  // hangisinin önce yetişeceği garanti değil; phone/phone_country kolonları
  // henüz yoksa kayıt tamamen kırılmasın diye o kolonlar olmadan tekrar denenir.
  let created: { id: string } | null;
  try {
    created = await queryOne<{ id: string }>(
      `insert into users (email, first_name, last_name, artist_name, role, status, kvkk_consent_at, phone, phone_country)
       values ($1,$2,$3,$4,'artist','pending', now(), $5, $6)
       on conflict do nothing
       returning id`,
      [email, firstName, lastName, artistName || null, phone, phoneCountry]
    );
  } catch (e) {
    const code = (e as { code?: string } | null)?.code;
    if (code !== "42703") throw e; // 42703 = undefined_column — başka hatayı yutmayız
    created = await queryOne<{ id: string }>(
      `insert into users (email, first_name, last_name, artist_name, role, status, kvkk_consent_at)
       values ($1,$2,$3,$4,'artist','pending', now())
       on conflict do nothing
       returning id`,
      [email, firstName, lastName, artistName || null]
    );
  }
  if (!created) return NextResponse.json({ ok: true, duplicate: true });

  // --- Supabase Auth kaydı ve doğrulama e-postası ---
  const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin;
  try {
    const sb = supabaseAnon();
    const { error } = await sb.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback`,
        data: { first_name: firstName, last_name: lastName, artist_name: artistName || null },
      },
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    // Supabase kaydı başarısızsa yetim profil bırakmayız.
    await query(`delete from users where id = $1 and auth_id is null`, [created.id]);
    const msg = e instanceof Error ? e.message : "Kayıt tamamlanamadı.";
    await audit({ userId: null, action: "register_failed", resource: email, ip, meta: { msg } });
    return NextResponse.json(
      { error: "Kayıt tamamlanamadı. Lütfen biraz sonra tekrar dene." }, { status: 502 }
    );
  }

  // Yönetici onayı olmadan kimse giremiyor — bekleyen talebi haber veriyoruz.
  await notifyMany(await adminUserIds(), {
    type: "account",
    title: "Yeni kayıt talebi",
    body: `${firstName} ${lastName} (${email}) kayıt oldu, onayını bekliyor.`,
    resource: `user:${created.id}`,
    actionUrl: "/admin",
  });

  await audit({
    userId: created.id, action: "register", resource: email, ip,
    userAgent: req.headers.get("user-agent"),
    meta: { artistName: artistName || null },
  });

  return NextResponse.json({ ok: true });
}
