"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import type { AnnouncementRow, InboxSummary, NotificationRow, NotificationType } from "@/lib/notify";
import Link from "next/link";

import { Empty, Icon } from "./ui";

/**
 * Bildirim merkezi — zil düğmesi + hemen altında açılan menü (M4NM Pulse § 1).
 * Modal değil: sayfayı karartmaz, dışarı tıklayınca veya Esc ile kapanır —
 * alışılmış sosyal ağ / e-posta bildirim menüsü davranışı.
 *
 * İki akış tek panelde, sekmeyle ayrılmış:
 *  • Bildirimler  → kişiye özel olaylar (ödeme, hesap, banka, talep)
 *  • Güncellemeler → herkese açık ürün duyuruları (What's New)
 *
 * Okunmamışlar görsel olarak ayrılır (sol kenarda marka rengi şerit + koyu
 * başlık); okunmuşlar soluklaşır. Sıralama her zaman yeniden eskiye.
 */

const TYPE_ICON: Record<NotificationType, string> = {
  payment_batch: "file",
  payment: "wallet",
  bank: "bank",
  request: "clock",
  account: "users",
  revenue_transfer: "split",
  song_split: "percent",
  message: "copy",
  system: "alert",
};

const EMPTY: InboxSummary = {
  notifications: [], announcements: [], unread: 0, unreadAnnouncements: 0,
};

