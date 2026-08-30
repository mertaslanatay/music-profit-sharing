"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { BalanceRow, PaymentRow, PeriodStatus } from "@/lib/payments";
import { foldKey } from "@/lib/normalize";
import { money, num } from "@/lib/format";
import { Avatar, Bar, Button, Card, Empty, Icon, Td, Th } from "./ui";
import type { BankChangeRequestRow } from "@/lib/payments";

const tl = (v: number) =>
  `₺${new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`;

const dateTr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export function PaymentsPanel({ initial }: { initial: BalanceRow[] }) {
  const [rows, setRows] = useState(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "unpaid" | "requested">("all");
  const [openArtist, setOpenArtist] = useState<BalanceRow | null>(null);
  const [bankArtist, setBankArtist] = useState<BalanceRow | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/payments");
    const j = await r.json();
    if (j.balances) setRows(j.balances);
  }, []);

  const list = useMemo(() => {
    const k = foldKey(q);
    return rows.filter((r) => {
      if (k && !foldKey(r.artistName).includes(k)) return false;
      if (filter === "open") return r.balance > 0.005;
      if (filter === "unpaid") return r.unpaidPeriods >= 2;
      if (filter === "requested") return r.hasOpenRequest;
      return true;
    });
  }, [rows, q, filter]);

  const totals = useMemo(
    () => ({
      earned: rows.reduce((a, r) => a + r.earned, 0),
      paid: rows.reduce((a, r) => a + r.paid, 0),
      balance: rows.reduce((a, r) => a + r.balance, 0),
      requests: rows.filter((r) => r.hasOpenRequest).length,
      noBank: rows.filter((r) => r.balance > 0.005 && !r.bank?.iban).length,
    }),
    [rows]
  );

  const maxBalance = Math.max(...rows.map((r) => r.balance), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Toplam hakediş" value={money(totals.earned)} sub="tüm dönemler, net" />
        <Stat label="Ödenen" value={money(totals.paid)} tone="brand" />
        <Stat label="Bekleyen bakiye" value={money(totals.balance)} tone="amber"
          sub={`${num(rows.filter((r) => r.balance > 0.005).length)} sanatçı`} />
        <Stat label="Ödeme isteği" value={num(totals.requests)} tone={totals.requests ? "rose" : "muted"}
          sub={totals.requests ? "yanıt bekliyor" : "bekleyen yok"} />
      </div>

      <BankRequestsBar />

      {totals.noBank > 0 && (
        <div className="rounded-xl2 bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2.5">
          <Icon name="alert" size={16} className="text-accent-amber mt-0.5 shrink-0" />
          <p className="text-[12.5px] text-amber-900">
            Bakiyesi olan <b>{num(totals.noBank)}</b> sanatçının IBAN bilgisi eksik. Ödeme yapmadan
            önce banka bilgilerini girmen gerekiyor.
          </p>
        </div>
      )}

      <Card pad={false}>
        <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-line">
          <div>
            <h3 className="text-[15px] font-semibold text-ink-900">Sanatçı Bakiyeleri</h3>
            <p className="text-[12.5px] text-ink-500 mt-0.5">
              {num(list.length)} sanatçı · bekleyen toplam{" "}
              <b className="text-ink-700">{money(list.reduce((a, r) => a + r.balance, 0))}</b>
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Sanatçı ara…"
              className="rounded-xl border border-line px-3 py-1.5 text-[12.5px] outline-none focus:border-brand-500 w-40"
            />
            {([
              ["all", "Tümü"],
              ["open", "Bakiyesi olan"],
              ["unpaid", "2+ dönem birikmiş"],
              ["requested", "İstek gönderen"],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={clsx(
                  "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors",
                  filter === k ? "bg-ink-900 text-white" : "bg-ink-900/[0.04] text-ink-700 hover:bg-ink-900/[0.08]"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {list.length === 0 ? (
          <Empty title="Kayıt yok" sub="Filtreyi değiştirmeyi dene." icon={<Icon name="wallet" />} />
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[980px]">
              <thead className="bg-ink-900/[0.02] border-b border-line">
                <tr>
                  <Th align="left">Sanatçı</Th>
                  <Th align="right">Hakediş</Th>
                  <Th align="right">Ödenen</Th>
                  <Th align="right">Bakiye</Th>
                  <Th align="left" className="w-28">Durum</Th>
                  <Th align="center">Bekleyen dönem</Th>
                  <Th align="left">Son ödeme</Th>
                  <Th align="left">Banka</Th>
                  <Th align="right">İşlem</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {list.map((r) => (
                  <tr key={r.artistId} className="hover:bg-ink-900/[0.02]">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.artistName} size={30} />
                        <div className="min-w-0">
                          <p className="font-medium text-ink-900 truncate max-w-[180px]">{r.artistName}</p>
                          {r.hasOpenRequest && (
                            <p className="text-[10.5px] text-accent-rose font-medium">
                              ödeme isteği · {dateTr(r.openRequestAt)}
                            </p>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td align="right" className="text-ink-500">{money(r.earned)}</Td>
                    <Td align="right" className="text-brand-600">{r.paid ? money(r.paid) : "—"}</Td>
                    <Td align="right" className="font-semibold text-ink-900">{money(r.balance)}</Td>
                    <Td>
                      <Bar value={r.balance} max={maxBalance}
                        color={r.balance <= 0.005 ? "#16A75C" : r.unpaidPeriods >= 3 ? "#E5556E" : "#F2A93B"} />
                    </Td>
                    <Td align="center">
                      {r.unpaidPeriods > 0 ? (
                        <span className={clsx(
                          "text-[11px] font-semibold px-2 py-0.5 rounded-full",
                          r.unpaidPeriods >= 3 ? "bg-rose-50 text-accent-rose" : "bg-accent-amber/15 text-accent-amber"
                        )} title={r.oldestUnpaidLabel ? `En eski: ${r.oldestUnpaidLabel}` : undefined}>
                          {r.unpaidPeriods} dönem
                        </span>
                      ) : (
                        <span className="text-[11px] text-brand-600">güncel</span>
                      )}
                    </Td>
                    <Td className="text-[12px] text-ink-500">{dateTr(r.lastPaidAt)}</Td>
                    <Td>
                      {r.bank?.iban ? (
                        <span className="text-[11.5px] text-ink-600">
                          {r.bank.bankName || "—"}{" "}
                          <span className="text-ink-300">· {r.bank.currency}</span>
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-accent-amber">eksik</span>
                      )}
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setBankArtist(r)}
                          className="text-[11.5px] text-ink-500 hover:text-ink-900 transition-colors">
                          Banka
                        </button>
                        <button onClick={() => setOpenArtist(r)}
                          className="text-[11.5px] font-medium text-brand-600 hover:text-brand-700">
                          Cari hesap
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openArtist && (
        <LedgerDrawer artist={openArtist} onClose={() => setOpenArtist(null)} onChanged={refresh} />
      )}
      {bankArtist && (
        <BankDialog artist={bankArtist} onClose={() => setBankArtist(null)} onSaved={refresh} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ cari hesap */

function LedgerDrawer({
  artist, onClose, onChanged,
}: { artist: BalanceRow; onClose: () => void; onChanged: () => void }) {
  const [periods, setPeriods] = useState<PeriodStatus[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [currency, setCurrency] = useState<"USD" | "TRY">(artist.bank?.currency ?? "USD");
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/artists/${artist.artistId}/ledger`);
    const j = await r.json();
    if (j.periods) { setPeriods(j.periods); setPayments(j.payments); }
    setLoading(false);
  }, [artist.artistId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  // Başlık rakamlarını listeden gelen prop yerine yüklenen dökümden türetiyoruz;
  // ödeme kaydedildikten sonra prop bayat kalıyordu.
  const live = periods.length
    ? {
        earned: periods.reduce((a, p) => a + p.net, 0),
        paid: periods.reduce((a, p) => a + p.paid, 0),
        balance: periods.reduce((a, p) => a + p.remaining, 0),
      }
    : { earned: artist.earned, paid: artist.paid, balance: artist.balance };

  const open = periods.filter((p) => p.remaining > 0.005);
  const amountUsd = periods
    .filter((p) => sel.has(p.periodId))
    .reduce((a, p) => a + p.remaining, 0);
  const rateNum = Number(rate.replace(",", "."));
  const paidAmount = currency === "TRY" ? amountUsd * (rateNum || 0) : amountUsd;

  const toggle = (id: string) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSel(next);
  };

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artistId: artist.artistId,
          allocations: periods.filter((p) => sel.has(p.periodId))
            .map((p) => ({ periodId: p.periodId, amountUsd: p.remaining })),
          paidCurrency: currency,
          paidAmount,
          exchangeRate: currency === "TRY" ? rateNum : null,
          note: note || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) { setErr(j.error); return; }
      setSel(new Set()); setNote(""); setRate("");
      await load(); onChanged();
    } finally { setBusy(false); }
  };

  const undo = async (id: string) => {
    if (!confirm("Bu ödeme kaydı silinecek. Dönemler tekrar ödenmemiş sayılacak. Emin misin?")) return;
    const res = await fetch(`/api/payments/${id}`, { method: "DELETE" });
    if (res.ok) { await load(); onChanged(); }
  };

  return (
    <>
      <div className="fixed inset-0 bg-ink-900/25 z-40 fade-in" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-[620px] bg-canvas z-50 slide-in overflow-y-auto scroll-thin shadow-pop">
        <div className="sticky top-0 bg-card border-b border-line px-5 py-4 flex items-start gap-3 z-10">
          <Avatar name={artist.artistName} size={44} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold text-ink-900 truncate">{artist.artistName}</h2>
            <p className="text-[12px] text-ink-400 mt-0.5">
              Hakediş {money(live.earned)} · Ödenen {money(live.paid)} ·{" "}
              <b className="text-ink-700">Bakiye {money(live.balance)}</b>
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-ink-900/[0.06] flex items-center justify-center text-ink-500 shrink-0">
            <Icon name="close" size={17} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {artist.hasOpenRequest && live.balance > 0.005 && (
            <div className="rounded-xl2 bg-rose-50 border border-rose-200 p-3.5 flex items-start gap-2.5">
              <Icon name="alert" size={16} className="text-accent-rose mt-0.5 shrink-0" />
              <p className="text-[12.5px] text-accent-rose">
                Bu sanatçı <b>{dateTr(artist.openRequestAt)}</b> tarihinde ödeme isteği gönderdi.
                Ödemeyi kaydettiğinde istek otomatik kapanacak.
              </p>
            </div>
          )}

          {/* ---------------------------------------------- ödeme kaydet */}
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-3">
              Ödeme kaydet
            </p>

            {loading ? (
              <p className="text-[13px] text-ink-400 py-4 text-center">Yükleniyor…</p>
            ) : open.length === 0 ? (
              <p className="text-[13px] text-ink-500 py-3">
                Ödenmemiş dönem yok — bu sanatçının hesabı güncel.
              </p>
            ) : (
              <>
                <p className="text-[12px] text-ink-500 mb-2.5">
                  Kapatacağın dönemleri seç. Her dönem kalan tutarıyla kapatılır.
                </p>
                <div className="space-y-1 mb-4">
                  {open.map((p) => (
                    <button
                      key={p.periodId}
                      onClick={() => toggle(p.periodId)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-ink-900/[0.03] transition-colors"
                    >
                      <span className={clsx(
                        "w-4 h-4 rounded-[5px] border shrink-0 flex items-center justify-center transition-colors",
                        sel.has(p.periodId) ? "bg-brand-500 border-brand-500" : "bg-white border-ink-300"
                      )}>
                        {sel.has(p.periodId) && <Icon name="check" size={11} className="text-white" strokeWidth={3} />}
                      </span>
                      <span className="text-[13px] text-ink-900 flex-1 text-left">{p.display}</span>
                      {p.paid > 0.005 && (
                        <span className="text-[11px] text-ink-400">{money(p.paid)} ödenmiş</span>
                      )}
                      <span className="text-[13px] font-semibold text-ink-900 tabular">{money(p.remaining)}</span>
                    </button>
                  ))}
                </div>

                <div className="rounded-xl bg-ink-900/[0.03] p-4 space-y-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12.5px] text-ink-600">Kapatılacak hakediş</span>
                    <span className="text-[17px] font-semibold text-ink-900 tabular">{money(amountUsd)}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-ink-500 w-24">Para birimi</span>
                    {(["USD", "TRY"] as const).map((c) => (
                      <button key={c} onClick={() => setCurrency(c)}
                        className={clsx(
                          "px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors",
                          currency === c ? "bg-ink-900 text-white" : "bg-white border border-line text-ink-700"
                        )}>
                        {c === "USD" ? "Dolar" : "TL"}
                      </button>
                    ))}
                  </div>

                  {currency === "TRY" && (
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-ink-500 w-24">USD/TL kuru</span>
                      <input
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                        inputMode="decimal"
                        placeholder="42,50"
                        className="w-28 rounded-lg border border-line px-2.5 py-1.5 text-[13px] tabular bg-white outline-none focus:border-brand-500"
                      />
                      <span className="text-[12.5px] text-ink-500 ml-auto">
                        Ödenecek: <b className="text-ink-900 tabular">{rateNum > 0 ? tl(paidAmount) : "—"}</b>
                      </span>
                    </div>
                  )}

                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Not (opsiyonel) — dekont no, açıklama…"
                    className="w-full rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] bg-white outline-none focus:border-brand-500"
                  />

                  {err && (
                    <p className="text-[12.5px] text-accent-rose flex items-start gap-1.5">
                      <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {err}
                    </p>
                  )}

                  <Button
                    variant="primary"
                    className="w-full justify-center"
                    disabled={busy || sel.size === 0 || (currency === "TRY" && !(rateNum > 0))}
                    onClick={submit}
                  >
                    <Icon name="check" size={15} strokeWidth={2.4} />
                    {busy ? "Kaydediliyor…" : `Ödemeyi kaydet · ${currency === "TRY" && rateNum > 0 ? tl(paidAmount) : money(amountUsd)}`}
                  </Button>
                </div>
              </>
            )}
          </Card>

          {/* ------------------------------------------- dönem dökümü */}
          <Card>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-3">
              Dönem dökümü
            </p>
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
              {periods.length === 0 && !loading && (
                <p className="text-[13px] text-ink-400 py-3 text-center">Hakediş kaydı yok.</p>
              )}
            </div>
          </Card>

          {/* --------------------------------------------- ödeme geçmişi */}
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
                        {p.paidCurrency === "TRY" ? tl(p.paidAmount) : money(p.paidAmount)}
                        {p.paidCurrency === "TRY" && (
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
                    <div className="flex items-center gap-3 mt-2">
                      {p.ibanSnapshot && (
                        <span className="text-[10.5px] text-ink-300 font-mono">{p.ibanSnapshot}</span>
                      )}
                      <button onClick={() => undo(p.id)}
                        className="ml-auto text-[11.5px] text-ink-400 hover:text-accent-rose transition-colors">
                        Geri al
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------- banka bilgileri */

function BankDialog({
  artist, onClose, onSaved,
}: { artist: BalanceRow; onClose: () => void; onSaved: () => void }) {
  const b = artist.bank;
  const [holder, setHolder] = useState(b?.accountHolder ?? artist.artistName);
  const [bank, setBank] = useState(b?.bankName ?? "");
  const [iban, setIban] = useState(b?.iban ?? "");
  const [currency, setCurrency] = useState<"USD" | "TRY">(b?.currency ?? "USD");
  const [note, setNote] = useState(b?.note ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    const res = await fetch(`/api/bank/${artist.artistId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountHolder: holder, bankName: bank, iban, currency, note }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(j.error); return; }
    onSaved(); onClose();
  };

  return (
    <>
      <div className="fixed inset-0 bg-ink-900/25 z-40 fade-in" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <div className="w-full max-w-md rounded-xl3 bg-card border border-line shadow-pop p-5 pointer-events-auto rise">
          <div className="flex items-start gap-3 mb-4">
            <Avatar name={artist.artistName} size={38} />
            <div className="flex-1 min-w-0">
              <h3 className="text-[15px] font-semibold text-ink-900">Banka bilgileri</h3>
              <p className="text-[12px] text-ink-400">{artist.artistName}</p>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-ink-900/[0.06] flex items-center justify-center text-ink-500">
              <Icon name="close" size={17} />
            </button>
          </div>

          <div className="space-y-3">
            <Field label="Hesap sahibi" value={holder} onChange={setHolder} placeholder="Ad Soyad" />
            <Field label="Banka" value={bank} onChange={setBank} placeholder="Ziraat Bankası" />
            <Field label="IBAN" value={iban} onChange={setIban}
              placeholder="TR33 0006 1005 1978 6457 8413 26" mono />
            <div>
              <label className="block text-[11.5px] font-medium text-ink-400 mb-1.5">Para birimi</label>
              <div className="flex items-center gap-2">
                {(["USD", "TRY"] as const).map((c) => (
                  <button key={c} onClick={() => setCurrency(c)}
                    className={clsx(
                      "px-3.5 py-2 rounded-xl text-[13px] font-medium transition-colors",
                      currency === c ? "bg-ink-900 text-white" : "bg-white border border-line text-ink-700 hover:bg-ink-900/[0.03]"
                    )}>
                    {c === "USD" ? "Dolar (USD)" : "Türk Lirası (TRY)"}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-ink-400 mt-1.5">
                Hakedişler dolar hesaplanır. TL seçersen ödeme sırasında kuru girersin.
              </p>
            </div>
            <Field label="Not" value={note} onChange={setNote} placeholder="Opsiyonel" />
          </div>

          {err && (
            <p className="text-[12.5px] text-accent-rose mt-3 flex items-start gap-1.5">
              <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {err}
            </p>
          )}

          <div className="flex justify-end gap-2 mt-5">
            <Button onClick={onClose}>Vazgeç</Button>
            <Button variant="primary" onClick={save} disabled={busy}>
              {busy ? "Kaydediliyor…" : "Kaydet"}
            </Button>
          </div>
        </div>
      </div>
    </>
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

/* ------------------------------------------- banka değişiklik istekleri */

function BankRequestsBar() {
  const [rows, setRows] = useState<BankChangeRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/bank-requests?status=pending");
    const j = await r.json();
    if (j.requests) setRows(j.requests);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resolve = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/bank-requests/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) await load();
    } finally { setBusyId(null); }
  };

  if (loading || rows.length === 0) return null;

  return (
    <div className="rounded-xl2 bg-card border border-amber-200 shadow-card p-4 space-y-2.5">
      <p className="text-[12.5px] font-semibold text-amber-900 flex items-center gap-2">
        <Icon name="bank" size={15} className="text-accent-amber" />
        {rows.length} banka değişikliği isteği onay bekliyor
      </p>
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-xl bg-amber-50/60">
          <Avatar name={r.artistName} size={30} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-ink-900">{r.artistName}</p>
            <p className="text-[11.5px] text-ink-500 font-mono truncate">
              {r.bankName} · {r.iban}
              {r.current?.iban && (
                <span className="text-ink-300"> (eski: {r.current.iban})</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => resolve(r.id, "reject")}
              disabled={busyId === r.id}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white border border-line text-ink-600 hover:bg-ink-900/[0.03] transition-colors"
            >
              Reddet
            </button>
            <button
              onClick={() => resolve(r.id, "approve")}
              disabled={busyId === r.id}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
            >
              {busyId === r.id ? "…" : "Onayla"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({
  label, value, sub, tone = "neutral",
}: { label: string; value: string; sub?: string; tone?: "neutral" | "brand" | "amber" | "rose" | "muted" }) {
  const color = {
    neutral: "text-ink-900", brand: "text-brand-600", amber: "text-accent-amber",
    rose: "text-accent-rose", muted: "text-ink-300",
  }[tone];
  return (
    <Card>
      <p className="text-[12.5px] font-medium text-ink-500">{label}</p>
      <p className={clsx("text-[24px] font-semibold tabular mt-1.5 leading-none", color)}>{value}</p>
      {sub && <p className="text-[11.5px] text-ink-400 mt-2">{sub}</p>}
    </Card>
  );
}
