"use client";

import { useEffect, useState } from "react";
import type { Result } from "@/lib/types";
import { money, pct } from "@/lib/format";
import { Icon } from "./ui";

/**
 * SWIFT / banka kesintisi girişi. Kullanıcı bankaya FİİLEN YATAN tutarı girer;
 * kesinti ve oran otomatik hesaplanır.
 */
export function SettleBar({
  res,
  received,
  onReceived,
}: {
  res: Result;
  received: number | null;
  onReceived: (v: number | null) => void;
}) {
  const [draft, setDraft] = useState(received === null ? "" : String(received));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDraft(received === null ? "" : String(received));
  }, [received, focused]);

  const commit = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.,-]/g, "").replace(",", ".");
    if (cleaned === "" || cleaned === "-") {
      onReceived(null);
      return;
    }
    const n = parseFloat(cleaned);
    onReceived(Number.isFinite(n) ? n : null);
  };

  const t = res.totals;
  const active = received !== null && t.deduction !== 0;

  return (
    <div className="rounded-xl2 bg-card border border-line shadow-card p-4 flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-ink-900/[0.05] flex items-center justify-center">
          <Icon name="bank" size={17} className="text-ink-700" />
        </div>
        <div>
          <p className="text-[12.5px] font-semibold text-ink-900 leading-tight">SWIFT Mutabakatı</p>
          <p className="text-[11px] text-ink-400 leading-tight">Bankaya yatan tutarı gir</p>
        </div>
      </div>

      <div className="h-9 w-px bg-line hidden sm:block" />

      <Field label="Rapor brüt toplamı" value={money(t.gross, true)} />

      <div>
        <label className="block text-[11px] font-medium text-ink-400 mb-1">Bankaya yatan</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-400 pointer-events-none">
            $
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            placeholder={t.gross.toFixed(2)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              commit(draft);
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              commit(e.target.value);
            }}
            className="w-36 rounded-xl border border-line pl-7 pr-3 py-1.5 text-[14px] font-semibold text-ink-900 tabular outline-none focus:border-brand-500 transition-colors"
          />
        </div>
      </div>

      <Field
        label="Kesinti"
        value={money(t.deduction)}
        tone={active ? "rose" : "muted"}
      />
      <Field
        label="Kesinti oranı"
        value={pct(t.deductionRate, 2)}
        tone={active ? "rose" : "muted"}
      />
      <Field
        label="Net ödeme oranı"
        value={t.netRate.toFixed(5)}
        tone={active ? "brand" : "muted"}
      />

      <div className="ml-auto flex items-center gap-2">
        {received !== null && (
          <button
            onClick={() => onReceived(null)}
            className="text-[11.5px] text-ink-400 hover:text-accent-rose transition-colors"
          >
            Sıfırla
          </button>
        )}
        <div className="rounded-xl bg-brand-50 px-3.5 py-2">
          <p className="text-[10.5px] font-medium text-brand-700/70 leading-tight">DAĞITILACAK NET</p>
          <p className="text-[17px] font-semibold text-brand-700 tabular leading-tight mt-0.5">
            {money(t.received)}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "rose" | "brand" | "muted";
}) {
  const color = {
    default: "text-ink-900",
    rose: "text-accent-rose",
    brand: "text-brand-600",
    muted: "text-ink-300",
  }[tone];
  return (
    <div>
      <p className="text-[11px] font-medium text-ink-400 mb-1">{label}</p>
      <p className={`text-[14px] font-semibold tabular ${color}`}>{value}</p>
    </div>
  );
}
