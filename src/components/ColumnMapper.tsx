"use client";

import { FIELDS } from "@/lib/columns";
import type { ColumnMap } from "@/lib/columns";
import { Button, Card, Icon } from "./ui";

/**
 * Kolon başlıkları beklenenden farklıysa kullanıcı elle eşler.
 * Otomatik eşleşme tuttuysa bu ekran atlanır.
 */
export function ColumnMapper({
  headers,
  map,
  onChange,
  onConfirm,
  onCancel,
  sample,
  fileName,
  rowCount,
}: {
  headers: string[];
  map: ColumnMap;
  onChange: (m: ColumnMap) => void;
  onConfirm: () => void;
  onCancel: () => void;
  sample: unknown[][];
  fileName: string;
  rowCount: number;
}) {
  const missing = FIELDS.filter((f) => f.required && map[f.key] === undefined);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={onCancel}
          className="text-[13px] text-ink-500 hover:text-ink-900 inline-flex items-center gap-1.5 mb-3 transition-colors"
        >
          <Icon name="back" size={15} /> Başka dosya seç
        </button>
        <h1 className="text-[22px] font-semibold text-ink-900 tracking-tight">Kolonları eşle</h1>
        <p className="text-[13.5px] text-ink-500 mt-1.5">
          <span className="font-medium text-ink-700">{fileName}</span> · {rowCount.toLocaleString("tr-TR")} satır
          okundu. Aşağıdaki eşleşmeleri kontrol et; yanlış olanı değiştir.
        </p>
      </div>

      {missing.length > 0 && (
        <div className="mb-5 rounded-xl bg-amber-50 border border-amber-200 p-3.5 flex items-start gap-2.5">
          <Icon name="alert" size={16} className="text-accent-amber mt-0.5 shrink-0" />
          <p className="text-[13px] text-amber-900">
            Zorunlu alan eksik: <b>{missing.map((m) => m.label).join(", ")}</b>. Hesaplama için bu
            kolonların seçilmesi gerekiyor.
          </p>
        </div>
      )}

      <Card pad={false}>
        <div className="divide-y divide-line">
          {FIELDS.map((f) => {
            const idx = map[f.key];
            const matched = idx !== undefined;
            const preview = matched
              ? sample
                  .slice(0, 3)
                  .map((r) => String(r[idx] ?? "").slice(0, 28))
                  .filter(Boolean)
                  .join("  ·  ")
              : "";
            return (
              <div key={f.key} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-44 shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13.5px] font-medium text-ink-900">{f.label}</span>
                    {f.required && (
                      <span className="text-[10px] font-bold text-accent-rose">ZORUNLU</span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-ink-400 mt-0.5 leading-snug">{f.hint}</p>
                </div>

                <div className="flex-1 min-w-0">
                  <select
                    value={idx ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const next = { ...map };
                      if (v === "") delete next[f.key];
                      else next[f.key] = Number(v);
                      onChange(next);
                    }}
                    className={`w-full rounded-xl border px-3 py-2 text-[13px] bg-white outline-none transition-colors ${
                      matched ? "border-line text-ink-900" : "border-rose-200 text-ink-400"
                    } focus:border-brand-500`}
                  >
                    <option value="">— kullanma —</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `(kolon ${i + 1})`}
                      </option>
                    ))}
                  </select>
                  {preview && (
                    <p className="text-[11px] text-ink-300 mt-1.5 truncate font-mono">{preview}</p>
                  )}
                </div>

                <div className="w-6 shrink-0 flex justify-center">
                  {matched && <Icon name="check" size={16} className="text-brand-500" strokeWidth={2.4} />}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="flex justify-end gap-2 mt-5">
        <Button onClick={onCancel}>Vazgeç</Button>
        <Button variant="primary" onClick={onConfirm} disabled={missing.length > 0}>
          Hesapla <Icon name="check" size={15} strokeWidth={2.4} />
        </Button>
      </div>
    </div>
  );
}
