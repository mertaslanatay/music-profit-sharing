"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { SupportThread, ThreadDetail, ThreadStatus } from "@/lib/support";
import { Avatar, Button, Card, Empty, Icon } from "./ui";

/**
 * Sanatçı ↔ Label iletişim merkezi (M4NM Pulse § 9).
 *
 * Tek bileşen iki taraf için: `mode="user"` sanatçı kutusu, `mode="admin"`
 * yönetim kutusu. İkisi de aynı API'yi kullanır; fark yalnızca kimin neyi
 * görebildiği (sunucuda zorlanır) ve birkaç arayüz ayrıntısı.
 *
 * Solda konuşma listesi, sağda seçili konuşma — hafif bir destek kutusu.
 */

const STATUS: Record<ThreadStatus, { label: string; cls: string }> = {
  open: { label: "Bekliyor", cls: "bg-accent-amber/15 text-accent-amber" },
  answered: { label: "Cevaplandı", cls: "bg-brand-50 text-brand-700" },
  closed: { label: "Kapalı", cls: "bg-ink-900/[0.06] text-ink-400" },
};

const zaman = (iso: string) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const dk = Math.floor((Date.now() - t) / 60000);
  if (dk < 1) return "az önce";
  if (dk < 60) return `${dk} dk`;
  if (dk < 1440) return `${Math.floor(dk / 60)} sa`;
  const g = Math.floor(dk / 1440);
  if (g < 7) return `${g} gün`;
  return new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
};

