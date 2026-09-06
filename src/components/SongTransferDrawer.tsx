"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import type { SongArtistRow, SongPeriodDetail, TransferRow } from "@/lib/transfers";
import { money, pct } from "@/lib/format";
import { Avatar, Button, Drawer, Icon } from "./ui";

/**
 * Şarkı detayı + gelir hakkı devri (M4NM Pulse § 2, § 3).
 *
 * Akış: Ödeme Partisi → Şarkılar → Şarkı → bu drawer → Gelir Hakkı Devri.
 *
 * Devir HER ZAMAN tek bir döneme aittir. Bir ödeme partisi birden çok dönem
 * içerebildiği için (Q2 dosyasında P03+P04 birlikte) her dönem ayrı bir blok
 * olarak gösterilir ve devir o blokta yapılır.
 */

interface Props {
  songId: string;
  songTitle: string;
  reportId: string;
  onClose: () => void;
  /** Devir sonrası üstteki rakamların tazelenmesi için. */
  onChanged?: () => void;
}

interface Payload {
  periods: SongPeriodDetail[];
  canTransferFor: string[] | "all";
  isAdmin: boolean;
}

export function SongTransferDrawer({ songId, songTitle, reportId, onClose, onChanged }: Props) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/songs/${songId}/transfer?reportId=${encodeURIComponent(reportId)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Şarkı bilgisi alınamadı.");
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata.");
    } finally {
      setLoading(false);
    }
  }, [songId, reportId]);

  useEffect(() => { void load(); }, [load]);

  const head = data?.periods[0];

  return (
    <Drawer
      open
      onClose={onClose}
      title={songTitle}
      sub={head ? `${head.artistString} · ${head.reportTitle}` : "Şarkı detayı"}
      width={620}
    >
      {loading ? (
        <p className="text-[13px] text-ink-400 py-8 text-center">Yükleniyor…</p>
      ) : error ? (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-[13px] text-accent-rose flex items-start gap-2">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      ) : !data || data.periods.length === 0 ? (
        <p className="text-[13px] text-ink-400 py-8 text-center">
          Bu şarkının seçili ödeme partisinde kaydı yok.
        </p>
      ) : (
        <div className="space-y-5">
          {head?.isrc && (
            <p className="text-[11.5px] text-ink-400">
              ISRC <span className="font-mono text-ink-500">{head.isrc}</span>
            </p>
          )}
          {data.periods.map((p) => (
            <PeriodBlock
              key={p.periodId}
              detail={p}
              canTransferFor={data.canTransferFor}
              isAdmin={data.isAdmin}
              onDone={() => { void load(); onChanged?.(); }}
            />
          ))}
        </div>
      )}
    </Drawer>
  );
}

/* ------------------------------------------------------------ dönem bloğu */

