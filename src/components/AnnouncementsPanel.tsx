"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import type { AdminAnnouncement } from "@/app/api/admin/announcements/route";
import { Button, Card, CardHead, Empty, Icon } from "./ui";

/**
 * Duyurular / What's New yönetimi (M4NM Pulse § 1) — yalnızca admin.
 *
 * Duyuru tek satır olarak yazılır, tüm kullanıcılar görür (kullanıcı başına
 * kopyalanmaz). Taslak olarak kaydedilip sonra yayınlanabilir; yayından
 * kaldırıldığında kimse göremez ama okundu bilgisi korunur.
 */

const dateTr = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("tr-TR", {
        day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : "—";

export function AnnouncementsPanel() {
  const [items, setItems] = useState<AdminAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/announcements");
      const j = await r.json();
      if (j.announcements) setItems(j.announcements);
    } catch {
      setError("Duyurular yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const ok = (m: string) => { setSuccess(m); setError(null); setTimeout(() => setSuccess(null), 3000); };

  const send = async (url: string, method: string, payload: unknown, msg: string) => {
    setBusy(true); setError(null); setSuccess(null);
    try {
      const r = await fetch(url, {
        method,
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "İstek başarısız.");
      await refresh();
      ok(msg);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const create = async (publish: boolean) => {
    if (!title.trim()) return setError("Başlık zorunlu.");
    const done = await send(
      "/api/admin/announcements", "POST",
      { title: title.trim(), body: body.trim(), publish },
      publish ? "Duyuru yayınlandı — tüm kullanıcılara görünüyor." : "Taslak kaydedildi."
    );
    if (done) { setTitle(""); setBody(""); }
  };

  const remove = (a: AdminAnnouncement) => {
    if (!confirm(`"${a.title}" duyurusu silinecek. Emin misin?`)) return;
    return send(`/api/admin/announcements/${a.id}`, "DELETE", null, "Duyuru silindi.");
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-[13px] text-accent-rose flex items-center gap-2">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl bg-brand-50 border border-brand-200 p-3 text-[13px] text-brand-700 flex items-center gap-2">
          <Icon name="check" size={15} /> {success}
        </div>
      )}

      <Card>
        <CardHead
          title="Yeni duyuru"
          sub="Yayınlanan duyurular tüm kullanıcıların bildirim panelindeki “Güncellemeler” sekmesinde görünür."
        />
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-medium text-ink-400 mb-1">Başlık</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="örn. Şarkı bazlı gelir hakkı devri geldi"
              className="w-full rounded-xl border border-line px-3.5 py-2 text-[13.5px] bg-white outline-none focus:border-brand-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-400 mb-1">Açıklama</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="Neyin değiştiğini kısa ve net anlat."
              className="w-full rounded-xl border border-line px-3.5 py-2 text-[13.5px] bg-white outline-none focus:border-brand-500 transition-colors resize-y leading-relaxed"
            />
            <p className="text-[11px] text-ink-300 mt-1">{body.length}/4000</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={() => create(true)} disabled={busy || !title.trim()}>
              {busy ? "Gönderiliyor…" : "Yayınla"}
            </Button>
            <Button variant="ghost" onClick={() => create(false)} disabled={busy || !title.trim()}>
              Taslak kaydet
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHead title="Duyurular" sub={`${items.length} kayıt`} />
        {loading ? (
          <p className="text-[13px] text-ink-400 py-6 text-center">Yükleniyor…</p>
        ) : items.length === 0 ? (
          <Empty title="Henüz duyuru yok" sub="Yukarıdan ilk duyuruyu oluştur." icon={<Icon name="alert" />} />
        ) : (
          <div className="space-y-2">
            {items.map((a) => (
              <div
                key={a.id}
                className={clsx(
                  "rounded-xl border p-3.5",
                  a.publishedAt ? "border-line bg-white" : "border-dashed border-line bg-ink-900/[0.02]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[14px] font-semibold text-ink-900">{a.title}</p>
                      <span
                        className={clsx(
                          "text-[10.5px] font-semibold px-2 py-0.5 rounded-full",
                          a.publishedAt ? "bg-brand-50 text-brand-700" : "bg-ink-900/[0.06] text-ink-500"
                        )}
                      >
                        {a.publishedAt ? "Yayında" : "Taslak"}
                      </span>
                    </div>
                    {a.body && (
                      <p className="text-[12.5px] text-ink-500 mt-1.5 leading-relaxed whitespace-pre-wrap">{a.body}</p>
                    )}
                    <p className="text-[11.5px] text-ink-400 mt-2">
                      {a.publishedAt ? `Yayın: ${dateTr(a.publishedAt)}` : `Oluşturuldu: ${dateTr(a.createdAt)}`}
                      {a.publishedAt ? ` · ${a.readCount} kişi okudu` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() =>
                        send(
                          `/api/admin/announcements/${a.id}`, "PATCH",
                          { publish: !a.publishedAt },
                          a.publishedAt ? "Yayından kaldırıldı." : "Yayınlandı."
                        )
                      }
                    >
                      {a.publishedAt ? "Yayından kaldır" : "Yayınla"}
                    </Button>
                    <Button variant="danger" onClick={() => remove(a)} disabled={busy}>
                      Sil
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
