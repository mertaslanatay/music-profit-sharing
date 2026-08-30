import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Supabase Auth istemcileri.
 *
 * Kimlik (şifre, oturum, e-posta doğrulama) Supabase Auth'ta tutulur.
 * Rol, onay durumu ve görme yetkileri BİZİM users tablomuzdadır — çünkü
 * bunlar iş kurallarıdır ve denetlenebilir olmalıdır.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Auth yapılandırılmış mı? Kurulum tamamlanmadan giriş ekranı uyarı gösterir. */
export const authConfigured = (): boolean => !!SUPABASE_URL && !!SUPABASE_ANON;

function requireConfig() {
  if (!authConfigured()) {
    throw new Error(
      "Supabase Auth yapılandırılmamış. .env.local dosyasına NEXT_PUBLIC_SUPABASE_URL " +
      "ve NEXT_PUBLIC_SUPABASE_ANON_KEY ekle."
    );
  }
}

/**
 * Sunucu bileşenleri ve rota işleyicileri için istemci.
 * Oturum çerezleri üzerinden taşınır; Next 15'te cookies() async'tir.
 */
export async function supabaseServer() {
  requireConfig();
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Sunucu bileşeni içinde çerez yazılamaz — middleware zaten tazeliyor,
        // bu yüzden hatayı yutmak güvenli.
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch { /* sunucu bileşeni bağlamı */ }
      },
    },
  });
}

/**
 * Yönetim istemcisi — service role anahtarıyla çalışır, RLS'i atlar.
 * YALNIZCA sunucuda ve yalnızca admin işlemlerinde kullanılır
 * (kullanıcı silme, e-posta yeniden gönderme, şifre sıfırlama bağlantısı).
 */
export function supabaseAdmin() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY tanımlı değil. Bu anahtar yalnızca sunucuda tutulur, " +
      "asla NEXT_PUBLIC_ önekiyle yazılmaz."
    );
  }
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Çerezsiz, oturumsuz istemci — kayıt ve şifre sıfırlama istekleri için. */
export function supabaseAnon() {
  requireConfig();
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
