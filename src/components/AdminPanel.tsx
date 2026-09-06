"use client";

import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import type { ReportRow } from "@/lib/queries";
import { money, num } from "@/lib/format";
import { Button, Card, CardHead, Empty, Icon, Td, Th } from "./ui";

interface UploadStats {
  reportId: string;
  gross: number;
  received: number;
  deduction: number;
  rowCount: number;
  artistCount: number;
  songCount: number;
  labelCount: number;
  periods: { label: string; year: number; month: number | null; gross: number }[];
}

interface QueueItem {
  file: File;
  status: "pending" | "uploading" | "done" | "error" | "duplicate";
  message?: string;
}

interface PreviewData {
  mapping: { key: string; label: string; required: boolean; header: string | null }[];
  rowCount: number;
  negativeRows: number;
  gross: number;
  artistCount: number;
  songCount: number;
  labelCount: number;
  periods: {
    label: string;
    display: string;
    gross: number;
    rowCount: number;
    existingReports: { id: string; title: string; status: ReportRow["status"]; gross: number }[];
  }[];
  sample: { artist: string; parts: string[]; song: string; period: string; net: number }[];
  duplicateFile: { id: string; title: string; status: ReportRow["status"] } | null;
}

const STATUS: Record<ReportRow["status"], { label: string; cls: string }> = {
  draft: { label: "Taslak", cls: "bg-accent-amber/15 text-accent-amber" },
  published: { label: "Yayında", cls: "bg-brand-50 text-brand-700" },
  locked: { label: "Kilitli", cls: "bg-ink-900/[0.07] text-ink-700" },
};

