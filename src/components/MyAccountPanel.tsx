"use client";

import { useCallback, useState } from "react";
import clsx from "clsx";
import type { BankAccount, BankChangeRequestRow, LedgerSummary, PaymentRow, PeriodStatus } from "@/lib/payments";
import { money, amountIn } from "@/lib/format";
import { Button, Card, Empty, Icon, Stat } from "./ui";
import { CURRENCIES, CURRENCY_LABEL, type Currency } from "@/lib/types";

const tl = (v: number) =>
  `₺${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;

const dateTr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const maskIban = (iban: string) =>
  iban.length > 8 ? `${iban.slice(0, 4)} •••• •••• ${iban.slice(-4)}` : iban;

export function MyAccountPanel({
  artistId,
  summary: initialSummary,
  periods,
  payments,
  bank: initialBank,
  openBankRequest: initialOpenBankRequest,
}: {
  artistId: string;
  artistName: string;
  summary: LedgerSummary;
  periods: PeriodStatus[];
  payments: PaymentRow[];
  bank: BankAccount | null;
  openBankRequest: BankChangeRequestRow | null;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [bank, setBank] = useState(initialBank);
  const [openBankRequest, setOpenBankRequest] = useState(initialOpenBankRequest);
  const [showBankForm, setShowBankForm] = useState(false);
  const [reqBusy, setReqBusy] = useState(false);
  const [reqErr, setReqErr] = useState<string | null>(null);
  const [reqOk, setReqOk] = useState(false);

  const refreshBank = useCallback(async () => {
    const r = await fetch(`/api/bank/${artistId}`);
    const j = await r.json();
    if (r.ok) { setBank(j.bank); setOpenBankRequest(j.openRequest); }
  }, [artistId]);

  const requestPayment = async () => {
    setReqBusy(true); setReqErr(null);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artistId }),
      });
      const j = await res.json();
      if (!res.ok) { setReqErr(j.error); return; }
      setReqOk(true);
      setSummary((s) => ({ ...s, hasOpenRequest: true, openRequestAt: new Date().toISOString() }));
    } finally { setReqBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label="Toplam hakediş" value={money(summary.earned)} sub="tüm dönemler, net" />
        <Stat label="Ödenen" value={money(summary.paid)} tone="up" />
        <Stat label="Bekleyen bakiye" value={money(summary.balance)}
          tone={summary.balance > 0.005 ? "brand" : "neutral"}
          badge={summary.hasOpenRequest ? "istek gönderildi" : undefined} />
      </div>

      {/* --------------------------------------------------- ödeme talebi */}
      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-1.5">
              Ödeme talebi
            </p>
            {summary.hasOpenRequest ? (
              <p className="text-[13px] text-ink-600">
                <b className="text-ink-900">{dateTr(summary.openRequestAt)}</b> tarihinde bir ödeme
                talebi gönderdin. Yönetici incelediğinde bilgilendirileceksin.
              </p>
            ) : summary.balance > 0.005 ? (
              <p className="text-[13px] text-ink-600">
                Ödenmemiş bakiyen <b className="text-ink-900">{money(summary.balance)}</b>. Ödeme
                talebi gönderirsen yönetici en kısa sürede işleme alır.
              </p>
            ) : (
              <p className="text-[13px] text-ink-500">Şu anda ödenecek bir bakiyen yok.</p>
            )}
            {reqErr && (
              <p className="text-[12.5px] text-accent-rose mt-2 flex items-start gap-1.5">
                <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {reqErr}
              </p>
            )}
            {reqOk && (
              <p className="text-[12.5px] text-brand-600 mt-2 flex items-start gap-1.5">
                <Icon name="check" size={14} className="mt-0.5 shrink-0" /> Talebin iletildi.
              </p>
            )}
          </div>
          {!summary.hasOpenRequest && summary.balance > 0.005 && (
            <Button variant="primary" onClick={requestPayment} disabled={reqBusy}>
              <Icon name="wallet" size={15} />
              {reqBusy ? "Gönderiliyor…" : "Ödeme talebi gönder"}
            </Button>
          )}
        </div>
      </Card>

      {/* -------------------------------------------------- banka bilgisi */}
      <Card>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-1.5">
              Banka bilgisi
            </p>
            {bank?.iban ? (
              <>
                <p className="text-[13.5px] font-medium text-ink-900">{bank.bankName}</p>
                <p className="text-[13px] text-ink-500 font-mono mt-0.5">{maskIban(bank.iban)}</p>
                <p className="text-[12px] text-ink-400 mt-1">
                  {bank.accountHolder} · {bank.currency}
                </p>
              </>
            ) : (
              <p className="text-[13px] text-accent-amber">Henüz banka bilgin kayıtlı değil.</p>
            )}
            <p className="text-[11.5px] text-ink-400 mt-2 leading-relaxed max-w-md">
              Güvenlik nedeniyle banka bilgini doğrudan değiştiremezsin — değişiklik isteği
              gönderirsin, yönetici onayladığında geçerli olur.
            </p>
          </div>
          {!openBankRequest && (
            <Button onClick={() => setShowBankForm(true)}>
              <Icon name="bank" size={15} /> Değişiklik iste
            </Button>
          )}
        </div>

        {openBankRequest && (
          <div className="mt-3.5 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3 flex items-start gap-2.5">
            <Icon name="alert" size={15} className="text-accent-amber mt-0.5 shrink-0" />
            <div>
              <p className="text-[12.5px] text-amber-900">
                <b>{dateTr(openBankRequest.createdAt)}</b> tarihinde gönderdiğin değişiklik isteği
                yönetici onayını bekliyor.
              </p>
              <p className="text-[11.5px] text-amber-800/80 mt-1 font-mono">
                {openBankRequest.bankName} · {maskIban(openBankRequest.iban)}
              </p>
            </div>
          </div>
        )}

        {showBankForm && (
          <BankChangeForm
            artistId={artistId}
            current={bank}
            onClose={() => setShowBankForm(false)}
            onSubmitted={async () => { setShowBankForm(false); await refreshBank(); }}
          />
        )}
      </Card>

      {/* -------------------------------------------------- dönem dökümü */}
      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-3">
          Dönem dökümü
        </p>
        {periods.length === 0 ? (
          <Empty title="Hakediş kaydı yok" icon={<Icon name="wallet" />} />
        ) : (
          <div className="space-y-1">
            {periods.map((p) => {
              const done = p.remaining <= 0.005;
              return (
                <div key={p.periodId} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-ink-900/[0.02]">
                  <span className={clsx(
                    "w-2 h-2 rounded-full shrink-0",
                    done ? "bg-brand-500" : p.paid > 0.005 ? "bg-accent-amber" : "bg-ink-300"
                  )} />
                  <span className="text-[13px] text-ink-900 flex-1">{p.display}</span>
                  <span className="text-[12px] text-ink-400 tabular w-20 text-right">{money(p.net)}</span>
                  <span className={clsx("text-[11.5px] font-medium w-24 text-right",
                    done ? "text-brand-600" : p.paid > 0.005 ? "text-accent-amber" : "text-ink-400")}>
                    {done ? "ödendi" : p.paid > 0.005 ? `kalan ${money(p.remaining)}` : "bekliyor"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* -------------------------------------------------- ödeme geçmişi */}
      {payments.length > 0 && (
        <Card>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-3">
            Ödeme geçmişi
          </p>
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="rounded-xl border border-line p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13px] font-medium text-ink-900">
                    {p.paidCurrency === "USD" ? money(p.paidAmount) : amountIn(p.paidAmount, p.paidCurrency)}
                    {p.paidCurrency !== "USD" && (
                      <span className="text-[11.5px] text-ink-400 font-normal">
                        {" "}({money(p.amountUsd)} · kur {p.exchangeRate?.toFixed(2)})
                      </span>
                    )}
                  </span>
                  <span className="text-[11.5px] text-ink-400">{dateTr(p.paidAt)}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {p.periods.map((x) => (
                    <span key={x.periodId} className="text-[10.5px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-700">
                      {x.display}
                    </span>
                  ))}
                </div>
                {p.note && <p className="text-[11.5px] text-ink-500 mt-1.5">{p.note}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* --------------------------------------------- banka değişikliği formu */

function BankChangeForm({
  artistId, current, onClose, onSubmitted,
}: {
  artistId: string;
  current: BankAccount | null;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [holder, setHolder] = useState(current?.accountHolder ?? "");
  const [bankName, setBankName] = useState(current?.bankName ?? "");
  const [iban, setIban] = useState(current?.iban ?? "");
  const [currency, setCurrency] = useState<Currency>(current?.currency ?? "USD");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/bank/${artistId}/request`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountHolder: holder, bankName, iban, currency, note: note || null }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error); return; }
      onSubmitted();
    } finally { setBusy(false); }
  };

  return (
    <div className="mt-4 pt-4 border-t border-line space-y-3">
      <Field label="Hesap sahibi" value={holder} onChange={setHolder} placeholder="Ad Soyad" />
      <Field label="Banka" value={bankName} onChange={setBankName} placeholder="Ziraat Bankası" />
      <Field label="IBAN" value={iban} onChange={setIban}
        placeholder="TR33 0006 1005 1978 6457 8413 26" mono />
      <div>
        <label className="block text-[11.5px] font-medium text-ink-400 mb-1.5">Para birimi</label>
        <div className="flex items-center gap-2">
          {CURRENCIES.map((c) => (
            <button key={c} onClick={() => setCurrency(c)}
              className={clsx(
                "px-3.5 py-2 rounded-xl text-[13px] font-medium transition-colors",
                currency === c ? "bg-ink-900 text-white" : "bg-white border border-line text-ink-700 hover:bg-ink-900/[0.03]"
              )}>
              {CURRENCY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>
      <Field label="Not (opsiyonel)" value={note} onChange={setNote} placeholder="Bankamı değiştirdim…" />

      {err && (
        <p className="text-[12.5px] text-accent-rose flex items-start gap-1.5">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {err}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button onClick={onClose}>Vazgeç</Button>
        <Button variant="primary" onClick={submit} disabled={busy}>
          {busy ? "Gönderiliyor…" : "İsteği gönder"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, mono,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean }) {
  return (
    <div>
      <label className="block text-[11.5px] font-medium text-ink-400 mb-1.5">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={clsx(
          "w-full rounded-xl border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand-500 transition-colors",
          mono && "font-mono text-[13px]"
        )}
      />
    </div>
  );
}
