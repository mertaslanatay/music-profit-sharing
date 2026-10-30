"use client";

import clsx from "clsx";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "../ui";

type Mode = "login" | "register";
const KEY = "pulse-auth-mode";

/**
 * Giriş yap / Kayıt ol anahtarı.
 *
 * İki ayrı sayfa (/giris, /kayit) olarak kalıyor — bağlantılar, e-posta
 * yönlendirmeleri ve "?kayit=1" gibi parametreler bozulmasın diye. Kaymanın
 * görünmesi için son seçili mod oturumda hatırlanıyor: sayfa yeni moda
 * açıldığında başparmak önceki yerinden başlayıp yeni yerine kayıyor.
 */
export function AuthSwitch({ mode }: { mode: Mode }) {
  const [pos, setPos] = useState<Mode>(mode);
  useEffect(() => {
    let prev: string | null = null;
    try {
      prev = sessionStorage.getItem(KEY);
      sessionStorage.setItem(KEY, mode);
    } catch {
      /* depolama yok: kayma olmadan devam */
    }
    if (prev && prev !== mode) {
      setPos(prev as Mode);
      const id = requestAnimationFrame(() => requestAnimationFrame(() => setPos(mode)));
      return () => cancelAnimationFrame(id);
    }
  }, [mode]);

  const tab = (m: Mode, href: string, label: string, icon: string) => (
    <Link
      href={href}
      role="tab"
      aria-selected={mode === m}
      className={clsx(
        "relative z-[1] h-11 rounded-full inline-flex items-center justify-center gap-2 text-[14px] font-semibold transition-colors duration-300",
        pos === m ? "text-white" : "text-ink-500 hover:text-ink-900"
      )}
    >
      <Icon name={icon} size={16} />
      {label}
    </Link>
  );

  return (
    <div
      role="tablist"
      aria-label="Hesap işlemi"
      className="relative grid grid-cols-2 p-1 rounded-full bg-canvas border border-line"
    >
      <span
        aria-hidden
        className={clsx(
          "absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-full bg-brand-500 shadow-accent",
          "transition-transform duration-500 ease-out motion-reduce:transition-none",
          pos === "register" && "translate-x-full"
        )}
      />
      {tab("login", "/giris", "Giriş yap", "forward")}
      {tab("register", "/kayit", "Kayıt ol", "user")}
    </div>
  );
}