const tamZaman = (iso: string) =>
  new Date(iso).toLocaleDateString("tr-TR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

export function SupportPanel({ mode }: { mode: "user" | "admin" }) {
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Sıra dışı gelen cevaplar seçili konuşmanın üstüne yazmasın: her açma
  // isteğine bir sıra numarası verilir, yalnızca EN SON istek sonucu kabul
  // edilir. Hızlı konuşma değiştirmede yanlış içerik gösterilmesini önler.
  const istekSirasi = useRef(0);
  const [filter, setFilter] = useState<ThreadStatus | "all">("all");
  const [q, setQ] = useState("");
  const [composing, setComposing] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (filter !== "all") p.set("status", filter);
      if (q.trim()) p.set("q", q.trim());
      const r = await fetch(`/api/support?${p}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Konuşmalar yüklenemedi.");
      setThreads(j.threads ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata.");
    } finally {
      setLoading(false);
    }
  }, [filter, q]);

  useEffect(() => { void load(); }, [load]);

  const openThread = useCallback(async (id: string) => {
    const sira = ++istekSirasi.current;
    setOpenId(id);
    setDetail(null);
    try {
      const r = await fetch(`/api/support/${id}`);
      const j = await r.json();
      // Bu istek eskidiyse (kullanıcı başka konuşmaya geçtiyse) sonucu at.
      if (sira !== istekSirasi.current) return;
      if (!r.ok) throw new Error(j.error || "Konuşma açılamadı.");
      setDetail(j.thread);
      // Okundu işaretlendi — listedeki rozet de düşsün.
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread: false } : t)));
    } catch (e) {
      if (sira !== istekSirasi.current) return;
      setError(e instanceof Error ? e.message : "Bilinmeyen hata.");
    }
  }, []);

  const counts = useMemo(() => {
    const c = { all: threads.length, open: 0, answered: 0, closed: 0 };
    for (const t of threads) c[t.status]++;
    return c;
  }, [threads]);

  const unreadTotal = threads.filter((t) => t.unread).length;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-[13px] text-accent-rose flex items-center gap-2">
          <Icon name="alert" size={15} /> {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "open", "answered", "closed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              "px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors",
              filter === f ? "bg-ink-900 text-white" : "bg-ink-900/[0.04] text-ink-700 hover:bg-ink-900/[0.08]"
            )}
          >
            {f === "all" ? "Tümü" : STATUS[f].label}
            <span className="ml-1.5 opacity-60 tabular">
              {f === "all" ? counts.all : counts[f]}
            </span>
          </button>
        ))}

        {mode === "admin" && (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Kullanıcı veya konu ara…"
            className="ml-auto rounded-xl border border-line px-3 py-1.5 text-[13px] bg-white outline-none focus:border-brand-500 transition-colors min-w-[220px]"
          />
        )}

        {mode === "user" && (
          <Button variant="primary" className="ml-auto" onClick={() => { setComposing(true); setOpenId(null); }}>
            <Icon name="copy" size={14} /> Yeni talep
          </Button>
        )}
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-4 items-start">
        {/* Konuşma listesi */}
        <Card pad={false} className="overflow-hidden">
          <div className="px-4 py-3 border-b border-line flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink-900">
              {mode === "admin" ? "Gelen kutusu" : "Taleplerim"}
            </p>
            {unreadTotal > 0 && (
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-accent-rose text-white tabular">
                {unreadTotal} yeni
              </span>
            )}
          </div>

          {loading ? (
            <p className="text-[13px] text-ink-400 py-8 text-center">Yükleniyor…</p>
          ) : threads.length === 0 ? (
            <Empty
              title={mode === "admin" ? "Mesaj yok" : "Henüz talebin yok"}
              sub={mode === "admin" ? "Sanatçılardan gelen mesajlar burada görünür." : "Bir sorun ya da talebin varsa “Yeni talep”e bas."}
              icon={<Icon name="copy" />}
            />
          ) : (
            <div className="max-h-[560px] overflow-y-auto scroll-thin divide-y divide-line">
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setComposing(false); void openThread(t.id); }}
                  className={clsx(
                    "w-full text-left px-4 py-3 transition-colors",
                    openId === t.id ? "bg-brand-50/60" : "hover:bg-ink-900/[0.02]"
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {mode === "admin" && <Avatar name={t.userName} size={28} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className={clsx(
                          "text-[13px] truncate flex-1",
                          t.unread ? "font-semibold text-ink-900" : "font-medium text-ink-700"
                        )}>
                          {t.subject}
                        </p>
                        <span className="text-[11px] text-ink-300 shrink-0">{zaman(t.lastMessageAt)}</span>
                      </div>
                      {mode === "admin" && (
                        <p className="text-[11.5px] text-ink-400 truncate">{t.userName}</p>
                      )}
                      <p className="text-[12px] text-ink-400 truncate mt-0.5">{t.preview}</p>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full", STATUS[t.status].cls)}>
                          {STATUS[t.status].label}
                        </span>
                        <span className="text-[10.5px] text-ink-300">{t.messageCount} mesaj</span>
                        {t.unread && <span className="w-1.5 h-1.5 rounded-full bg-accent-rose ml-auto" />}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Sağ taraf: yeni talep formu ya da seçili konuşma */}
        {composing ? (
          <NewThreadForm
            onCancel={() => setComposing(false)}
            onDone={async (id) => { setComposing(false); await load(); void openThread(id); }}
          />
        ) : openId ? (
          <ThreadView
            key={openId}
            detail={detail}
            mode={mode}
            onChanged={async () => { await load(); await openThread(openId); }}
          />
        ) : (
          <Card>
            <Empty
              title="Bir konuşma seç"
              sub={mode === "admin"
                ? "Soldan bir mesajı aç, aynı konuşmadan cevap yaz."
                : "Soldan bir talebini aç ya da yeni bir talep oluştur."}
              icon={<Icon name="copy" />}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ yeni talep */

function NewThreadForm({
  onCancel, onDone,
}: {
  onCancel: () => void;
  onDone: (id: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Talep oluşturulamadı.");
      onDone(j.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Bilinmeyen hata.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <p className="text-[15px] font-semibold text-ink-900 mb-1">Yeni talep</p>
      <p className="text-[12.5px] text-ink-500 mb-4">
        Label ekibi mesajını görecek ve aynı konuşmadan cevap yazacak.
      </p>

      {err && (
        <p className="text-[12.5px] text-accent-rose mb-3 flex items-start gap-1.5">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {err}
        </p>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-[11px] font-medium text-ink-400 mb-1">Konu</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={160}
            autoFocus
            placeholder="örn. Mart dönemi hakedişimde soru"
            className="w-full rounded-xl border border-line px-3.5 py-2 text-[13.5px] bg-white outline-none focus:border-brand-500 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-ink-400 mb-1">Mesaj</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            maxLength={8000}
            placeholder="Neye ihtiyacın olduğunu yaz."
            className="w-full rounded-xl border border-line px-3.5 py-2 text-[13.5px] bg-white outline-none focus:border-brand-500 transition-colors resize-y leading-relaxed"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={submit} disabled={busy || !subject.trim() || !body.trim()}>
            {busy ? "Gönderiliyor…" : "Gönder"}
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Vazgeç</Button>
        </div>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- konuşma */

function ThreadView({
  detail, mode, onChanged,
}: {
  detail: ThreadDetail | null;
  mode: "user" | "admin";
  onChanged: () => Promise<void>;
}) {
  // `busy` bilerek BU bileşene ait: üst seviyede paylaşılsaydı, A konuşmasına
  // yazarken B'ye geçmek B'nin düğmelerini de kilitlerdi.
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [detail?.messages.length]);

  if (!detail) {
    return (
      <Card>
        <p className="text-[13px] text-ink-400 py-8 text-center">Yükleniyor…</p>
      </Card>
    );
  }

  const send = async () => {
    const body = reply.trim();
    // busy kontrolü burada: Ctrl+Enter tuş tekrarı aynı metni iki kez
    // göndermesin.
    if (!body || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/support/${detail.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Gönderilemedi.");
      setReply("");
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Bilinmeyen hata.");
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: ThreadStatus) => {
    setBusy(true);
    try {
      await fetch(`/api/support/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card pad={false} className="overflow-hidden">
      <div className="px-5 py-3.5 border-b border-line flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14.5px] font-semibold text-ink-900 truncate">{detail.subject}</p>
          <p className="text-[11.5px] text-ink-400 mt-0.5">
            {mode === "admin" ? `${detail.userName} · ${detail.userEmail} · ` : ""}
            {tamZaman(detail.createdAt)} tarihinde açıldı
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={clsx("text-[10.5px] font-semibold px-2 py-1 rounded-full", STATUS[detail.status].cls)}>
            {STATUS[detail.status].label}
          </span>
          {detail.status === "closed" ? (
            <Button variant="ghost" onClick={() => setStatus("open")} disabled={busy}>Yeniden aç</Button>
          ) : (
            <Button variant="ghost" onClick={() => setStatus("closed")} disabled={busy}>Kapat</Button>
          )}
        </div>
      </div>

      {/* Mesajlar */}
      <div className="px-5 py-4 space-y-3 max-h-[420px] overflow-y-auto scroll-thin bg-canvas/40">
        {detail.messages.map((m) => {
          // Balon yönü rolle belirlenir: kullanıcı mesajları solda, Label
          // ekibinin cevapları sağda — iki taraf da aynı düzeni görür ki
          // konuşma ekran görüntüsü paylaşıldığında karışmasın.
          const label = m.senderRole === "admin";
          return (
            <div key={m.id} className={clsx("flex gap-2.5", label && "flex-row-reverse")}>
              <Avatar name={m.senderName || (label ? "Label" : "Sanatçı")} size={28} />
              <div className={clsx("max-w-[78%] min-w-0", label && "text-right")}>
                <div
                  className={clsx(
                    "inline-block rounded-xl2 px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap text-left",
                    label ? "bg-brand-500 text-white" : "bg-card border border-line text-ink-900"
                  )}
                >
                  {m.body}
                </div>
                <p className="text-[10.5px] text-ink-300 mt-1">
                  {m.senderName || (label ? "Label ekibi" : "Sanatçı")} · {tamZaman(m.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Cevap kutusu */}
      <div className="px-5 py-3.5 border-t border-line">
        {err && (
          <p className="text-[12.5px] text-accent-rose mb-2 flex items-start gap-1.5">
            <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {err}
          </p>
        )}
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/Cmd+Enter ile gönder — uzun mesaj yazarken Enter satır atlar.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send();
          }}
          rows={3}
          maxLength={8000}
          placeholder={detail.status === "closed" ? "Yazarsan konuşma yeniden açılır…" : "Cevabını yaz…"}
          className="w-full rounded-xl border border-line px-3.5 py-2 text-[13.5px] bg-white outline-none focus:border-brand-500 transition-colors resize-y leading-relaxed"
        />
        <div className="flex items-center gap-2 mt-2">
          <Button variant="primary" onClick={send} disabled={busy || !reply.trim()}>
            {busy ? "Gönderiliyor…" : "Gönder"}
          </Button>
          <span className="text-[11px] text-ink-300">⌘/Ctrl + Enter</span>
        </div>
      </div>
    </Card>
  );
}
