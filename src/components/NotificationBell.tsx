"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import type { AnnouncementRow, InboxSummary, NotificationRow, NotificationType } from "@/lib/notify";
import { Button, Drawer, Empty, Icon } from "./ui";

/**
 * Bildirim merkezi — zil düğmesi + sağdan açılan panel (M4NM Pulse § 1).
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

export function NotificationBell({ compact }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
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

  const openItem = async (n: NotificationRow) => {
    if (!n.readAt) await patch({ id: n.id });
    if (n.actionUrl) window.location.href = n.actionUrl;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Bildirimler"
        className={clsx(
          "relative flex items-center gap-2.5 rounded-xl font-medium text-ink-500 hover:bg-ink-900/[0.04] hover:text-ink-900 transition-all",
          compact ? "w-9 h-9 justify-center" : "w-full px-3 py-2.5 text-[13px]"
        )}
      >
        <span className="relative flex items-center justify-center">
          <Icon name="bell" size={compact ? 17 : 16} />
          {total > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-accent-rose text-white text-[9.5px] font-bold flex items-center justify-center tabular">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </span>
        {!compact && <span className="flex-1 text-left">Bildirimler</span>}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Bildirimler"
        sub={total > 0 ? `${total} okunmamış` : "Hepsi okundu"}
        width={460}
        headerRight={
          total > 0 ? (
            <Button variant="ghost" onClick={() => patch({ all: true })} disabled={loading}>
              Tümünü okundu işaretle
            </Button>
          ) : undefined
        }
      >
        {/* Sekmeler */}
        <div className="flex items-center gap-1.5 mb-4">
          <TabButton
            active={tab === "bildirim"}
            count={inbox.unread}
            onClick={() => setTab("bildirim")}
          >
            Bildirimler
          </TabButton>
          <TabButton
            active={tab === "guncelleme"}
            count={inbox.unreadAnnouncements}
            onClick={() => setTab("guncelleme")}
          >
            Güncellemeler
          </TabButton>
        </div>

        {tab === "bildirim" ? (
          inbox.notifications.length === 0 ? (
            <Empty
              title="Henüz bildirim yok"
              sub="Ödeme, hesap ve talep hareketlerin burada görünecek."
              icon={<Icon name="bell" />}
            />
          ) : (
            <div className="space-y-1.5">
              {inbox.notifications.map((n) => (
                <NotificationItem key={n.id} n={n} onOpen={() => openItem(n)} />
              ))}
            </div>
          )
        ) : inbox.announcements.length === 0 ? (
          <Empty
            title="Henüz güncelleme yok"
            sub="M4NM Pulse'a eklenen yenilikler burada duyurulur."
            icon={<Icon name="alert" />}
          />
        ) : (
          <div className="space-y-1.5">
            {inbox.announcements.map((a) => (
              <AnnouncementItem
                key={a.id}
                a={a}
                onRead={() => !a.readAt && patch({ id: a.id, kind: "announcement" })}
              />
            ))}
          </div>
        )}
      </Drawer>
    </>
  );
}

/* --------------------------------------------------------------- parçalar */

function TabButton({
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
        active ? "bg-ink-900 text-white" : "bg-ink-900/[0.04] text-ink-700 hover:bg-ink-900/[0.08]"
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

function NotificationItem({ n, onOpen }: { n: NotificationRow; onOpen: () => void }) {
  const unread = !n.readAt;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={clsx(
        "w-full text-left flex gap-3 p-3 rounded-xl border transition-colors",
        unread
          ? "bg-white border-line hover:bg-brand-50/40"
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

function AnnouncementItem({ a, onRead }: { a: AnnouncementRow; onRead: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const unread = !a.readAt;
  return (
    <button
      type="button"
      onClick={() => { setExpanded((v) => !v); onRead(); }}
      className={clsx(
        "w-full text-left p-3 rounded-xl border transition-colors",
        unread ? "bg-white border-line hover:bg-brand-50/40" : "bg-transparent border-transparent hover:bg-ink-900/[0.03]"
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
