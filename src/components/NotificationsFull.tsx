"use client";

import { useCallback, useEffect, useState } from "react";

import type { InboxSummary, NotificationRow } from "@/lib/notify";
import { AnnouncementItem, NotificationItem, TabButton } from "./NotificationBell";
import { Button, Empty, Icon } from "./ui";

/** Sayfanın çektiği üst sınır. Sunucu da 200'de kesiyor. */
const LIMIT = 200;

const BOS: InboxSummary = {
  notifications: [], announcements: [], unread: 0, unreadAnnouncements: 0,
};

/**
 * Bildirimlerin TAM listesi (/bildirimler sayfası).
 *
 * Zildeki modal yalnızca son 10 kaydı gösterir; "Tümünü gör" buraya getirir.
 * Satır görünümleri bilerek NotificationBell'den yeniden kullanılıyor —
 * iki yerde ayrı ayrı yazılsaydı zamanla görsel olarak birbirinden ayrılırlardı.
 */
export function NotificationsFull() {
  const [inbox, setInbox] = useState<InboxSummary>(BOS);
  const [tab, setTab] = useState<"bildirim" | "guncelleme">("bildirim");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/notifications?limit=${LIMIT}`, { cache: "no-store" });
      if (r.ok) setInbox((await r.json()) as InboxSummary);
    } catch {
      /* sessiz — liste boş kalır */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /**
   * @param korumali true ise (yalnızca "Tümünü okundu işaretle") eşzamanlı
   * çağrılar engellenir. Tek bir bildirimi okundu işaretlemek KORUMASIZ
   * olmalı: aksi hâlde ilk istek uçarken ikinci bildirime tıklayan kullanıcı
   * o bildirimi okundu işaretleyemeden gidiyor ve kayıt kalıcı olarak
   * okunmamış görünüyordu.
   */
  const patch = async (body: Record<string, unknown>, korumali = false) => {
    if (korumali && busy) return;
    if (korumali) setBusy(true);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
    await load();
    if (korumali) setBusy(false);
  };

  const openItem = async (n: NotificationRow) => {
    if (!n.readAt) await patch({ id: n.id });
    if (n.actionUrl) window.location.href = n.actionUrl;
  };

  const total = inbox.unread + inbox.unreadAnnouncements;

  return (
    <div className="rounded-xl2 bg-card border border-line shadow-card p-5">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <TabButton active={tab === "bildirim"} count={inbox.unread} onClick={() => setTab("bildirim")}>
          Bildirimler
        </TabButton>
        <TabButton
          active={tab === "guncelleme"}
          count={inbox.unreadAnnouncements}
          onClick={() => setTab("guncelleme")}
        >
          Güncellemeler
        </TabButton>
        {total > 0 && (
          <Button variant="ghost" className="ml-auto" onClick={() => patch({ all: true }, true)} disabled={busy}>
            Tümünü okundu işaretle
          </Button>
        )}
      </div>

      {(inbox.notifications.length >= LIMIT || inbox.announcements.length >= LIMIT) && (
        <p className="text-[12px] text-ink-400 mb-3">
          En yeni {LIMIT} kayıt gösteriliyor.
        </p>
      )}

      {tab === "bildirim" ? (
        inbox.notifications.length === 0 ? (
          <Empty
            title={loading ? "Yükleniyor…" : "Henüz bildirim yok"}
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
          title={loading ? "Yükleniyor…" : "Henüz güncelleme yok"}
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
    </div>
  );
}
