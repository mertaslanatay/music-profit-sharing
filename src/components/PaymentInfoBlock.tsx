"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { CURRENCIES, CURRENCY_LABEL, type Currency } from "@/lib/types";
import { Button, Icon } from "./ui";

/**
 * Ödeme Bilgileri — kullanıcı detayında, yönetici için (M4NM Pulse § 10).
 *
 * Sanatçı kendi IBAN'ını doğrudan değiştiremez (istek açar, admin onaylar);
 * ama admin buradan kullanıcı adına doğrudan girebilir/güncelleyebilir.
 * Kayıt PUT /api/bank/[artistId] üzerinden gider — o rota admin-only ve
 * değişikliği denetim kaydına yazar (IBAN'ın yalnızca son 4 hanesiyle).
 */

interface Bank {
  accountHolder: string;
  bankName: string;
  iban: string;
  currency: Currency;
  note: string | null;
  updatedAt: string | null;
}

const dateTr = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("tr-TR", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

/** Görüntülemede IBAN'ı 4'erli gruplar hâlinde okunur yaz. */
const prettyIban = (v: string) => v.replace(/(.{4})/g, "$1 ").trim();

export function PaymentInfoBlock({
  artistId,
  artistName,
}: {
  artistId: string;
  artistName: string;
}) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [holder, setHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [iban, setIban] = useState("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/bank/${artistId}`);
      const j = await r.json();
      const b: Bank | null = j.bank ?? null;
      setBank(b);
      setHolder(b?.accountHolder ?? "");
      setBankName(b?.bankName ?? "");
      setIban(b?.iban ?? "");
      setCurrency(b?.currency ?? "USD");
      setNote(b?.note ?? "");
    } catch {
      setError("Ödeme bilgisi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, [artistId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/bank/${artistId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountHolder: holder.trim(),
          bankName: bankName.trim(),
          iban: iban.replace(/\s+/g, "").toUpperCase(),
          currency,
          note: note.trim() || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Kaydedilemedi.");
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-white p-3.5">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Icon name="bank" size={15} className="text-ink-400 shrink-0" />
          <span className="text-[12px] font-semibold text-ink-500 uppercase tracking-wide truncate">
            Ödeme Bilgileri
          </span>
          <span className="text-[11.5px] text-ink-400 truncate">· {artistName}</span>
        </div>
        {!editing && !loading && (
          <Button variant="ghost" onClick={() => setEditing(true)}>
            {bank?.iban ? "Düzenle" : "Ekle"}
          </Button>
        )}
      </div>

      {error && (
        <p className="text-[12px] text-accent-rose mb-2 flex items-start gap-1.5">
          <Icon name="alert" size={13} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}
      {saved && (
        <p className="text-[12px] text-brand-700 mb-2 flex items-center gap-1.5">
          <Icon name="check" size={13} /> Kaydedildi.
        </p>
      )}

      {loading ? (
        <p className="text-[12.5px] text-ink-400">Yükleniyor…</p>
      ) : editing ? (
        <div className="space-y-2.5">
          <Field label="Hesap sahibi">
            <input
              value={holder}
              onChange={(e) => setHolder(e.target.value)}
              placeholder="Ad Soyad"
              className={inputCls}
            />
          </Field>
          <Field label="Banka">
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="örn. Garanti BBVA"
              className={inputCls}
            />
          </Field>
          <Field label="IBAN">
            <input
              value={iban}
              onChange={(e) => setIban(e.target.value.toUpperCase())}
              placeholder="TR33 0006 1005 1978 6457 8413 26"
              className={`${inputCls} font-mono`}
            />
          </Field>
          <Field label="Para birimi">
            <div className="flex items-center gap-1.5 flex-wrap">
              {CURRENCIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={clsx(
                    "px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors",
                    currency === c
                      ? "bg-ink-900 text-white"
                      : "bg-white border border-line text-ink-700 hover:bg-ink-900/[0.03]"
                  )}
                  title={CURRENCY_LABEL[c]}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Not (isteğe bağlı)">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
            />
          </Field>
          <div className="flex items-center gap-2 pt-1">
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </Button>
            <Button variant="ghost" onClick={() => { setEditing(false); void load(); }} disabled={busy}>
              Vazgeç
            </Button>
          </div>
          <p className="text-[11px] text-ink-400 leading-relaxed">
            Bu değişiklik doğrudan uygulanır ve denetim kaydına yazılır. Sanatçının
            kendi açtığı IBAN değişiklik talepleri “Banka Talepleri” sekmesinden onaylanır.
          </p>
        </div>
      ) : !bank?.iban && !bank?.accountHolder ? (
        <p className="text-[12.5px] text-ink-400">
          Henüz ödeme bilgisi girilmemiş. Ödeme kaydedebilmek için IBAN gerekiyor.
        </p>
      ) : (
        <dl className="space-y-1.5 text-[12.5px]">
          <Row label="Hesap sahibi" value={bank.accountHolder || "—"} />
          <Row label="Banka" value={bank.bankName || "—"} />
          <Row label="IBAN" value={bank.iban ? prettyIban(bank.iban) : "—"} mono />
          <Row label="Para birimi" value={CURRENCY_LABEL[bank.currency] ?? bank.currency} />
          <Row label="Son güncelleme" value={dateTr(bank.updatedAt)} />
          {bank.note && <Row label="Not" value={bank.note} />}
        </dl>
      )}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-line px-2.5 py-1.5 text-[13px] bg-white outline-none focus:border-brand-500 transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-ink-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="text-ink-400 w-[104px] shrink-0">{label}</dt>
      <dd className={clsx("text-ink-900 min-w-0 break-all", mono && "font-mono text-[12px]")}>{value}</dd>
    </div>
  );
}