function PeriodBlock({
  detail,
  canTransferFor,
  isAdmin,
  onDone,
}: {
  detail: SongPeriodDetail;
  canTransferFor: string[] | "all";
  isAdmin: boolean;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const locked = detail.reportStatus === "locked";

  const canActFor = (artistId: string) =>
    canTransferFor === "all" || canTransferFor.includes(artistId);

  // Devredebilecek en az bir sanatçı var mı? (payı kalmış olmalı)
  const transferable = detail.artists.filter(
    (a) => canActFor(a.artistId) && a.baseShare > 0 && a.effectiveShare > 0.0000001
  );

  const active = detail.transfers.filter((t) => t.status === "active");

  return (
    <div className="rounded-xl2 border border-line bg-card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-[14px] font-semibold text-ink-900">{detail.periodLabel}</p>
          <p className="text-[11.5px] text-ink-400">
            {detail.artists.some((a) => a.amountHidden)
              ? `Senin bu şarkıdaki payın ${money(detail.totalGross)}`
              : `Şarkı geliri ${money(detail.totalGross)} · bölüşüm öncesi`}
          </p>
        </div>
        {locked && (
          <span className="text-[10.5px] font-semibold px-2 py-1 rounded-full bg-ink-900/[0.06] text-ink-500 flex items-center gap-1">
            <Icon name="lock" size={11} /> Kilitli
          </span>
        )}
      </div>

      <SplitTable artists={detail.artists} />

      {active.length > 0 && (
        <div className="mt-3 pt-3 border-t border-line space-y-1.5">
          <p className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide">
            Bu dönemdeki devirler
          </p>
          {active.map((t) => (
            <TransferLine
              key={t.id}
              t={t}
              canRevert={!locked && (isAdmin || canActFor(t.fromArtistId))}
              onDone={onDone}
            />
          ))}
        </div>
      )}

      {detail.transfers.some((t) => t.status === "reverted") && (
        <details className="mt-2">
          <summary className="text-[11.5px] text-ink-400 cursor-pointer hover:text-ink-700">
            Geri alınmış devirler ({detail.transfers.filter((t) => t.status === "reverted").length})
          </summary>
          <div className="mt-1.5 space-y-1.5">
            {detail.transfers.filter((t) => t.status === "reverted").map((t) => (
              <TransferLine key={t.id} t={t} canRevert={false} onDone={onDone} />
            ))}
          </div>
        </details>
      )}

      <div className="mt-3 pt-3 border-t border-line">
        {locked ? (
          <p className="text-[12px] text-ink-400">
            Bu ödeme partisi kilitli — ödemesi yapılmış bir dönemin dağılımı değiştirilemez.
          </p>
        ) : transferable.length === 0 ? (
          <p className="text-[12px] text-ink-400">
            Bu dönemde devredebileceğin bir pay yok.
          </p>
        ) : !open ? (
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Icon name="split" size={14} /> Gelir hakkı devret
          </Button>
        ) : (
          <TransferForm
            detail={detail}
            transferable={transferable}
            onCancel={() => setOpen(false)}
            onDone={() => { setOpen(false); onDone(); }}
          />
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- dağılım tablosu */

function SplitTable({ artists, preview }: { artists: SongArtistRow[]; preview?: Map<string, number> }) {
  return (
    <div className="space-y-1.5">
      {artists.map((a) => {
        const next = preview?.get(a.artistId);
        const changed = next !== undefined && Math.abs(next - a.effectiveShare) > 0.0000001;
        const moved = Math.abs(a.effectiveShare - a.baseShare) > 0.0000001;
        return (
          <div key={a.artistId} className="flex items-center gap-2.5">
            <Avatar name={a.artistName} size={26} />
            <span className="text-[13px] text-ink-900 flex-1 truncate">{a.artistName}</span>

            {/* Normal dağılım — devirlerden etkilenmeyen kalıcı pay */}
            <span className="text-[11.5px] text-ink-300 tabular w-12 text-right" title="Normal dağılım">
              {pct(a.baseShare)}
            </span>
            <Icon name="back" size={11} className="rotate-180 text-ink-300" />

            {/* Bu dönemde geçerli pay */}
            <span
              className={clsx(
                "text-[13px] font-semibold tabular w-14 text-right",
                changed ? "text-ink-300 line-through" : moved ? "text-accent-violet" : "text-ink-900"
              )}
            >
              {pct(a.effectiveShare)}
            </span>

            {changed && (
              <>
                <Icon name="back" size={11} className="rotate-180 text-brand-500" />
                <span className="text-[13px] font-semibold tabular w-14 text-right text-brand-600">
                  {pct(next!)}
                </span>
              </>
            )}

            <span
              className="text-[12.5px] text-ink-500 tabular w-24 text-right"
              title={a.amountHidden ? "Diğer sanatçıların tutarlarını görme yetkin yok" : undefined}
            >
              {a.amountHidden ? "—" : money(a.gross)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TransferLine({
  t, canRevert, onDone,
}: {
  t: TransferRow; canRevert: boolean; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const revert = async () => {
    if (!confirm(`${t.fromArtistName} → ${t.toArtistName} devri geri alınacak. Bu dönemin hakedişleri devir öncesi hâline döner. Emin misin?`)) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/transfers/${t.id}`, { method: "PATCH" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Geri alınamadı.");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Bilinmeyen hata.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={clsx("rounded-lg px-2.5 py-2", t.status === "active" ? "bg-accent-violet/[0.07]" : "bg-ink-900/[0.03] opacity-70")}>
      <div className="flex items-center gap-2">
        <Icon name="split" size={13} className={t.status === "active" ? "text-accent-violet" : "text-ink-400"} />
        <span className="text-[12.5px] text-ink-700 flex-1 min-w-0">
          <b className="font-medium">{t.fromArtistName}</b> → <b className="font-medium">{t.toArtistName}</b>
          <span className="text-ink-400">
            {" "}· payının {pct(t.ratio)}'i{t.amount ? ` · ${money(t.amount)}` : ""}
          </span>
        </span>
        {canRevert && (
          <Button variant="ghost" onClick={revert} disabled={busy}>
            {busy ? "…" : "Geri al"}
          </Button>
        )}
      </div>
      <p className="text-[11px] text-ink-400 mt-0.5 pl-[21px]">
        {new Date(t.createdAt).toLocaleDateString("tr-TR", {
          day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
        })}
        {t.createdByName ? ` · ${t.createdByName}` : ""}
        {t.status === "reverted" && t.revertedAt ? " · geri alındı" : ""}
        {t.note ? ` · ${t.note}` : ""}
      </p>
      {err && <p className="text-[11.5px] text-accent-rose mt-1 pl-[21px]">{err}</p>}
    </div>
  );
}

/* ------------------------------------------------------------- devir formu */

function TransferForm({
  detail, transferable, onCancel, onDone,
}: {
  detail: SongPeriodDetail;
  transferable: SongArtistRow[];
  onCancel: () => void;
  onDone: () => void;
}) {
  const [fromId, setFromId] = useState(transferable[0]?.artistId ?? "");
  const [toId, setToId] = useState("");
  const [yuzde, setYuzde] = useState("100");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const from = detail.artists.find((a) => a.artistId === fromId);
  const ratio = Math.min(1, Math.max(0, (Number(yuzde) || 0) / 100));

  // Devredenin bu dönemde daha önce devrettiği toplam oran:
  // effective = base * (1 - devredilen) ⇒ devredilen = 1 - effective/base
  const usedRatio = from && from.baseShare > 0 ? 1 - from.effectiveShare / from.baseShare : 0;
  const kalan = Math.max(0, 1 - usedRatio);

  /** İşlem sonrası dağılım — onaydan önce kullanıcıya açıkça gösterilir. */
  const preview = useMemo(() => {
    if (!from || !toId || ratio <= 0) return undefined;
    const m = new Map<string, number>();
    for (const a of detail.artists) m.set(a.artistId, a.effectiveShare);
    m.set(fromId, Math.max(0, from.baseShare * (1 - usedRatio - ratio)));
    m.set(toId, (m.get(toId) ?? 0) + from.baseShare * ratio);
    return m;
  }, [detail.artists, from, fromId, toId, ratio, usedRatio]);

  const tutar = from ? from.baseGross * ratio : 0;
  const asiyor = ratio > kalan + 1e-9;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: detail.reportId,
          periodId: detail.periodId,
          songId: detail.songId,
          fromArtistId: fromId,
          toArtistId: toId,
          ratio,
          note: note.trim() || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Devir kaydedilemedi.");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Bilinmeyen hata.");
    } finally {
      setBusy(false);
    }
  };

  const sel = "w-full rounded-xl border border-line px-3 py-2 text-[13px] bg-white outline-none focus:border-brand-500 transition-colors";

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-ink-500 leading-relaxed">
        Devir yalnızca <b className="text-ink-700">{detail.periodLabel}</b> dönemi için geçerlidir.
        Şarkının kalıcı bölüşümü değişmez, diğer dönemler etkilenmez.
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="block text-[11px] font-medium text-ink-400 mb-1">Devreden</label>
          <select value={fromId} onChange={(e) => { setFromId(e.target.value); setToId(""); }} className={sel}>
            {transferable.map((a) => (
              <option key={a.artistId} value={a.artistId}>{a.artistName}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-ink-400 mb-1">Devralan</label>
          <select value={toId} onChange={(e) => setToId(e.target.value)} className={sel}>
            <option value="">Seç…</option>
            {detail.artists
              .filter((a) => a.artistId !== fromId)
              .map((a) => (
                <option key={a.artistId} value={a.artistId}>{a.artistName}</option>
              ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-ink-400 mb-1">
          Devredilen oran — devredenin kendi payının yüzdesi
        </label>
        <div className="flex items-center gap-2">
          {["100", "75", "50", "25"].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setYuzde(v)}
              className={clsx(
                "px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors",
                yuzde === v ? "bg-ink-900 text-white" : "bg-white border border-line text-ink-700 hover:bg-ink-900/[0.03]"
              )}
            >
              %{v}
            </button>
          ))}
          <input
            value={yuzde}
            onChange={(e) => setYuzde(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
            inputMode="decimal"
            className="w-20 rounded-lg border border-line px-2.5 py-1.5 text-[13px] bg-white outline-none focus:border-brand-500 text-right tabular"
          />
          <span className="text-[13px] text-ink-400">%</span>
        </div>
        {usedRatio > 0.0000001 && (
          <p className="text-[11.5px] text-ink-400 mt-1">
            Bu dönemde payının {pct(usedRatio)}'i zaten devredilmiş — kalan {pct(kalan)}.
          </p>
        )}
        {asiyor && (
          <p className="text-[11.5px] text-accent-rose mt-1">
            Devredilebilecek paydan fazla. En çok %{(kalan * 100).toFixed(1)} girebilirsin.
          </p>
        )}
      </div>

      <div>
        <label className="block text-[11px] font-medium text-ink-400 mb-1">Not (isteğe bağlı)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="örn. anlaşma gereği"
          className={sel}
        />
      </div>

      {/* İşlem sonrası önizleme — onaylamadan önce sonucu açıkça göster */}
      {preview && (
        <div className="rounded-xl bg-ink-900/[0.03] border border-line p-3">
          <p className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide mb-2">
            İşlem sonrası
          </p>
          <SplitTable artists={detail.artists} preview={preview} />
          <p className="text-[12px] text-ink-500 mt-2.5 pt-2.5 border-t border-line">
            Taşınan tutar:{" "}
            <b className="text-ink-900 tabular">{from?.amountHidden ? "—" : money(tutar)}</b>
          </p>
        </div>
      )}

      {err && (
        <p className="text-[12.5px] text-accent-rose flex items-start gap-1.5">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {err}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          onClick={submit}
          disabled={busy || !toId || ratio <= 0 || asiyor}
        >
          {busy ? "Kaydediliyor…" : "Devri onayla"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Vazgeç</Button>
      </div>
    </div>
  );
}
