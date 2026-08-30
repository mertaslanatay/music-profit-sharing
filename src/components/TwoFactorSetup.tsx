"use client";

import { useState } from "react";
import { Button, Card, Icon } from "./ui";

interface EnrollResponse {
  factorId: string;
  qrCode: string | null;
  secret: string | null;
}

export function TwoFactorSetup({
  hasVerifiedFactor,
  isFullySatisfied,
  existingFactorId,
}: {
  hasVerifiedFactor: boolean;
  isFullySatisfied: boolean;
  existingFactorId: string | null;
}) {
  if (hasVerifiedFactor && isFullySatisfied) {
    return <ActiveState factorId={existingFactorId} />;
  }
  if (hasVerifiedFactor && !isFullySatisfied) {
    return <ChallengeState factorId={existingFactorId} />;
  }
  return <EnrollState />;
}

/* --------------------------------------------------------- zaten kurulu */

function ActiveState({ factorId }: { factorId: string | null }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unenroll = async () => {
    if (!factorId) return;
    if (!confirm("İki adımlı doğrulamayı kapatmak istediğine emin misin? Bu, hesap güvenliğini zayıflatır.")) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/auth/mfa/unenroll", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ factorId }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error); return; }
      window.location.reload();
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
          <Icon name="check" size={18} className="text-brand-600" strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold text-ink-900">İki adımlı doğrulama aktif</p>
          <p className="text-[13px] text-ink-500 mt-1 leading-relaxed">
            Girişte şifrenin yanında telefonundaki doğrulayıcı uygulamadan bir kod isteniyor.
          </p>
        </div>
      </div>
      {err && (
        <p className="text-[12.5px] text-accent-rose mt-3 flex items-start gap-1.5">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {err}
        </p>
      )}
      <div className="mt-4">
        <Button onClick={unenroll} disabled={busy}>
          {busy ? "Kapatılıyor…" : "İki adımlı doğrulamayı kapat"}
        </Button>
      </div>
    </Card>
  );
}

/* --------------------------------------- faktör var ama oturum aal1'de */

function ChallengeState({ factorId }: { factorId: string | null }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!factorId) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ factorId, code }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error); return; }
      window.location.href = "/admin";
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <p className="text-[14.5px] font-semibold text-ink-900">Doğrulama kodu gerekli</p>
      <p className="text-[13px] text-ink-500 mt-1 mb-4 leading-relaxed">
        Bu oturumda henüz ikinci adımı tamamlamadın. Doğrulayıcı uygulamandaki 6 haneli kodu gir.
      </p>
      <CodeInput value={code} onChange={setCode} />
      {err && (
        <p className="text-[12.5px] text-accent-rose mt-3 flex items-start gap-1.5">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {err}
        </p>
      )}
      <div className="mt-4">
        <Button variant="primary" onClick={submit} disabled={busy || code.length !== 6}>
          {busy ? "Doğrulanıyor…" : "Doğrula"}
        </Button>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------- yeni kurulum */

function EnrollState() {
  const [step, setStep] = useState<"intro" | "scan">("intro");
  const [enroll, setEnroll] = useState<EnrollResponse | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/auth/mfa/enroll", { method: "POST" });
      const j = await res.json();
      if (!res.ok) { setErr(j.error); return; }
      setEnroll(j);
      setStep("scan");
    } finally { setBusy(false); }
  };

  const submit = async () => {
    if (!enroll) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/auth/mfa/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ factorId: enroll.factorId, code }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error); return; }
      window.location.href = "/admin";
    } finally { setBusy(false); }
  };

  if (step === "intro") {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <Icon name="alert" size={18} className="text-accent-amber" />
          </div>
          <div className="min-w-0">
            <p className="text-[14.5px] font-semibold text-ink-900">İki adımlı doğrulama gerekli</p>
            <p className="text-[13px] text-ink-500 mt-1 leading-relaxed">
              Yönetici hesapları için 2FA zorunlu — mali veriye erişim söz konusu. Google
              Authenticator, Authy veya benzeri bir doğrulayıcı uygulama gerekir.
            </p>
          </div>
        </div>
        {err && (
          <p className="text-[12.5px] text-accent-rose mt-3 flex items-start gap-1.5">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {err}
          </p>
        )}
        <div className="mt-4">
          <Button variant="primary" onClick={start} disabled={busy}>
            {busy ? "Hazırlanıyor…" : "Kuruluma başla"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-[14.5px] font-semibold text-ink-900 mb-3">QR kodu tara</p>
      {enroll?.qrCode && (
        <div className="flex justify-center bg-white rounded-xl border border-line p-4 mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enroll.qrCode} alt="2FA QR kodu" width={180} height={180} />
        </div>
      )}
      {enroll?.secret && (
        <p className="text-[12px] text-ink-500 text-center mb-4">
          Kod okunmuyorsa elle gir: <span className="font-mono text-ink-700">{enroll.secret}</span>
        </p>
      )}
      <p className="text-[13px] text-ink-500 mb-2">Uygulamada oluşan 6 haneli kodu gir:</p>
      <CodeInput value={code} onChange={setCode} />
      {err && (
        <p className="text-[12.5px] text-accent-rose mt-3 flex items-start gap-1.5">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {err}
        </p>
      )}
      <div className="mt-4">
        <Button variant="primary" onClick={submit} disabled={busy || code.length !== 6}>
          {busy ? "Doğrulanıyor…" : "Etkinleştir"}
        </Button>
      </div>
    </Card>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      inputMode="numeric"
      autoFocus
      placeholder="000000"
      className="w-full rounded-xl border border-line px-3 py-2.5 text-[18px] font-mono tracking-[0.3em] text-center outline-none focus:border-brand-500 transition-colors"
    />
  );
}
