"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Tarayıcı istemcisi — yalnızca giriş, çıkış ve şifre sıfırlama için. */
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!url || !key) throw new Error("Supabase yapılandırması eksik.");
  return createBrowserClient(url, key);
}