/** "3 dk önce", "dün", "12 Ağu" */
function since(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const dk = Math.floor((Date.now() - t) / 60000);
  if (dk < 1) return "az önce";
  if (dk < 60) return `${dk} dk önce`;
  const sa = Math.floor(dk / 60);
  if (sa < 24) return `${sa} sa önce`;
  const gun = Math.floor(sa / 24);
  if (gun === 1) return "dün";
  if (gun < 7) return `${gun} gün önce`;
  return new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

/**
 * Modalda kaç kayıt gösterilir. Fazlası varsa altta "Tümünü gör" çıkar ve
 * /bildirimler sayfasına gider — modal hızlı bakış içindir, arşiv için değil.
 */
const MODAL_LIMIT = 10;

export function NotificationBell({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Dışarı tıklama ve Esc kapatır; Esc'te odak zile döner.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const [tab, setTab] = useState<"bildirim" | "guncelleme">("bildirim");
  const [inbox, setInbox] = useState<InboxSummary>(EMPTY);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications");
      if (!r.ok) return;
      const j = (await r.json()) as InboxSummary;
      setInbox({ ...EMPTY, ...j });
    } catch {
      /* sessiz: bildirim çekilemedi diye ekran bozulmasın */
    }
  }, []);

  // İlk yüklemede ve panel her açıldığında tazele. Sürekli yoklama (polling)
  // yok — bildirimler kritik-gerçek zamanlı değil, gereksiz istek üretmiyoruz.
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const total = inbox.unread + inbox.unreadAnnouncements;

  const patch = async (body: Record<string, unknown>) => {
    setLoading(true);
    try {
      const r = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const j = (await r.json()) as InboxSummary;
        setInbox({ ...EMPTY, ...j });
      }
    } catch {
      /* sessiz */
    } finally {
      setLoading(false);
    }
  };

  // Modal hızlı bakış: her sekmede yalnızca son 10 kayıt. Fazlası varsa
  // altta "Tümünü gör" görünür (Mert'in isteği: "eğer çok fazla bildirim
  // var ise").
  const gosterilenBildirimler = inbox.notifications.slice(0, MODAL_LIMIT);
  const gosterilenDuyurular = inbox.announcements.slice(0, MODAL_LIMIT);
  // İki listeden HERHANGİ biri taşıyorsa link görünür: /bildirimler sayfası
  // ikisini birden gösteriyor, sekmeye göre gizlemek kullanıcıyı gereksiz
  // yere o sekmeye geçmek zorunda bırakırdı.
  const fazlasiVar =
    inbox.notifications.length > MODAL_LIMIT || inbox.announcements.length > MODAL_LIMIT;

  const openItem = async (n: NotificationRow) => {
    if (!n.readAt) await patch({ id: n.id });
    if (n.actionUrl) window.location.href = n.actionUrl;
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Bildirimler"
        aria-expanded={open}
        aria-haspopup="dialog"
        // compact hâlde düğmenin içinde metin YOK; erişilebilir ad şart.
        aria-label={total > 0 ? `Bildirimler, ${total} okunmamış` : "Bildirimler"}
        className={clsx(
          "relative flex items-center gap-2.5 rounded-xl font-medium transition-all",
          compact
            ? clsx("w-10 h-10 justify-center border text-ink-600 hover:text-ink-900",
                open ? "bg-ink-900/[0.06] border-line-strong text-ink-900" : "bg-card border-line hover:bg-ink-900/[0.03]")
            : "w-full px-3 py-2.5 text-[13px] text-ink-500 hover:bg-ink-900/[0.04] hover:text-ink-900"
        )}
      >
        <span className="relative flex items-center justify-center">
          <Icon name="bell" size={compact ? 17 : 16} />
          {total > 0 && (
            <span aria-hidden className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-accent-rose text-white text-[9.5px] font-bold flex items-center justify-center tabular">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </span>
        {!compact && <span className="flex-1 text-left">Bildirimler</span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Bildirimler"
          className="absolute right-0 top-full mt-2.5 w-[400px] max-w-[calc(100vw-24px)] rounded-[18px] bg-card border border-line shadow-pop z-50 fade-in origin-top-right"
        >
          {/* Zile bakan küçük ok */}
          <span aria-hidden className="absolute -top-[7px] right-[13px] w-3 h-3 rotate-45 bg-card border-l border-t border-line" />

          <div className="relative px-4 pt-3.5 pb-3 flex items-center gap-3 border-b border-line">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink-900 leading-tight">Bildirimler</p>
              <p className="text-[11.5px] text-ink-400 mt-0.5">{total > 0 ? `${total} okunmamış` : "Hepsi okundu"}</p>
            </div>
            {total > 0 && (
              <button type="button" onClick={() => patch({ all: true })} disabled={loading}
                className="text-[12px] font-semibold text-brand-700 hover:underline disabled:opacity-50 shrink-0">
                Tümünü okundu işaretle
              </button>
            )}
          </div>

          <div className="px-3 pt-3 flex items-center gap-1.5">
            <TabButton active={tab === "bildirim"} count={inbox.unread} onClick={() => setTab("bildirim")}>
              Bildirimler
            </TabButton>
            <TabButton active={tab === "guncelleme"} count={inbox.unreadAnnouncements} onClick={() => setTab("guncelleme")}>
              Güncellemeler
            </TabButton>
          </div>

          <div className="p-2.5 max-h-[min(60vh,440px)] overflow-y-auto scroll-thin">
            {tab === "bildirim" ? (
              inbox.notifications.length === 0 ? (
                <Empty title="Henüz bildirim yok"
                  sub="Ödeme, hesap ve talep hareketlerin burada görünecek."
                  icon={<Icon name="bell" />} />
              ) : (
                <div className="space-y-1">
                  {gosterilenBildirimler.map((n) => (
                    <NotificationItem key={n.id} n={n} onOpen={() => openItem(n)} />
                  ))}
                </div>
              )
            ) : inbox.announcements.length === 0 ? (
              <Empty title="Henüz güncelleme yok"
                sub="M4NM Pulse'a eklenen yenilikler burada duyurulur."
                icon={<Icon name="alert" />} />
            ) : (
              <div className="space-y-1">
                {gosterilenDuyurular.map((a) => (
                  <AnnouncementItem key={a.id} a={a}
                    onRead={() => !a.readAt && patch({ id: a.id, kind: "announcement" })} />
                ))}
              </div>
            )}
          </div>

          <Link
            href="/bildirimler"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1.5 border-t border-line px-4 py-3 text-[13px] font-medium text-brand-600 hover:text-brand-700 hover:bg-ink-900/[0.02] rounded-b-[18px] transition-colors"
          >
            {fazlasiVar ? "Tümünü gör" : "Bildirim sayfasını aç"}
            <Icon name="forward" size={15} />
          </Link>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- parçalar */

export function TabButton({
  active, count, onClick, children,
}: {
  active: boolean; count: number; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors",
        active ? "bg-brand-500 text-white" : "bg-ink-900/[0.04] text-ink-700 hover:bg-ink-900/[0.08]"
      )}
    >
      {children}
      {count > 0 && (
        <span
          className={clsx(
            "min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center tabular",
            active ? "bg-white/20 text-white" : "bg-accent-rose text-white"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function NotificationItem({ n, onOpen }: { n: NotificationRow; onOpen: () => void }) {
  const unread = !n.readAt;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={clsx(
        "w-full text-left flex gap-3 p-3 rounded-xl border transition-colors",
        unread
          ? "bg-card border-line hover:bg-brand-50/40"
          : "bg-transparent border-transparent hover:bg-ink-900/[0.03]"
      )}
    >
      <span
        className={clsx(
          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
          unread ? "bg-brand-50 text-brand-600" : "bg-ink-900/[0.05] text-ink-400"
        )}
      >
        <Icon name={TYPE_ICON[n.type] ?? "alert"} size={15} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={clsx("text-[13.5px] leading-snug", unread ? "font-semibold text-ink-900" : "font-medium text-ink-500")}>
            {n.title}
          </span>
          <span className="text-[11px] text-ink-300 shrink-0">{since(n.createdAt)}</span>
        </span>
        {n.body && (
          <span className={clsx("block text-[12.5px] leading-relaxed mt-0.5", unread ? "text-ink-500" : "text-ink-400")}>
            {n.body}
          </span>
        )}
      </span>
      {unread && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0 mt-2" aria-label="okunmadı" />}
    </button>
  );
}

export function AnnouncementItem({ a, onRead }: { a: AnnouncementRow; onRead: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const unread = !a.readAt;
  return (
    <button
      type="button"
      onClick={() => { setExpanded((v) => !v); onRead(); }}
      className={clsx(
        "w-full text-left p-3 rounded-xl border transition-colors",
        unread ? "bg-card border-line hover:bg-brand-50/40" : "bg-transparent border-transparent hover:bg-ink-900/[0.03]"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={clsx("text-[13.5px] leading-snug", unread ? "font-semibold text-ink-900" : "font-medium text-ink-500")}>
          {a.title}
        </span>
        <span className="text-[11px] text-ink-300 shrink-0">
          {a.publishedAt ? since(a.publishedAt) : ""}
        </span>
      </div>
      {a.body && (
        <p
          className={clsx(
            "text-[12.5px] leading-relaxed mt-1 whitespace-pre-wrap",
            unread ? "text-ink-500" : "text-ink-400",
            !expanded && "line-clamp-2"
          )}
        >
          {a.body}
        </p>
      )}
    </button>
  );
}
