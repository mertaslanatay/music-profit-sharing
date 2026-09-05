"use client";

import { useCallback, useMemo, useState } from "react";
import clsx from "clsx";
import { splitArtists } from "@/lib/artists";
import type { Separator, SeparatorKind } from "@/lib/types";
import { Button, Card, CardHead, Empty, Icon, Td, Th } from "./ui";

/**
 * Sanatçı ayrıştırma belirteçleri (M4NM Pulse § 4).
 *
 * Excel'deki "Ağaçkakan, Emiladil feat. Barış" gibi tek bir metin alanının
 * kaç sanatçıya bölüneceğini bu belirteçler belirler. Yükleme sırasında
 * uygulanırlar — burada yapılan değişiklik GEÇMİŞ raporları değiştirmez.
 */

const KIND_LABEL: Record<SeparatorKind, string> = {
  word: "Kelime",
  symbol: "İşaret",
};

const KIND_HINT: Record<SeparatorKind, string> = {
  word: "Yalnızca boşlukla çevriliyse böler — isim içinde bölme yapmaz.",
  symbol: "Çevresinde boşluk olmasa da böler.",
};

interface Props {
  initial: Separator[];
}

export function SeparatorsPanel({ initial }: Props) {
  const [items, setItems] = useState<Separator[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  // Yeni belirteç formu
  const [newToken, setNewToken] = useState("");
  const [newKind, setNewKind] = useState<SeparatorKind>("word");

  // Canlı deneme kutusu
  const [test, setTest] = useState("Ağaçkakan, Emiladil feat. Barış Demirel");
  const parts = useMemo(() => splitArtists(test, items), [test, items]);

  const ok = (msg: string) => {
    setSuccess(msg);
    setError(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  const refresh = useCallback(async () => {
    const r = await fetch("/api/admin/separators");
    const j = await r.json();
    if (j.separators) setItems(j.separators);
  }, []);

  const send = useCallback(
    async (url: string, method: string, body: unknown, msg: string) => {
      setBusy(true);
      setError(null);
      setSuccess(null);
      try {
        const r = await fetch(url, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
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
    },
    [refresh]
  );

  const add = async () => {
    const token = newToken.trim();
    if (!token) return setError("Belirteç boş olamaz.");
    // Yeni belirteç listenin sonuna eklenir; virgülden önce çalışsın diye
    // en büyük sıranın bir eksiğini vermiyoruz — sıralamayı admin ayarlar.
    const sort = Math.max(0, ...items.map((i) => i.sort)) + 10;
    const done = await send(
      "/api/admin/separators",
      "POST",
      { token, kind: newKind, isActive: true, sort },
      `"${token}" eklendi.`
    );
    if (done) {
      setNewToken("");
      setNewKind("word");
    }
  };

  const toggle = (s: Separator) =>
    send(
      `/api/admin/separators/${s.id}`,
      "PATCH",
      { isActive: !s.isActive },
      `"${s.token}" ${s.isActive ? "pasife alındı" : "aktifleştirildi"}.`
    );

  const saveEdit = (s: Separator, token: string, kind: SeparatorKind, sort: number) =>
    send(`/api/admin/separators/${s.id}`, "PATCH", { token, kind, sort }, `"${token}" güncellendi.`).then(
      (done) => {
        if (done) setEditing(null);
      }
    );

  const remove = (s: Separator) => {
    if (!confirm(`"${s.token}" belirteci silinecek. Bundan sonraki yüklemelerde bu ayırıcı kullanılmayacak. Emin misin?`)) return;
    return send(`/api/admin/separators/${s.id}`, "DELETE", null, `"${s.token}" silindi.`);
  };

  const activeCount = items.filter((i) => i.isActive).length;

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
          title="Ayrıştırma belirteçleri"
          sub={`${activeCount} aktif / ${items.length} tanımlı — Excel'deki sanatçı alanını kaç kişiye böleceğimizi bunlar belirler.`}
        />

        <div className="rounded-xl bg-ink-900/[0.03] border border-line px-3.5 py-3 text-[12.5px] text-ink-500 leading-relaxed mb-4">
          <span className="font-medium text-ink-700">Not:</span> Belirteçler dosya
          yüklenirken uygulanır. Buradaki bir değişiklik <span className="font-medium">geçmiş
          raporları yeniden hesaplamaz</span>, yalnızca bundan sonraki yüklemeleri etkiler.
        </div>

        {items.length === 0 ? (
          <Empty title="Hiç belirteç yok" sub="Aşağıdan ilk belirteci ekle." icon="split" />
        ) : (
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  <Th>Belirteç</Th>
                  <Th>Tür</Th>
                  <Th align="right">Sıra</Th>
                  <Th>Durum</Th>
                  <Th align="right">İşlem</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) =>
                  editing === s.id ? (
                    <EditRow
                      key={s.id}
                      sep={s}
                      busy={busy}
                      onCancel={() => setEditing(null)}
                      onSave={(token, kind, sort) => saveEdit(s, token, kind, sort)}
                    />
                  ) : (
                    <tr key={s.id} className="border-b border-line/60 hover:bg-ink-900/[0.015]">
                      <Td>
                        <span className="font-mono text-[13px] text-ink-900 bg-ink-900/[0.05] rounded-lg px-2 py-0.5">
                          {s.token}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-ink-700">{KIND_LABEL[s.kind]}</span>
                        <span className="block text-[11.5px] text-ink-400">{KIND_HINT[s.kind]}</span>
                      </Td>
                      <Td align="right" className="tabular text-ink-500">{s.sort}</Td>
                      <Td>
                        <button
                          onClick={() => toggle(s)}
                          disabled={busy}
                          className={clsx(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium transition-colors",
                            s.isActive
                              ? "bg-brand-50 text-brand-700 hover:bg-brand-100"
                              : "bg-ink-900/[0.05] text-ink-400 hover:bg-ink-900/[0.08]"
                          )}
                          title={s.isActive ? "Pasife al" : "Aktifleştir"}
                        >
                          <Icon name={s.isActive ? "check" : "close"} size={13} />
                          {s.isActive ? "Aktif" : "Pasif"}
                        </button>
                      </Td>
                      <Td align="right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button variant="ghost" onClick={() => setEditing(s.id)} disabled={busy}>
                            Düzenle
                          </Button>
                          <Button variant="danger" onClick={() => remove(s)} disabled={busy}>
                            Sil
                          </Button>
                        </div>
                      </Td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Yeni belirteç */}
        <div className="mt-4 pt-4 border-t border-line flex flex-wrap items-end gap-2.5">
          <div>
            <label className="block text-[11px] font-medium text-ink-400 mb-1">Yeni belirteç</label>
            <input
              value={newToken}
              onChange={(e) => setNewToken(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
              placeholder="örn. presents"
              className="rounded-xl border border-line px-3 py-1.5 text-[13px] bg-white outline-none focus:border-brand-500 transition-colors w-[180px] font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink-400 mb-1">Tür</label>
            <select
              value={newKind}
              onChange={(e) => setNewKind(e.target.value as SeparatorKind)}
              className="rounded-xl border border-line px-3 py-1.5 text-[13px] bg-white outline-none focus:border-brand-500 transition-colors"
            >
              <option value="word">Kelime (boşlukla çevrili)</option>
              <option value="symbol">İşaret (boşluk gerekmez)</option>
            </select>
          </div>
          <Button variant="primary" onClick={add} disabled={busy || !newToken.trim()}>
            {busy ? "Ekleniyor…" : "Ekle"}
          </Button>
        </div>
      </Card>

      {/* Canlı deneme */}
      <Card>
        <CardHead
          title="Dene"
          sub="Bir sanatçı metni yaz, mevcut belirteçlerle nasıl bölündüğünü gör."
        />
        <input
          value={test}
          onChange={(e) => setTest(e.target.value)}
          className="w-full rounded-xl border border-line px-3.5 py-2 text-[13.5px] bg-white outline-none focus:border-brand-500 transition-colors"
          placeholder="Ağaçkakan, Emiladil feat. Barış Demirel"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {parts.length === 0 ? (
            <span className="text-[13px] text-ink-400">—</span>
          ) : (
            parts.map((p, i) => (
              <span
                key={`${p}-${i}`}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 text-[12.5px] font-medium"
              >
                {i === 0 && <Icon name="check" size={12} />}
                {p}
              </span>
            ))
          )}
        </div>
        <p className="text-[11.5px] text-ink-400 mt-2.5">
          {parts.length} sanatçı — ilki ana sanatçı sayılır, gelir eşit bölüşülür
          (özel oran tanımlanmadıysa).
        </p>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ düzenleme satırı */

function EditRow({
  sep,
  busy,
  onCancel,
  onSave,
}: {
  sep: Separator;
  busy: boolean;
  onCancel: () => void;
  onSave: (token: string, kind: SeparatorKind, sort: number) => void;
}) {
  const [token, setToken] = useState(sep.token);
  const [kind, setKind] = useState<SeparatorKind>(sep.kind);
  const [sort, setSort] = useState(String(sep.sort));

  return (
    <tr className="border-b border-line/60 bg-brand-50/40">
      <Td>
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoFocus
          className="rounded-lg border border-line px-2.5 py-1 text-[13px] bg-white outline-none focus:border-brand-500 w-[140px] font-mono"
        />
      </Td>
      <Td>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as SeparatorKind)}
          className="rounded-lg border border-line px-2.5 py-1 text-[13px] bg-white outline-none focus:border-brand-500"
        >
          <option value="word">Kelime</option>
          <option value="symbol">İşaret</option>
        </select>
      </Td>
      <Td align="right">
        <input
          value={sort}
          onChange={(e) => setSort(e.target.value.replace(/\D/g, "").slice(0, 4))}
          inputMode="numeric"
          className="rounded-lg border border-line px-2.5 py-1 text-[13px] bg-white outline-none focus:border-brand-500 w-[70px] text-right tabular"
        />
      </Td>
      <Td>
        <span className="text-[12px] text-ink-400">değişmez</span>
      </Td>
      <Td align="right">
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="primary"
            disabled={busy || !token.trim()}
            onClick={() => onSave(token.trim(), kind, Number(sort) || sep.sort)}
          >
            Kaydet
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Vazgeç
          </Button>
        </div>
      </Td>
    </tr>
  );
}
