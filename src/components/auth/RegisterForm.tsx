"use client";

import { useMemo, useState } from "react";
import { Alert, Field, buttonClass, inputClass } from "./AuthShell";

/** Şifre gücü — sunucudaki kuralın aynısı, kullanıcıya anında geri bildirim. */
function strength(p: string): { score: 0 | 1 | 2 | 3; text: string } {
  if (!p) return { score: 0, text: "" };
  if (p.length < 10) return { score: 1, text: "Çok kısa — en az 10 karakter" };
  const varieties =
    (/[a-zçğıöşü]/.test(p) ? 1 : 0) + (/[A-ZÇĞİÖŞÜ]/.test(p) ? 1 : 0) +
    (/[0-9]/.test(p) ? 1 : 0) + (/[^\w\s]/.test(p) ? 1 : 0);
  if (!/[0-9]/.test(p)) return { score: 1, text: "En az bir rakam gerekli" };
  if (varieties >= 3 && p.length >= 14) return { score: 3, text: "Güçlü" };
  return { score: 2, text: "Yeterli" };
}

export function RegisterForm() {
  const [f, setF] = useState({
    firstName: "", lastName: "", artistName: "", email: "", password: "", password2: "",
  });
  const [kvkk, setKvkk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const st = useMemo(() => strength(f.password), [f.password]);
  const mismatch = f.password2.length > 0 && f.password !== f.password2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch) return setError("Şifreler birbiriyle uyuşmuyor.");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...f, kvkk }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Kayıt tamamlanamadı."); return; }
      setDone(true);
    } catch {
      setError("Bağlantı kurulamadı. İnternetini kontrol et.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="ok">
          <strong className="font-semibold">Kaydın alındı.</strong>
          <br />
          <span className="font-medium">{f.email}</span> adresine bir doğrulama bağlantısı
          gönderdik. Bağlantıya tıkladıktan sonra hesabın yönetici onayına düşecek;
          onaylandığında e-postayla haber vereceğiz.
        </Alert>
        <p className="text-[12.5px] text-ink-500 leading-relaxed">
          E-posta birkaç dakika içinde gelmezse spam klasörünü kontrol et.
        </p>
        <a href="/giris" className={buttonClass + " block text-center"}>Giriş ekranına dön</a>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Ad">
          <input required autoComplete="given-name" className={inputClass}
                 value={f.firstName} onChange={set("firstName")} />
        </Field>
        <Field label="Soyad">
          <input required autoComplete="family-name" className={inputClass}
                 value={f.lastName} onChange={set("lastName")} />
        </Field>
      </div>

      <Field label="Sanatçı adı" hint="Varsa — raporlarda geçen isminle eşleştirmek için.">
        <input className={inputClass} value={f.artistName} onChange={set("artistName")}
               placeholder="isteğe bağlı" />
      </Field>

      <Field label="E-posta">
        <input type="email" required autoComplete="email" className={inputClass}
               value={f.email} onChange={set("email")} placeholder="ornek@eposta.com" />
      </Field>

      <Field label="Şifre" hint="En az 10 karakter, en az bir rakam.">
        <input type="password" required autoComplete="new-password" className={inputClass}
               value={f.password} onChange={set("password")} />
        {st.text && (
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex gap-1 flex-1">
              {[1, 2, 3].map((i) => (
                <span key={i} className={`h-1 flex-1 rounded-full ${
                  st.score >= i
                    ? st.score === 1 ? "bg-accent-rose" : st.score === 2 ? "bg-accent-amber" : "bg-brand-500"
                    : "bg-line"}`} />
              ))}
            </div>
            <span className="text-[11.5px] text-ink-400">{st.text}</span>
          </div>
        )}
      </Field>

      <Field label="Şifre tekrar">
        <input type="password" required autoComplete="new-password" className={inputClass}
               value={f.password2} onChange={set("password2")} />
        {mismatch && <span className="block text-[11.5px] text-accent-rose mt-1">Şifreler uyuşmuyor.</span>}
      </Field>

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)}
               className="mt-0.5 w-4 h-4 rounded border-line accent-brand-600 shrink-0" />
        <span className="text-[12px] text-ink-500 leading-relaxed">
          Ad, soyad, e-posta ve banka bilgilerimin telif ödemelerinin yürütülmesi amacıyla
          işlenmesini kabul ediyorum. Verilerim yalnızca bu amaçla kullanılır ve talebim
          hâlinde silinir.
        </span>
      </label>

      <button type="submit" disabled={busy || !kvkk || st.score < 2 || mismatch} className={buttonClass}>
        {busy ? "Kayıt oluşturuluyor…" : "Kayıt ol"}
      </button>
    </form>
  );
}
