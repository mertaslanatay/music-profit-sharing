"use client";

import { useCallback, useMemo, useState } from "react";
import clsx from "clsx";
import type { UserListRow } from "@/app/api/admin/users/route";
import { Avatar, Button, Card, CardHead, Empty, Icon, Td, Th } from "./ui";
import { PaymentInfoBlock } from "./PaymentInfoBlock";

/* ---------------------------------------------------------------- tipler */

interface LabelOption { id: string; name: string }
interface ArtistOption { id: string; name: string }

interface Props {
  initial: UserListRow[];
  labels: LabelOption[];
  artists: ArtistOption[];
}

type Filter = "all" | "pending" | "active" | "suspended";

const ROLE_LABEL: Record<string, string> = {
  admin: "Yönetici",
  label_manager: "Label Yöneticisi",
  artist: "Sanatçı",
  accountant: "Muhasebe",
};

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  pending: { label: "Bekliyor", cls: "bg-accent-amber/15 text-accent-amber" },
  active: { label: "Aktif", cls: "bg-brand-50 text-brand-700" },
  suspended: { label: "Askıda", cls: "bg-rose-50 text-accent-rose" },
};

const dateTr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/* ================================================================ panel */

export function UsersPanel({ initial, labels, artists }: Props) {
  const [users, setUsers] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /* -------------------------------------------- filtreleme */

  const counts = useMemo(() => {
    const c = { all: 0, pending: 0, active: 0, suspended: 0 };
    for (const u of users) {
      c.all++;
      if (u.status in c) c[u.status as keyof typeof c]++;
    }
    return c;
  }, [users]);

  const filtered = useMemo(() => {
    const lq = q.toLowerCase();
    return users.filter((u) => {
      if (filter !== "all" && u.status !== filter) return false;
      if (lq) {
        const name = `${u.firstName} ${u.lastName}`.toLowerCase();
        if (!name.includes(lq) && !u.email.toLowerCase().includes(lq)
            && !(u.artistName ?? "").toLowerCase().includes(lq)) return false;
      }
      return true;
    });
  }, [users, filter, q]);

  /* -------------------------------------------- veri çekme */

  const refresh = useCallback(async () => {
    const r = await fetch("/api/admin/users");
    const j = await r.json();
    if (j.users) setUsers(j.users);
  }, []);

  /* -------------------------------------------- istek yardımcısı */

  const act = useCallback(async (userId: string, body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const r = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "İstek başarısız.");
      setSuccess(msg);
      await refresh();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const delUser = useCallback(async (userId: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Silinemedi.");
      setSuccess("Kullanıcı silindi.");
      setEditing(null);
      await refresh();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata.");
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  /* ======================================================= render */

  return (
    <div className="space-y-4">
      {/* Durum çubuğu */}
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

      {/* Araç çubuğu */}
      <div className="flex items-center gap-2 flex-wrap">
        {(["all", "pending", "active", "suspended"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={clsx(
              "px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors whitespace-nowrap inline-flex items-center gap-1.5",
              filter === f
                ? "bg-ink-900 text-white"
                : "bg-ink-900/[0.04] text-ink-700 hover:bg-ink-900/[0.08]"
            )}
          >
            {{ all: "Tümü", pending: "Bekleyenler", active: "Aktif", suspended: "Askıda" }[f]}
            <span className={clsx(
              "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
              filter === f ? "bg-white/20" : "bg-ink-900/[0.06]",
              f === "pending" && counts.pending > 0 && filter !== f && "bg-accent-amber/15 text-accent-amber"
            )}>
              {counts[f]}
            </span>
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <Icon name="search" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ara..."
            className="pl-8 pr-3 py-1.5 rounded-xl text-[13px] border border-line bg-white w-48 focus:w-64 transition-all focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
          />
        </div>
      </div>

      {/* Tablo */}
      {filtered.length === 0 ? (
        <Empty title="Kullanıcı yok" sub="Bu filtre ile eşleşen kullanıcı bulunamadı." icon={<Icon name="users" />} />
      ) : (
        <Card pad={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line">
                  <Th>Kullanıcı</Th>
                  <Th>Rol</Th>
                  <Th>Durum</Th>
                  <Th>Erişim</Th>
                  <Th>Kayıt</Th>
                  <Th align="center">İşlem</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    labels={labels}
                    artists={artists}
                    isEditing={editing === u.id}
                    onToggle={() => setEditing(editing === u.id ? null : u.id)}
                    onAction={act}
                    onDelete={delUser}
                    busy={busy}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ========================================================== satır + detay */

function UserRow({
  user: u,
  labels,
  artists,
  isEditing,
  onToggle,
  onAction,
  onDelete,
  busy,
}: {
  user: UserListRow;
  labels: LabelOption[];
  artists: ArtistOption[];
  isEditing: boolean;
  onToggle: () => void;
  onAction: (id: string, body: Record<string, unknown>, msg: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  busy: boolean;
}) {
  const s = STATUS_STYLE[u.status] ?? STATUS_STYLE.pending;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
  const accessParts: string[] = [];
  if (u.labelIds.length > 0) {
    const names = u.labelIds.map((id) => labels.find((l) => l.id === id)?.name ?? "?").join(", ");
    accessParts.push(names);
  }
  if (u.artistIds.length > 0) {
    const names = u.artistIds.map((id) => artists.find((a) => a.id === id)?.name ?? "?").join(", ");
    accessParts.push(names);
  }
  if (u.role === "admin") accessParts.unshift("Tam erişim");

  return (
    <>
      <tr
        className={clsx(
          "border-b border-line last:border-b-0 transition-colors",
          isEditing ? "bg-ink-900/[0.02]" : "hover:bg-ink-900/[0.015]"
        )}
      >
        <Td>
          <div className="flex items-center gap-2.5">
            <Avatar name={name} size={30} />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-ink-900 truncate">{name}</p>
              <p className="text-[11.5px] text-ink-400 truncate">{u.email}</p>
              {u.artistName && (
                <p className="text-[11px] text-ink-400 truncate">Sanatçı: {u.artistName}</p>
              )}
            </div>
          </div>
        </Td>
        <Td>
          <span className="text-[12.5px] font-medium">{ROLE_LABEL[u.role] ?? u.role}</span>
        </Td>
        <Td>
          <span className={clsx("text-[11.5px] font-semibold px-2 py-0.5 rounded-full", s.cls)}>
            {s.label}
          </span>
          {u.statusNote && (
            <p className="text-[11px] text-ink-400 mt-0.5 max-w-[160px] truncate" title={u.statusNote}>
              {u.statusNote}
            </p>
          )}
        </Td>
        <Td>
          <p className="text-[12px] text-ink-500 max-w-[200px] truncate">
            {accessParts.length > 0 ? accessParts.join(" · ") : "—"}
          </p>
        </Td>
        <Td>
          <span className="text-[12px] text-ink-500">{dateTr(u.createdAt)}</span>
        </Td>
        <Td align="center">
          <div className="flex items-center gap-1.5 justify-center">
            {u.status === "pending" && (
              <>
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() => onAction(u.id, { action: "approve" }, `${name} onaylandı.`)}
                  className="text-[11.5px] px-2.5 py-1"
                >
                  <Icon name="check" size={13} /> Onayla
                </Button>
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={() => onAction(u.id, { action: "reject" }, `${name} reddedildi.`)}
                  className="text-[11.5px] px-2.5 py-1"
                >
                  Reddet
                </Button>
              </>
            )}
            <Button
              variant="soft"
              onClick={onToggle}
              className="text-[11.5px] px-2.5 py-1"
            >
              <Icon name="sliders" size={13} />
            </Button>
          </div>
        </Td>
      </tr>
      {isEditing && (
        <tr className="bg-ink-900/[0.015]">
          <td colSpan={6} className="px-4 py-4">
            <UserDetail
              user={u}
              labels={labels}
              artists={artists}
              onAction={onAction}
              onDelete={onDelete}
              busy={busy}
            />
          </td>
        </tr>
      )}
    </>
  );
}

/* ========================================================== detay formu */

function UserDetail({
  user: u,
  labels,
  artists,
  onAction,
  onDelete,
  busy,
}: {
  user: UserListRow;
  labels: LabelOption[];
  artists: ArtistOption[];
  onAction: (id: string, body: Record<string, unknown>, msg: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  busy: boolean;
}) {
  const [role, setRole] = useState(u.role);
  const [selLabels, setSelLabels] = useState<Set<string>>(new Set(u.labelIds));
  const [selArtists, setSelArtists] = useState<Set<string>>(new Set(u.artistIds));
  const [canSeeLabelTotals, setCanSeeLabelTotals] = useState(u.canSeeLabelTotals);
  const [canSeeOtherArtists, setCanSeeOtherArtists] = useState(u.canSeeOtherArtists);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;

  const toggleLabel = (id: string) => {
    const s = new Set(selLabels);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelLabels(s);
  };
  const toggleArtist = (id: string) => {
    const s = new Set(selArtists);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelArtists(s);
  };

  const hasChanges =
    role !== u.role ||
    canSeeLabelTotals !== u.canSeeLabelTotals ||
    canSeeOtherArtists !== u.canSeeOtherArtists ||
    !setsEqual(selLabels, new Set(u.labelIds)) ||
    !setsEqual(selArtists, new Set(u.artistIds));

  const save = () => {
    const body: Record<string, unknown> = {};
    if (role !== u.role) body.role = role;
    if (canSeeLabelTotals !== u.canSeeLabelTotals) body.canSeeLabelTotals = canSeeLabelTotals;
    if (canSeeOtherArtists !== u.canSeeOtherArtists) body.canSeeOtherArtists = canSeeOtherArtists;
    if (!setsEqual(selLabels, new Set(u.labelIds))) body.labelIds = [...selLabels];
    if (!setsEqual(selArtists, new Set(u.artistIds))) body.artistIds = [...selArtists];
    onAction(u.id, body, `${name} güncellendi.`);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* Sol: rol + bayraklar */}
      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-semibold text-ink-500 uppercase tracking-wide mb-1.5">
            Rol
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-xl border border-line px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400"
          >
            {Object.entries(ROLE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Sanatçıya özel bayraklar */}
        <div className="space-y-2">
          <label className="block text-[12px] font-semibold text-ink-500 uppercase tracking-wide">
            Görünürlük
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink-700 cursor-pointer">
            <input
              type="checkbox"
              checked={canSeeLabelTotals}
              onChange={(e) => setCanSeeLabelTotals(e.target.checked)}
              className="rounded border-line text-brand-500 focus:ring-brand-500/30"
            />
            Label toplamlarını görebilsin
          </label>
          <label className="flex items-center gap-2 text-[13px] text-ink-700 cursor-pointer">
            <input
              type="checkbox"
              checked={canSeeOtherArtists}
              onChange={(e) => setCanSeeOtherArtists(e.target.checked)}
              className="rounded border-line text-brand-500 focus:ring-brand-500/30"
            />
            Aynı labeldaki diğer sanatçıları görebilsin
          </label>
        </div>

        {/* Durum aksiyonları */}
        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-line">
          {u.status === "active" && (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => onAction(u.id, { action: "suspend" }, `${name} askıya alındı.`)}
            >
              <Icon name="close" size={13} /> Askıya Al
            </Button>
          )}
          {u.status === "suspended" && (
            <>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => onAction(u.id, { action: "reactivate" }, `${name} yeniden etkinleştirildi.`)}
              >
                <Icon name="check" size={13} /> Yeniden Etkinleştir
              </Button>
              {!confirmDelete ? (
                <Button variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                  <Icon name="trash" size={13} /> Sil
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-accent-rose font-medium">Emin misin?</span>
                  <Button variant="danger" disabled={busy} onClick={() => onDelete(u.id)}>
                    Evet, sil
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>
                    Vazgeç
                  </Button>
                </div>
              )}
            </>
          )}
          {u.status === "pending" && (
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => onAction(u.id, { action: "approve" }, `${name} onaylandı.`)}
            >
              <Icon name="check" size={13} /> Onayla
            </Button>
          )}
        </div>
      </div>

      {/* Sağ: erişim kapsamı */}
      <div className="space-y-4">
        {/* Label erişimi */}
        {labels.length > 0 && (
          <div>
            <label className="block text-[12px] font-semibold text-ink-500 uppercase tracking-wide mb-1.5">
              Label Erişimi
            </label>
            <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl border border-line p-2 bg-white">
              {labels.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-[13px] text-ink-700 cursor-pointer py-0.5 px-1 rounded hover:bg-ink-900/[0.03]">
                  <input
                    type="checkbox"
                    checked={selLabels.has(l.id)}
                    onChange={() => toggleLabel(l.id)}
                    className="rounded border-line text-brand-500 focus:ring-brand-500/30"
                  />
                  {l.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Sanatçı erişimi */}
        {artists.length > 0 && (
          <div>
            <label className="block text-[12px] font-semibold text-ink-500 uppercase tracking-wide mb-1.5">
              Sanatçı Erişimi
            </label>
            <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl border border-line p-2 bg-white">
              {artists.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-[13px] text-ink-700 cursor-pointer py-0.5 px-1 rounded hover:bg-ink-900/[0.03]">
                  <input
                    type="checkbox"
                    checked={selArtists.has(a.id)}
                    onChange={() => toggleArtist(a.id)}
                    className="rounded border-line text-brand-500 focus:ring-brand-500/30"
                  />
                  {a.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Ödeme bilgileri — yalnızca bir sanatçıya bağlı kullanıcılarda anlamlı.
            Kaydedilmiş IBAN sanatçıya aittir, kullanıcıya değil; bu yüzden
            kullanıcının erişimi olan her sanatçı için ayrı blok gösteriyoruz. */}
        {selArtists.size > 0 && (
          <div>
            <label className="block text-[12px] font-semibold text-ink-500 uppercase tracking-wide mb-1.5">
              Ödeme Bilgileri
            </label>
            <div className="space-y-2">
              {[...selArtists].slice(0, 4).map((id) => (
                <PaymentInfoBlock
                  key={id}
                  artistId={id}
                  artistName={artists.find((a) => a.id === id)?.name ?? "Sanatçı"}
                />
              ))}
              {selArtists.size > 4 && (
                <p className="text-[11.5px] text-ink-400">
                  +{selArtists.size - 4} sanatçı daha — ödeme bilgilerini “Ödemeler”
                  sekmesinden düzenleyebilirsin.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Kaydet */}
        {hasChanges && (
          <div className="flex justify-end">
            <Button variant="primary" disabled={busy} onClick={save}>
              <Icon name="save" size={13} /> Kaydet
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================ yardımcılar */

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
