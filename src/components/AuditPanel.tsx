"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Card, Empty, Icon, Td, Th } from "./ui";

interface AuditRow {
  id: number;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  action: string;
  resource: string | null;
  ip: string | null;
  userAgent: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

interface Suspicious {
  heavyActivity: { userId: string; email: string; name: string; count: number; lastAt: string }[];
  failedLogins: { resource: string; count: number; lastAt: string }[];
}

const PAGE_SIZE = 50;

const dateTr = (iso: string) =>
  new Date(iso).toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const ACTION_TR: Record<string, string> = {
  login: "giriş",
  login_failed: "başarısız giriş",
  login_rate_limited: "giriş hız sınırı",
  logout: "çıkış",
  register: "kayıt",
  register_failed: "kayıt başarısız",
  register_duplicate: "tekrar kayıt denemesi",
  register_rate_limited: "kayıt hız sınırı",
  reset_requested: "şifre sıfırlama istendi",
  reset_rate_limited: "sıfırlama hız sınırı",
  password_changed: "şifre değiştirildi",
  auth_linked: "hesap bağlandı",
  email_verify_failed: "e-posta doğrulama başarısız",
  view_dashboard: "panel görüntüledi",
  view_ledger: "cari hesap görüntüledi",
  view_account: "hesabım görüntüledi",
  export_xlsx: "Excel indirdi",
  report_uploaded: "rapor yükledi",
  report_updated: "rapor güncelledi",
  report_deleted: "rapor sildi",
  payment_recorded: "ödeme kaydetti",
  payment_deleted: "ödeme sildi",
  payment_request_created: "ödeme talebi oluşturdu",
  request_status_changed: "ödeme talebi durumu değişti",
  bank_updated: "banka bilgisi güncellendi",
  bank_change_requested: "banka değişikliği istedi",
  bank_change_resolved: "banka değişikliği sonuçlandı",
  admin_users_list: "kullanıcı listesini görüntüledi",
  admin_user_update: "kullanıcı güncelledi",
  admin_user_delete: "kullanıcı sildi",
  admin_page_denied: "yönetim erişimi reddedildi",
  artist_access_denied: "sanatçı erişimi reddedildi",
};

const actionLabel = (a: string) => ACTION_TR[a] ?? a;

export function AuditPanel() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [suspicious, setSuspicious] = useState<Suspicious | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (action) params.set("action", action);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const r = await fetch(`/api/admin/audit?${params}`);
    const j = await r.json();
    if (j.rows) {
      setRows(j.rows);
      setTotal(j.total);
      setActions(j.actions ?? []);
      setSuspicious(j.suspicious ?? null);
    }
    setLoading(false);
  }, [page, action, q, from, to]);

  useEffect(() => { load(); }, [load]);

  const applyFilter = (fn: () => void) => { fn(); setPage(1); };
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasSuspicious =
    suspicious && (suspicious.heavyActivity.length > 0 || suspicious.failedLogins.length > 0);

  return (
    <div className="space-y-4">
      {hasSuspicious && (
        <div className="rounded-xl2 bg-rose-50 border border-rose-200 p-4 space-y-2.5">
          <p className="text-[12.5px] font-semibold text-accent-rose flex items-center gap-2">
            <Icon name="alert" size={15} /> Şüpheli hareket tespit edildi
          </p>
          {suspicious!.heavyActivity.map((h) => (
            <p key={h.userId} className="text-[12.5px] text-accent-rose/90 pl-6">
              <b>{h.name}</b> son 1 saatte <b>{h.count}</b> kez görüntüleme/indirme yaptı
              (son: {dateTr(h.lastAt)})
            </p>
          ))}
          {suspicious!.failedLogins.map((f) => (
            <p key={f.resource} className="text-[12.5px] text-accent-rose/90 pl-6">
              <b>{f.resource}</b> için son 30 dakikada <b>{f.count}</b> başarısız giriş denemesi
              (son: {dateTr(f.lastAt)})
            </p>
          ))}
        </div>
      )}

      <Card pad={false}>
        <div className="px-5 py-4 flex flex-wrap items-center gap-2.5 border-b border-line">
          <input
            value={q}
            onChange={(e) => applyFilter(() => setQ(e.target.value))}
            placeholder="Kullanıcı, e-posta veya kaynak ara…"
            className="rounded-xl border border-line px-3 py-1.5 text-[12.5px] outline-none focus:border-brand-500 w-56"
          />
          <select
            value={action}
            onChange={(e) => applyFilter(() => setAction(e.target.value))}
            className="rounded-xl border border-line px-3 py-1.5 text-[12.5px] outline-none focus:border-brand-500 bg-white"
          >
            <option value="">Tüm eylemler</option>
            {actions.map((a) => (
              <option key={a} value={a}>{actionLabel(a)}</option>
            ))}
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => applyFilter(() => setFrom(e.target.value))}
            className="rounded-xl border border-line px-3 py-1.5 text-[12.5px] outline-none focus:border-brand-500"
          />
          <span className="text-[12px] text-ink-400">—</span>
          <input
            type="date"
            value={to}
            onChange={(e) => applyFilter(() => setTo(e.target.value))}
            className="rounded-xl border border-line px-3 py-1.5 text-[12.5px] outline-none focus:border-brand-500"
          />
          <p className="ml-auto text-[12px] text-ink-400">{total} kayıt</p>
        </div>

        {rows.length === 0 && !loading ? (
          <Empty title="Kayıt yok" sub="Filtreyi değiştirmeyi dene." icon={<Icon name="clock" />} />
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full min-w-[900px]">
              <thead className="bg-ink-900/[0.02] border-b border-line">
                <tr>
                  <Th align="left">Zaman</Th>
                  <Th align="left">Kullanıcı</Th>
                  <Th align="left">Eylem</Th>
                  <Th align="left">Kaynak</Th>
                  <Th align="left">IP</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-900/[0.02]">
                    <Td className="text-[12px] text-ink-500 whitespace-nowrap">{dateTr(r.createdAt)}</Td>
                    <Td>
                      {r.userEmail ? (
                        <div className="min-w-0">
                          <p className="text-[12.5px] text-ink-900 truncate max-w-[200px]">
                            {r.userName || r.userEmail}
                          </p>
                          {r.userName && <p className="text-[11px] text-ink-400 truncate max-w-[200px]">{r.userEmail}</p>}
                        </div>
                      ) : (
                        <span className="text-[12px] text-ink-300">—</span>
                      )}
                    </Td>
                    <Td>
                      <span className={clsx(
                        "text-[11.5px] font-medium px-2 py-0.5 rounded-full",
                        r.action.includes("failed") || r.action.includes("denied") || r.action.includes("rate_limited")
                          ? "bg-rose-50 text-accent-rose"
                          : "bg-ink-900/[0.05] text-ink-700"
                      )}>
                        {actionLabel(r.action)}
                      </span>
                    </Td>
                    <Td className="text-[12px] text-ink-500 truncate max-w-[220px]">{r.resource ?? "—"}</Td>
                    <Td className="text-[12px] text-ink-400 font-mono">{r.ip ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="px-5 py-3 flex items-center justify-between border-t border-line">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="text-[12.5px] text-ink-600 hover:text-ink-900 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Önceki
            </button>
            <p className="text-[12px] text-ink-400">Sayfa {page} / {totalPages}</p>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="text-[12.5px] text-ink-600 hover:text-ink-900 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Sonraki →
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
