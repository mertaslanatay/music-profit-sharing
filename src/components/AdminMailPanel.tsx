"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import type { UserListRow } from "@/app/api/admin/users/route";
import { Button, Card, Icon } from "./ui";

const ROLE_TR: Record<string, string> = {
  admin: "Yönetici",
  label_manager: "Label yöneticisi",
  artist: "Sanatçı",
  accountant: "Muhasebe",
};

/**
 * Admin serbest e-posta aracı — kayıtlı bir kullanıcıyı (e-postası girilmiş
 * sanatçı/label) dropdown'dan seç, ya da "elle e-posta gir"e geçip herhangi
 * bir adrese yaz. Destek konuşma kutusundan (Mesajlar sekmesi) bağımsız:
 * burada karşılıklı yazışma yok, tek seferlik bir e-posta gönderimi var.
 */
export function AdminMailPanel({ users }: { users: UserListRow[] }) {
  const options = useMemo(
    () =>
      [...users]
        .filter((u) => u.email)
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "tr")),
    [users]
  );

  const [manual, setManual] = useState(false);
  const [userId, setUserId] = useState("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const selected = options.find((u) => u.id === userId) ?? null;
  const recipient = manual ? to.trim() : selected?.email ?? "";

  const send = async () => {
    setBusy(true); setErr(null); setOk(false);
    try {
      const res = await fetch("/api/admin/mail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to: recipient, subject, message }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error ?? "Gönderilemedi."); return; }
      setOk(true);
      setSubject(""); setMessage("");
    } catch {
      setErr("Bağlantı kurulamadı.");
    } finally {
      setBusy(false);
    }
  };

  const canSend = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(recipient) && subject.trim() && message.trim() && !busy;

  return (
    <Card>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-1.5">
        Alıcı
      </p>
      <p className="text-[12px] text-ink-500 mb-3 leading-relaxed">
        Kayıtlı bir kullanıcıyı seç, ya da elle bir e-posta adresi gir. Bu, destek
        konuşmalarından (Mesajlar sekmesi) bağımsız, tek seferlik bir e-postadır.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => setManual(false)}
          className={clsx(
            "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors",
            !manual ? "bg-ink-900 text-white" : "bg-ink-900/[0.04] text-ink-700 hover:bg-ink-900/[0.08]"
          )}
        >
          Kayıtlı kullanıcı
        </button>
        <button
          type="button"
          onClick={() => setManual(true)}
          className={clsx(
            "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors",
            manual ? "bg-ink-900 text-white" : "bg-ink-900/[0.04] text-ink-700 hover:bg-ink-900/[0.08]"
          )}
        >
          Elle e-posta gir
        </button>
      </div>

      {manual ? (
        <input
          type="email"
          value={to}
          onChange={(e) => { setTo(e.target.value); setOk(false); }}
          placeholder="ornek@eposta.com"
          className="w-full rounded-xl border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand-500 transition-colors mb-4"
        />
      ) : (
        <select
          value={userId}
          onChange={(e) => { setUserId(e.target.value); setOk(false); }}
          className="w-full rounded-xl border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand-500 transition-colors mb-4"
        >
          <option value="">Bir kullanıcı seç…</option>
          {options.map((u) => (
            <option key={u.id} value={u.id}>
              {u.firstName} {u.lastName} — {u.email} ({ROLE_TR[u.role] ?? u.role})
            </option>
          ))}
        </select>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-[11.5px] font-medium text-ink-400 mb-1.5">Konu</label>
          <input
            value={subject}
            onChange={(e) => { setSubject(e.target.value); setOk(false); }}
            placeholder="Ör. Ödeme bilgisi güncellemesi"
            className="w-full rounded-xl border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[11.5px] font-medium text-ink-400 mb-1.5">Mesaj</label>
          <textarea
            value={message}
            onChange={(e) => { setMessage(e.target.value); setOk(false); }}
            rows={6}
            placeholder="Mesajını yaz…"
            className="w-full rounded-xl border border-line px-3 py-2.5 text-[13.5px] outline-none focus:border-brand-500 transition-colors resize-y"
          />
        </div>
      </div>

      {err && (
        <p className="text-[12.5px] text-accent-rose mt-3 flex items-start gap-1.5">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {err}
        </p>
      )}
      {ok && (
        <p className="text-[12.5px] text-brand-600 mt-3 flex items-start gap-1.5">
          <Icon name="check" size={14} className="mt-0.5 shrink-0" /> Gönderildi.
        </p>
      )}

      <div className="flex justify-end mt-4">
        <Button variant="primary" onClick={send} disabled={!canSend}>
          {busy ? "Gönderiliyor…" : "Gönder"}
        </Button>
      </div>
    </Card>
  );
}
