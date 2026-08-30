"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import { Icon } from "./ui";

export function Uploader({
  onFile,
  busy,
  error,
}: {
  onFile: (f: File) => void;
  busy?: boolean;
  error?: string | null;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handle = useCallback(
    (files: FileList | null) => {
      const f = files?.[0];
      if (f) onFile(f);
    },
    [onFile]
  );

  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8 rise">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-brand-50 items-center justify-center mb-4 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="M4NM" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-[26px] font-semibold text-ink-900 tracking-tight">
            M4NM Music Profit
          </h1>
          <p className="text-[14px] text-ink-500 mt-2 max-w-md mx-auto leading-relaxed">
            Virgin dağıtım raporunu sürükleyip bırak. Sanatçı hakedişlerini, ortak şarkı
            bölüşümlerini ve SWIFT kesintisini otomatik hesaplayayım.
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            handle(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            "rounded-xl3 border-2 border-dashed bg-card p-12 text-center cursor-pointer transition-all",
            over
              ? "border-brand-500 bg-brand-50 scale-[1.01]"
              : "border-line hover:border-brand-300 hover:bg-brand-50/30",
            busy && "pointer-events-none opacity-60"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.xlsm,.csv,.tsv"
            className="hidden"
            onChange={(e) => handle(e.target.files)}
          />
          <div
            className={clsx(
              "inline-flex w-12 h-12 rounded-2xl items-center justify-center mb-4 transition-colors",
              over ? "bg-brand-500 text-white" : "bg-ink-900/[0.05] text-ink-500"
            )}
          >
            <Icon name={busy ? "clock" : "upload"} size={22} />
          </div>
          <p className="text-[15px] font-medium text-ink-900">
            {busy ? "Dosya okunuyor…" : "Excel dosyasını buraya bırak"}
          </p>
          <p className="text-[13px] text-ink-400 mt-1.5">
            veya tıklayıp seç · .xlsx · .xls · .csv
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200 p-3.5 flex items-start gap-2.5 fade-in">
            <Icon name="alert" size={16} className="text-accent-rose mt-0.5 shrink-0" />
            <p className="text-[13px] text-accent-rose">{error}</p>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              icon: "split",
              title: "Ortak şarkı bölüşümü",
              text: "Virgül, feat. ve x ile ayrılan sanatçıları tanır; ilk isim ana sanatçıdır.",
            },
            {
              icon: "bank",
              title: "Oransal SWIFT kesintisi",
              text: "Banka masrafı sanatçı sayısına değil, kazanca göre paylaştırılır.",
            },
            {
              icon: "users",
              title: "Cihazından çıkmaz",
              text: "Dosya hiçbir sunucuya gönderilmez, tamamen tarayıcında işlenir.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-xl2 bg-card border border-line p-4">
              <Icon name={f.icon} size={17} className="text-brand-500 mb-2" />
              <p className="text-[12.5px] font-semibold text-ink-900">{f.title}</p>
              <p className="text-[11.5px] text-ink-400 mt-1 leading-relaxed">{f.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
