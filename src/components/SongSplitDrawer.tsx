"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Avatar, Button, Drawer, Icon } from "./ui";

/**
 * Şarkının KALICI bölüşümünü düzenler (M4NM Pulse, şartname sonrası madde 5).
 *
 * SongTransferDrawer'dan (Faz C, gelir hakkı devri) FARKI: bu, bir ödeme
 * partisi/dönem seçili olmasa bile açılır — çünkü bölüşüm dönem bazlı değil,
 * şarkı bazlı ve kalıcıdır. "Ana sanatçı" (ingest'teki position=0) veya
 * label yöneticisi/muhasebeci, ya da admin buradan payları yeniden
 * belirleyebilir ve label'daki başka bir sanatçıyı yeni hak sahibi olarak
 * ekleyebilir.
 */

interface RosterRow {
  artistId: string;
  artistName: string;
  share: number; // 0..1
  position: number;
}

interface LabelArtistOption {
  artistId: string;
  artistName: string;
}

interface Detail {
  songId: string;
  title: string;
  album: string;
  isrc: string;
  artistString: string;
  hasOverride: boolean;
  roster: RosterRow[];
  primaryArtistId: string | null;
  primaryArtistName: string | null;
}

interface Payload {
  detail: Detail;
  canEdit: boolean;
  isAdmin: boolean;
  labelArtists: LabelArtistOption[];
}

interface EditRow {
  artistId: string;
  artistName: string;
  pct: string; // düzenleme sırasında serbest metin (kullanıcı yazarken)
}

const fmtPct = (share: number) => `%${(share * 100).toFixed(1)}`;

