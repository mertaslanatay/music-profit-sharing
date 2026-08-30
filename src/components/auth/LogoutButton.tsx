"use client";

import { useState } from "react";
import { Icon } from "@/components/ui";

async function doLogout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/giris";
}

/** Kenar çubuğu için düğme. */
export function LogoutButton({ label = "Çıkış yap" }: { label?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={() => { setBusy(true); void doLogout(); }}
      disabled={busy}
      className="w-full inline-flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-medium text-ink-500 hover:text-ink-900 hover:bg-ink-900/[0.04] transition-colors disabled:opacity-50"
    >
      <Icon name="back" size={15} />
      {busy ? "Çıkılıyor…" : label}
    </button>
  );
}

/** Metin bağlantısı biçimi. */
export function LogoutLink() {
  return (
    <button onClick={() => void doLogout()} className="text-ink-500 hover:text-ink-700 hover:underline">
      Farklı bir hesapla giriş yap
    </button>
  );
}
