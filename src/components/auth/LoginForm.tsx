"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Alert, Field, buttonClass, inputClass } from "./AuthShell";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("hata") === "baglanti-gecersiz"
      ? "Bağlantının süresi dolmuş veya daha önce kullanılmış. Tekrar dene."
      : params.get("hata") === "eksik-kod"
      ? "Bağlantı eksik görünüyor. E-postadaki adresi tam olarak kopyala."
      : null
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Giriş yapılamadı.");
        return;
      }
      const devam = params.get("devam");
      // Sunucu bileşenleri yeni oturumu görsün diye tam yenileme yapıyoruz.
      window.location.href = json.redirect === "/" && devam ? devam : json.redirect;
    } catch {
      setError("Bağlantı kurulamadı. İnternetini kontrol et.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {params.get("kayit") === "1" && !error && (
        <Alert tone="ok">
          Kaydın alındı. E-postana gönderdiğimiz bağlantıyla adresini doğrula.
        </Alert>
      )}

      <Field label="E-posta">
        <input
          type="email" required autoComplete="email" autoFocus
          className={inputClass} value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ornek@m4nm.net"
        />
      </Field>

      <Field label="Şifre">
        <input
          type="password" required autoComplete="current-password"
          className={inputClass} value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••"
        />
      </Field>

      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? "Giriş yapılıyor…" : "Giriş yap"}
      </button>

      <div className="text-center">
        <Link href="/sifremi-unuttum" className="text-[12.5px] text-ink-500 hover:text-ink-700 hover:underline">
          Şifremi unuttum
        </Link>
      </div>
    </form>
  );
}
