"use client";

import { useCallback, useEffect, useRef } from "react";

/** Arka plan kontrol aralığı ve iki kontrol arasındaki en kısa süre. */
const INTERVAL_MS = 3 * 60 * 1000;
const MIN_GAP_MS = 30 * 1000;

/**
 * Açık panelin oturum nöbeti (faz-z11) — bkz. api/session/check.
 *
 * Ne zaman kontrol eder: her 3 dakikada bir, sekmeye/pencereye geri
 * dönüldüğünde ve ekran değiştirildiğinde (en sık 30 sn'de bir).
 * Ne yapar: oturum düştüyse giriş/beklemede ekranına götürür; yetkiler
 * değiştiyse sayfayı yeniler (yeni yetkiyle süzülmüş veri gelsin diye).
 * Ağ hatasında hiçbir şey yapmaz — kullanıcıyı geçici bağlantı kopması
 * yüzünden dışarı atmayız.
 *
 * fp null ise (kimlik doğrulama kapalı — yerel geliştirme) hiç çalışmaz.
 */
export function useSessionWatch(fp: string | null) {
  const last = useRef(0);
  const busy = useRef(false);

  const check = useCallback(async (force = false) => {
    if (!fp || busy.current) return;
    const now = Date.now();
    if (!force && now - last.current < MIN_GAP_MS) return;
    last.current = now;
    busy.current = true;
    try {
      const r = await fetch("/api/session/check", { cache: "no-store" });
      if (r.status === 401 || r.status === 403) {
        const j = (await r.json().catch(() => ({}))) as { to?: string };
        window.location.href = j.to === "/beklemede" ? "/beklemede" : "/giris";
        return;
      }
      if (!r.ok) return;
      const j = (await r.json()) as { fp?: string };
      if (j.fp && j.fp !== fp) window.location.reload();
    } catch {
      /* ağ hatası — sessizce geç */
    } finally {
      busy.current = false;
    }
  }, [fp]);

  useEffect(() => {
    if (!fp) return;
    const id = window.setInterval(() => void check(true), INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fp, check]);

  return check;
}

/** Sunucuya gitmeyen ekran geçişini denetim kaydına yazar (yanıtı beklemez). */
export function logClientView(view: string) {
  try {
    void fetch("/api/session/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ view }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* kayıt atılamazsa gezinmeyi bozmayız */
  }
}