export function SongSplitDrawer({
  songId,
  songTitle,
  onClose,
  onChanged,
}: {
  songId: string;
  songTitle: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);

  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [addQuery, setAddQuery] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotReady(false);
    try {
      const r = await fetch(`/api/songs/${songId}/split`);
      const j = await r.json();
      if (r.status === 503) {
        setNotReady(true);
        return;
      }
      if (!r.ok) throw new Error(j.error || "Şarkı bilgisi alınamadı.");
      setData(j);
      setRows(
        (j.detail as Detail).roster.map((a) => ({
          artistId: a.artistId,
          artistName: a.artistName,
          pct: (a.share * 100).toFixed(1),
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bilinmeyen hata.");
    } finally {
      setLoading(false);
    }
  }, [songId]);

  useEffect(() => { void load(); }, [load]);

  const sum = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.pct.replace(",", ".")) || 0), 0),
    [rows]
  );
  const sumOk = Math.abs(sum - 100) < 0.05;

  const startEdit = () => {
    setSaveError(null);
    setAddQuery("");
    setEditing(true);
  };
  const cancelEdit = () => {
    if (data) {
      setRows(
        data.detail.roster.map((a) => ({
          artistId: a.artistId,
          artistName: a.artistName,
          pct: (a.share * 100).toFixed(1),
        }))
      );
    }
    setSaveError(null);
    setEditing(false);
  };

  const setRowPct = (artistId: string, pct: string) => {
    setRows((rs) => rs.map((r) => (r.artistId === artistId ? { ...r, pct } : r)));
  };

  const removeRow = (artistId: string) => {
    setRows((rs) => rs.filter((r) => r.artistId !== artistId));
  };

  const addArtist = (opt: LabelArtistOption) => {
    if (rows.some((r) => r.artistId === opt.artistId)) return;
    setRows((rs) => [...rs, { artistId: opt.artistId, artistName: opt.artistName, pct: "0" }]);
    setAddQuery("");
  };

  const splitEqually = () => {
    const n = rows.length;
    if (n === 0) return;
    // Onda bir yüzde (binde) hassasiyetinde tam sayı böl — 100/3 gibi
    // durumlarda ondalık kesirler toplamı %99.9'da bırakıp "Kaydet"i hep
    // devre dışı tutmasın diye kalan, ilk satırlara birer birim dağıtılır
    // (örn. 3 kişi: %33.4, %33.3, %33.3 — toplam tam %100.0).
    const baseTenths = Math.floor(1000 / n);
    const remainder = 1000 - baseTenths * n;
    setRows((rs) =>
      rs.map((r, i) => ({ ...r, pct: ((baseTenths + (i < remainder ? 1 : 0)) / 10).toFixed(1) }))
    );
  };

  const save = async () => {
    if (!sumOk || rows.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const roster = rows.map((r) => ({
        artistId: r.artistId,
        share: (Number(r.pct.replace(",", ".")) || 0) / 100,
      }));
      const r = await fetch(`/api/songs/${songId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roster }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Kaydedilemedi.");
      setEditing(false);
      await load();
      onChanged?.();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Bilinmeyen hata.");
    } finally {
      setSaving(false);
    }
  };

  const resetToNatural = async () => {
    if (!confirm("Bu şarkının özel bölüşümü kaldırılıp orijinal (Excel'den gelen) paylara dönülsün mü?")) {
      return;
    }
    setResetting(true);
    setResetError(null);
    try {
      const r = await fetch(`/api/songs/${songId}/split`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Sıfırlanamadı.");
      await load();
      onChanged?.();
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "Bilinmeyen hata.");
    } finally {
      setResetting(false);
    }
  };

  const filteredCandidates = useMemo(() => {
    if (!data) return [];
    const inRoster = new Set(rows.map((r) => r.artistId));
    const q = addQuery.trim().toLocaleLowerCase("tr");
    return data.labelArtists
      .filter((a) => !inRoster.has(a.artistId))
      .filter((a) => !q || a.artistName.toLocaleLowerCase("tr").includes(q))
      .slice(0, 8);
  }, [data, rows, addQuery]);

  return (
    <Drawer open onClose={onClose} title={songTitle} sub={data?.detail.artistString ?? "Şarkı bölüşümü"} width={560}>
      {loading ? (
        <p className="text-[13px] text-ink-400 py-8 text-center">Yükleniyor…</p>
      ) : notReady ? (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[13px] text-amber-800 flex items-start gap-2">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
          Bölüşüm düzenleme altyapısı henüz kurulmadı.
        </div>
      ) : error ? (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-[13px] text-accent-rose flex items-start gap-2">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      ) : !data ? null : (
        <div className="space-y-5">
          {data.detail.isrc && (
            <p className="text-[11.5px] text-ink-400">
              ISRC <span className="font-mono text-ink-500">{data.detail.isrc}</span>
            </p>
          )}

          <div className="rounded-xl bg-ink-900/[0.025] border border-line p-3">
            <p className="text-[12px] text-ink-500 leading-relaxed">
              Burada belirlenen paylar <b>kalıcıdır</b> — kilitli olmayan tüm dönemlerin hakedişini
              anında etkiler. Kilitli (ödemesi kesinleşmiş) dönemler bu değişiklikten hiç etkilenmez.
              {data.detail.primaryArtistName && (
                <>
                  {" "}Bu şarkının ana sanatçısı <b>{data.detail.primaryArtistName}</b>.
                </>
              )}
            </p>
          </div>

          {!editing ? (
            <>
              <div className="space-y-1.5">
                {data.detail.roster.map((a) => (
                  <div
                    key={a.artistId}
                    className="flex items-center gap-3 py-2 px-2.5 rounded-xl bg-ink-900/[0.02]"
                  >
                    <Avatar name={a.artistName} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink-900 truncate flex items-center gap-1.5">
                        {a.artistName}
                        {a.artistId === data.detail.primaryArtistId && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 shrink-0">
                            ana
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="text-[13px] font-semibold text-ink-900 tabular shrink-0">
                      {fmtPct(a.share)}
                    </span>
                  </div>
                ))}
              </div>
              {data.canEdit ? (
                <div className="space-y-2">
                  <Button variant="primary" onClick={startEdit} className="w-full justify-center">
                    <Icon name="percent" size={14} /> Bölüşümü düzenle
                  </Button>
                  {data.detail.hasOverride && (
                    <Button
                      variant="ghost"
                      onClick={resetToNatural}
                      disabled={resetting}
                      className="w-full justify-center"
                    >
                      {resetting ? "Sıfırlanıyor…" : "Orijinal paylara döndür"}
                    </Button>
                  )}
                  {resetError && (
                    <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-[12.5px] text-accent-rose flex items-start gap-2">
                      <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {resetError}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[12px] text-ink-400 text-center">
                  Bu şarkının bölüşümünü yalnızca ana sanatçısı veya label yöneticisi düzenleyebilir.
                </p>
              )}
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                {rows.map((r) => (
                  <div key={r.artistId} className="flex items-center gap-2.5 py-1.5">
                    <Avatar name={r.artistName} size={26} />
                    <span className="text-[13px] text-ink-800 truncate flex-1 min-w-0 flex items-center gap-1.5">
                      {r.artistName}
                      {r.artistId === data.detail.primaryArtistId && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-brand-50 text-brand-700 shrink-0">
                          ana
                        </span>
                      )}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={r.pct}
                        onChange={(e) => setRowPct(r.artistId, e.target.value)}
                        className="w-16 px-2 py-1.5 rounded-lg border border-line text-[13px] text-right tabular focus:outline-none focus:ring-2 focus:ring-brand-200"
                      />
                      <span className="text-[12px] text-ink-400">%</span>
                      <button
                        type="button"
                        onClick={() => removeRow(r.artistId)}
                        className="p-1.5 rounded-lg text-ink-300 hover:text-accent-rose hover:bg-rose-50 transition-colors"
                        title="Listeden çıkar"
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between text-[12.5px]">
                <button
                  type="button"
                  onClick={splitEqually}
                  className="text-brand-600 hover:text-brand-700 font-medium transition-colors"
                >
                  Eşit böl
                </button>
                <span className={clsx("tabular font-medium", sumOk ? "text-emerald-600" : "text-accent-rose")}>
                  Toplam: %{sum.toFixed(1)}
                </span>
              </div>

              <div className="border-t border-line pt-3 space-y-2">
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-400">
                  Label&apos;dan hak sahibi ekle
                </p>
                <input
                  type="text"
                  value={addQuery}
                  onChange={(e) => setAddQuery(e.target.value)}
                  placeholder="Sanatçı ara…"
                  className="w-full px-3 py-2 rounded-lg border border-line text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
                {addQuery && filteredCandidates.length > 0 && (
                  <div className="rounded-lg border border-line divide-y divide-line overflow-hidden">
                    {filteredCandidates.map((c) => (
                      <button
                        key={c.artistId}
                        type="button"
                        onClick={() => addArtist(c)}
                        className="w-full text-left px-3 py-2 text-[13px] text-ink-700 hover:bg-brand-50/50 transition-colors"
                      >
                        {c.artistName}
                      </button>
                    ))}
                  </div>
                )}
                {addQuery && filteredCandidates.length === 0 && (
                  <p className="text-[12px] text-ink-300">Eşleşen sanatçı yok.</p>
                )}
              </div>

              {saveError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-[12.5px] text-accent-rose flex items-start gap-2">
                  <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {saveError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button variant="ghost" onClick={cancelEdit} disabled={saving} className="flex-1 justify-center">
                  Vazgeç
                </Button>
                <Button
                  variant="primary"
                  onClick={save}
                  disabled={saving || !sumOk || rows.length === 0}
                  className="flex-1 justify-center"
                >
                  {saving ? "Kaydediliyor…" : "Kaydet"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