export function AdminPanel({ initialReports }: { initialReports: ReportRow[] }) {
  const [reports, setReports] = useState(initialReports);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<UploadStats | null>(null);
  const [over, setOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [deduction, setDeduction] = useState("");
  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [queueBusy, setQueueBusy] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/reports");
    const j = await r.json();
    if (j.reports) setReports(j.reports);
  }, []);

  const pick = (list: FileList | null | undefined) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    if (files.length === 1) {
      // Tek dosya: önce önizleme — kaydetmeden önce satır/sanatçı/dönem
      // kontrolü (v2 şartnamesi § 4.2, madde 3-4).
      setQueue(null);
      setFile(files[0]);
      setError(null);
      setStats(null);
      setPreview(null);
      if (!title) setTitle(files[0].name.replace(/\.[^.]+$/, ""));
      return;
    }
    // Birden fazla dosya: toplu yükleme kuyruğuna al. Her dosya kendi raporu
    // olur, adı dosya adından türetilir; kesinti sonradan listeden düzenlenir.
    // (Toplu kuyruk bilinçli olarak önizlemesiz — hız için tasarlandı; yanlış
    // giden bir dosya taslak olarak kalır ve listeden silinebilir.)
    setFile(null);
    setStats(null);
    setPreview(null);
    setError(null);
    setQueue(files.map((f) => ({ file: f, status: "pending" })));
  };

  const previewFile = async () => {
    if (!file) return;
    setPreviewBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/reports/preview", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok || j.ok !== true || !Array.isArray(j.periods)) {
        setError(j.message ?? j.error ?? "Önizleme başarısız.");
        return;
      }
      setPreview(j as PreviewData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Önizleme başarısız.");
    } finally {
      setPreviewBusy(false);
    }
  };

  const uploadOne = async (f: File, force: boolean): Promise<{ ok: true } | { ok: false; duplicate?: boolean; message: string }> => {
    const fd = new FormData();
    fd.set("file", f);
    fd.set("title", f.name.replace(/\.[^.]+$/, ""));
    fd.set("deduction", "0");
    if (force) fd.set("force", "1");
    try {
      const res = await fetch("/api/reports", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) {
        if (j.error === "duplicate") return { ok: false, duplicate: true, message: j.message ?? "Bu rapor daha önce yüklenmiş." };
        return { ok: false, message: j.message ?? j.error ?? "Yükleme başarısız." };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Yükleme başarısız." };
    }
  };

  const runQueue = async () => {
    if (!queue) return;
    setQueueBusy(true);
    const next = [...queue];
    for (let i = 0; i < next.length; i++) {
      if (next[i].status === "done") continue;
      next[i] = { ...next[i], status: "uploading" };
      setQueue([...next]);
      const r = await uploadOne(next[i].file, false);
      next[i] = r.ok
        ? { ...next[i], status: "done" }
        : { ...next[i], status: r.duplicate ? "duplicate" : "error", message: r.message };
      setQueue([...next]);
    }
    setQueueBusy(false);
    await refresh();
  };

  const retryQueueItem = async (i: number, force: boolean) => {
    if (!queue) return;
    setQueueBusy(true);
    const next = [...queue];
    next[i] = { ...next[i], status: "uploading" };
    setQueue([...next]);
    const r = await uploadOne(next[i].file, force);
    next[i] = r.ok
      ? { ...next[i], status: "done" }
      : { ...next[i], status: r.duplicate ? "duplicate" : "error", message: r.message };
    setQueue([...next]);
    setQueueBusy(false);
    await refresh();
  };

  const upload = async (force = false) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("title", title);
      fd.set("deduction", deduction || "0");
      if (force) fd.set("force", "1");
      const res = await fetch("/api/reports", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) {
        if (j.error === "duplicate") {
          if (confirm(`${j.message}\n\nYine de yeniden yüklensin mi?`)) return upload(true);
          setError(null);
        } else {
          setError(j.message ?? j.error ?? "Yükleme başarısız.");
        }
        return;
      }
      setStats(j.report);
      setFile(null);
      setTitle("");
      setDeduction("");
      setPreview(null);
      if (inputRef.current) inputRef.current.value = "";
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yükleme başarısız.");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (id: string, status: ReportRow["status"]) => {
    const res = await fetch(`/api/reports/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const j = await res.json();
    if (!res.ok) { alert(j.error); return; }
    await refresh();
  };

  const remove = async (r: ReportRow) => {
    if (!confirm(`"${r.title}" silinecek. Bu raporun tüm satırları ve hesapları kalkar. Emin misin?`)) return;
    const res = await fetch(`/api/reports/${r.id}`, { method: "DELETE" });
    const j = await res.json();
    if (!res.ok) { alert(j.error); return; }
    await refresh();
  };

  const editDeduction = async (r: ReportRow) => {
    const v = prompt(`"${r.title}" için SWIFT kesintisi (USD):`, String(r.deduction));
    if (v === null) return;
    const res = await fetch(`/api/reports/${r.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deduction: Number(v.replace(",", ".")) }),
    });
    const j = await res.json();
    if (!res.ok) { alert(j.error); return; }
    await refresh();
  };

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------- yükleme */}
      <Card>
        <CardHead
          title="Rapor yükle"
          sub="Excel sunucuda işlenir ve taslak olarak kaydedilir. Kontrol edip yayınlayana kadar kimse göremez."
        />

        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            "rounded-xl2 border-2 border-dashed p-8 text-center cursor-pointer transition-all",
            over ? "border-brand-500 bg-brand-50" : "border-line hover:border-brand-300 hover:bg-brand-50/30",
            busy && "pointer-events-none opacity-60"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.xlsm,.csv,.tsv"
            multiple
            className="hidden"
            onChange={(e) => pick(e.target.files)}
          />
          <div className={clsx(
            "inline-flex w-11 h-11 rounded-2xl items-center justify-center mb-3 transition-colors",
            over ? "bg-brand-500 text-white" : "bg-ink-900/[0.05] text-ink-500"
          )}>
            <Icon name={busy || queueBusy ? "clock" : file ? "file" : "upload"} size={20} />
          </div>
          <p className="text-[14px] font-medium text-ink-900">
            {busy
              ? "İşleniyor…"
              : file
                ? file.name
                : queue
                  ? `${queue.length} dosya seçildi`
                  : "Excel dosyasını buraya bırak"}
          </p>
          <p className="text-[12.5px] text-ink-400 mt-1">
            {file
              ? `${(file.size / 1024 / 1024).toFixed(1)} MB · değiştirmek için tıkla`
              : "veya tıklayıp seç · birden fazla dosya seçerek toplu yükleyebilirsin"}
          </p>
        </div>

        {file && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              <div className="sm:col-span-2">
                <label className="block text-[11.5px] font-medium text-ink-400 mb-1.5">Rapor adı</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="M4NM Q2 2026 Ödeme"
                  className="w-full rounded-xl border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-[11.5px] font-medium text-ink-400 mb-1.5">
                  SWIFT kesintisi
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-400">$</span>
                  <input
                    value={deduction}
                    onChange={(e) => setDeduction(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="w-full rounded-xl border border-line pl-7 pr-3 py-2 text-[13.5px] tabular outline-none focus:border-brand-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {!preview && (
              <div className="flex items-center justify-between gap-3 mt-4">
                <p className="text-[11.5px] text-ink-400">
                  Önce içeriği önizle — hiçbir şey kaydedilmeden kaç satır, kaç sanatçı, hangi
                  dönem olduğunu gösteririm.
                </p>
                <Button variant="primary" onClick={previewFile} disabled={!file || previewBusy}>
                  <Icon name="search" size={15} />
                  {previewBusy ? "İnceleniyor…" : "Önizle"}
                </Button>
              </div>
            )}

            {preview && (
              <div className="mt-4 rounded-xl2 border border-line bg-ink-900/[0.015] p-4 fade-in">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-[13.5px] font-semibold text-ink-900">Önizleme</p>
                    <p className="text-[12px] text-ink-500 mt-0.5">
                      Henüz hiçbir şey kaydedilmedi — aşağıyı kontrol et.
                    </p>
                  </div>
                  {preview.negativeRows > 0 && (
                    <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-amber-50 text-accent-amber shrink-0">
                      {num(preview.negativeRows)} negatif satır (iade/düzeltme)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Mini label="Toplam brüt" value={money(preview.gross, true)} />
                  <Mini label="Satır" value={num(preview.rowCount)} />
                  <Mini label="Sanatçı" value={num(preview.artistCount)} />
                  <Mini label="Şarkı" value={num(preview.songCount)} />
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {preview.periods.map((p) => (
                    <span
                      key={p.label}
                      className={clsx(
                        "text-[11.5px] px-2.5 py-1 rounded-lg border",
                        p.existingReports.length > 0
                          ? "bg-amber-50 text-accent-amber border-amber-200"
                          : "bg-white text-ink-700 border-line"
                      )}
                      title={
                        p.existingReports.length > 0
                          ? `Bu dönem için mevcut: ${p.existingReports
                              .map((e) => `${e.title} (${STATUS[e.status].label})`)
                              .join(", ")}`
                          : undefined
                      }
                    >
                      {p.display} · {money(p.gross, true)}
                      {p.existingReports.length > 0 && " ⚠"}
                    </span>
                  ))}
                </div>

                {preview.periods.some((p) => p.existingReports.length > 0) && (
                  <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5">
                    <Icon name="alert" size={15} className="text-accent-amber mt-0.5 shrink-0" />
                    <p className="text-[12px] text-accent-amber leading-relaxed">
                      Bu dosyadaki bir veya daha fazla dönem için zaten rapor var (yukarıda
                      işaretli). Devam edersen bu dönem için EK bir rapor oluşturulur — mevcut
                      rapor değişmez. Yanlışlıkla ikinci kez yüklüyorsan Vazgeç'e bas.
                    </p>
                  </div>
                )}

                {preview.duplicateFile && (
                  <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 p-3 flex items-start gap-2.5">
                    <Icon name="alert" size={15} className="text-accent-rose mt-0.5 shrink-0" />
                    <p className="text-[12px] text-accent-rose leading-relaxed">
                      Bu dosyanın birebir aynısı daha önce &ldquo;{preview.duplicateFile.title}&rdquo;
                      adıyla yüklenmiş ({STATUS[preview.duplicateFile.status].label}).
                    </p>
                  </div>
                )}

                <details className="mt-3">
                  <summary className="text-[11.5px] text-ink-500 cursor-pointer hover:text-ink-800 select-none">
                    İlk birkaç satırda sanatçı ayrıştırması nasıl görünüyor?
                  </summary>
                  <div className="mt-2 rounded-xl border border-line divide-y divide-line overflow-hidden">
                    {preview.sample.map((s, i) => (
                      <div key={i} className="px-3 py-2 text-[12px]">
                        <p className="text-ink-900">{s.artist}</p>
                        <p className="text-ink-400 mt-0.5">
                          → {s.parts.join(" · ")} · {s.song} · {s.period} · {money(s.net)}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>

                <details className="mt-2">
                  <summary className="text-[11.5px] text-ink-500 cursor-pointer hover:text-ink-800 select-none">
                    Kolon eşleşmesi hangi başlığı hangi alana bağladı?
                  </summary>
                  <div className="mt-2 rounded-xl border border-line divide-y divide-line overflow-hidden">
                    {preview.mapping.map((m) => (
                      <div key={m.key} className="flex items-center justify-between gap-3 px-3 py-1.5 text-[12px]">
                        <span className="text-ink-500">
                          {m.label}
                          {m.required && <span className="text-accent-rose"> *</span>}
                        </span>
                        <span className={clsx("truncate max-w-[220px]", m.header ? "text-ink-900" : "text-ink-300")}>
                          {m.header ?? "eşleşmedi"}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>

                <div className="flex items-center justify-end gap-2.5 mt-4">
                  <button
                    onClick={() => { setPreview(null); setFile(null); setTitle(""); setDeduction(""); if (inputRef.current) inputRef.current.value = ""; }}
                    disabled={busy}
                    className="text-[12.5px] text-ink-500 hover:text-ink-900 transition-colors disabled:opacity-40"
                  >
                    Vazgeç
                  </button>
                  <Button variant="primary" onClick={() => upload()} disabled={busy}>
                    <Icon name="upload" size={15} />
                    {busy ? "Kaydediliyor…" : "Onayla ve kaydet"}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {queue && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <p className="text-[11.5px] text-ink-400">
                Her dosya ayrı bir rapor (taslak) olarak yüklenir · adı dosya adından, kesintisi 0
                olarak başlar — sonradan listeden düzenle.
              </p>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => { setQueue(null); if (inputRef.current) inputRef.current.value = ""; }}
                  disabled={queueBusy}
                  className="text-[11.5px] text-ink-400 hover:text-ink-700 transition-colors disabled:opacity-40"
                >
                  Vazgeç
                </button>
                <Button
                  variant="primary"
                  onClick={runQueue}
                  disabled={queueBusy || queue.every((q) => q.status === "done")}
                >
                  <Icon name="upload" size={15} />
                  {queueBusy ? "Yükleniyor…" : `${queue.length} dosyayı yükle`}
                </Button>
              </div>
            </div>

            <div className="rounded-xl2 border border-line divide-y divide-line overflow-hidden">
              {queue.map((q, i) => (
                <div key={`${q.file.name}-${i}`} className="flex items-center gap-3 px-3.5 py-2.5">
                  <Icon
                    name={
                      q.status === "done" ? "check"
                      : q.status === "error" ? "alert"
                      : q.status === "duplicate" ? "alert"
                      : q.status === "uploading" ? "clock"
                      : "file"
                    }
                    size={15}
                    className={clsx(
                      "shrink-0",
                      q.status === "done" ? "text-brand-600"
                      : q.status === "error" ? "text-accent-rose"
                      : q.status === "duplicate" ? "text-accent-amber"
                      : "text-ink-400"
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink-900 truncate">{q.file.name}</p>
                    {q.message && (
                      <p className={clsx(
                        "text-[11px] mt-0.5",
                        q.status === "duplicate" ? "text-accent-amber" : "text-accent-rose"
                      )}>
                        {q.message}
                      </p>
                    )}
                  </div>
                  <span className={clsx(
                    "text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0",
                    q.status === "done" ? "bg-brand-50 text-brand-700"
                    : q.status === "error" ? "bg-rose-50 text-accent-rose"
                    : q.status === "duplicate" ? "bg-amber-50 text-accent-amber"
                    : q.status === "uploading" ? "bg-ink-900/[0.06] text-ink-600"
                    : "bg-ink-900/[0.04] text-ink-400"
                  )}>
                    {{
                      pending: "bekliyor",
                      uploading: "yükleniyor…",
                      done: "yüklendi",
                      error: "hata",
                      duplicate: "zaten var",
                    }[q.status]}
                  </span>
                  {(q.status === "error" || q.status === "duplicate") && !queueBusy && (
                    <button
                      onClick={() => retryQueueItem(i, q.status === "duplicate")}
                      className="text-[11px] font-medium text-brand-600 hover:text-brand-700 shrink-0"
                    >
                      {q.status === "duplicate" ? "yine de yükle" : "tekrar dene"}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200 p-3.5 flex items-start gap-2.5 fade-in">
            <Icon name="alert" size={16} className="text-accent-rose mt-0.5 shrink-0" />
            <p className="text-[13px] text-accent-rose">{error}</p>
          </div>
        )}

        {stats && (
          <div className="mt-4 rounded-xl2 bg-brand-50 border border-brand-100 p-4 fade-in">
            <div className="flex items-start gap-2.5 mb-3">
              <Icon name="check" size={16} className="text-brand-600 mt-0.5 shrink-0" strokeWidth={2.4} />
              <div>
                <p className="text-[13.5px] font-semibold text-brand-700">Taslak olarak kaydedildi</p>
                <p className="text-[12px] text-brand-700/70 mt-0.5">
                  Aşağıdaki listeden kontrol edip yayınla.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Mini label="Brüt" value={money(stats.gross, true)} />
              <Mini label="Dağıtılacak net" value={money(stats.received)} />
              <Mini label="Sanatçı" value={num(stats.artistCount)} />
              <Mini label="Satır" value={num(stats.rowCount)} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {stats.periods.map((p) => (
                <span key={p.label} className="text-[11.5px] px-2.5 py-1 rounded-lg bg-white text-ink-700 border border-brand-100">
                  {p.label} · {money(p.gross, true)}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ------------------------------------------------------ rapor listesi */}
      <Card pad={false}>
        <div className="px-5 py-4 border-b border-line">
          <h3 className="text-[15px] font-semibold text-ink-900">Raporlar</h3>
          <p className="text-[12.5px] text-ink-500 mt-0.5">
            {num(reports.length)} rapor · yalnızca <b>yayında</b> olanlar panelde görünür
          </p>
        </div>

        {reports.length === 0 ? (
          <Empty title="Henüz rapor yok" sub="Yukarıdan ilk Excel dosyanı yükle." icon={<Icon name="file" />} />
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[900px]">
              <thead className="bg-ink-900/[0.02] border-b border-line">
                <tr>
                  <Th align="left">Rapor</Th>
                  <Th align="left">Dönemler</Th>
                  <Th align="right">Brüt</Th>
                  <Th align="right">Kesinti</Th>
                  <Th align="right">Net</Th>
                  <Th align="right">Satır</Th>
                  <Th align="center">Durum</Th>
                  <Th align="right">İşlem</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-900/[0.02]">
                    <Td>
                      <p className="font-medium text-ink-900">{r.title}</p>
                      <p className="text-[11px] text-ink-300 truncate max-w-[220px]">{r.fileName}</p>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {r.periods.map((p) => (
                          <span key={p} className="text-[10.5px] px-1.5 py-0.5 rounded bg-ink-900/[0.05] text-ink-600">
                            {p}
                          </span>
                        ))}
                      </div>
                    </Td>
                    <Td align="right">{money(r.gross, true)}</Td>
                    <Td align="right" className="text-accent-rose">
                      {r.deduction ? money(r.deduction) : "—"}
                    </Td>
                    <Td align="right" className="font-semibold text-brand-600">{money(r.received)}</Td>
                    <Td align="right" className="text-ink-500">{num(r.rowCount)}</Td>
                    <Td align="center">
                      <span className={clsx("text-[11px] font-semibold px-2 py-0.5 rounded-full", STATUS[r.status].cls)}>
                        {STATUS[r.status].label}
                      </span>
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status !== "locked" && (
                          <button
                            onClick={() => editDeduction(r)}
                            className="text-[11.5px] text-ink-500 hover:text-ink-900 transition-colors"
                            title="SWIFT kesintisini değiştir"
                          >
                            Kesinti
                          </button>
                        )}
                        {r.status === "draft" && (
                          <>
                            <button onClick={() => setStatus(r.id, "published")}
                              className="text-[11.5px] font-medium text-brand-600 hover:text-brand-700">
                              Yayınla
                            </button>
                            <button onClick={() => remove(r)}
                              className="text-[11.5px] text-ink-400 hover:text-accent-rose">
                              Sil
                            </button>
                          </>
                        )}
                        {r.status === "published" && (
                          <>
                            <button onClick={() => setStatus(r.id, "draft")}
                              className="text-[11.5px] text-ink-500 hover:text-ink-900">
                              Taslağa al
                            </button>
                            <button onClick={() => {
                              if (confirm("Kilitlenen rapor bir daha değiştirilemez. Ödemesi tamamlandı mı?"))
                                setStatus(r.id, "locked");
                            }} className="text-[11.5px] text-ink-500 hover:text-ink-900">
                              Kilitle
                            </button>
                          </>
                        )}
                        {r.status === "locked" && (
                          <span className="text-[11.5px] text-ink-300">değiştirilemez</span>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-5 py-3.5 border-t border-line flex items-start gap-2.5">
          <Icon name="alert" size={15} className="text-ink-400 mt-0.5 shrink-0" />
          <p className="text-[12px] text-ink-500 leading-relaxed">
            <b>Taslak</b> yalnızca burada görünür. <b>Yayında</b> panele düşer.
            <b> Kilitli</b> ödemesi yapılmış demektir — değiştirilemez, silinemez.
          </p>
        </div>
      </Card>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-[10.5px] text-ink-400 mb-1">{label}</p>
      <p className="text-[15px] font-semibold text-ink-900 tabular">{value}</p>
    </div>
  );
}
