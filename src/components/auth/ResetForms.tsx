"use client";

import { useState } from "react";
import { Alert, Field, buttonClass, inputClass } from "./AuthShell";

export function ResetRequestForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <Alert tone="ok">
        Bu adres kayıtlıysa sıfırlama bağlantısını gönderdik. Gelen kutunu ve
        spam klasörünü kontrol et.
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="E-posta">
        <input type="email" required autoFocus autoComplete="email" className={inputClass}
               value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <button type="submit" disabled={busy} className={buttonClass}>
        {busy ? "Gönderiliyor…" : "Sıfırlama bağlantısı gönder"}
      </button>
    </form>
  );
}

export function NewPasswordForm() {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const mismatch = p2.length > 0 && p1 !== p2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch) return setError("Şifreler uyuşmuyor.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: p1 }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Şifre değiştirilemedi."); return; }
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="ok">Şifren değiştirildi.</Alert>
        <a href="/" className={buttonClass + " block text-center"}>Devam et</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Yeni şifre" hint="En az 10 karakter, harf ve rakam.">
        <input type="password" required autoFocus autoComplete="new-password"
               className={inputClass} value={p1} onChange={(e) => setP1(e.target.value)} />
      </Field>
      <Field label="Yeni şifre tekrar">
        <input type="password" required autoComplete="new-password"
               className={inputClass} value={p2} onChange={(e) => setP2(e.target.value)} />
        {mismatch && <span className="block text-[11.5px] text-accent-rose mt-1">Şifreler uyuşmuyor.</span>}
      </Field>
      <button type="submit" disabled={busy || mismatch || p1.length < 10} className={buttonClass}>
        {busy ? "Kaydediliyor…" : "Şifreyi kaydet"}
      </button>
    </form>
  );
}
