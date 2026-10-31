"use client";

import { useState } from "react";
import { Icon } from "./ui";

/** Sunucunun önizleme hakkında istemciye verdiği özet (bkz. lib/viewAs.ts). */
export interface PreviewInfo {
  artistName: string;
  hasAccount: boolean;
  accountEmail: string | null;
}

/**
 * Önizlemeyi başlatır ve paneli o sanatçının gözünden yeniden açar.
 * Tam sayfa yükleme bilinçli: istemci yönlendirici önbelleğinde yöneticinin
 * gördüğü veriler kalmasın.
 * Hata olursa mesajı döndürür, başarılıysa sayfa değişir.
 */
export async function startPreview(artistId: string): Promise<string | null> {
  try {
    const r = await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ artistId }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      return j.error ?? "Önizleme başlatılamadı.";
    }
    window.location.href = "/";
    return null;
  } catch {
    return "Önizleme başlatılamadı — bağlantını kontrol et.";
  }
}

export async function stopPreview(next = "/?v=artists") {
  await fetch("/api/admin/view-as", { method: "DELETE" }).catch(() => {});
  window.location.href = next;
}

/**
 * Önizleme şeridi — ekranın en üstünde, kaydırmada kaybolmaz.
 * Kontrast için sabit güneş sarısı zemin: iki temada da "bu normal ekran
 * değil" hissini verir ve markanın kobalt rengiyle karışmaz.
 */
export function PreviewBanner({ info, exitTo }: { info: PreviewInfo; exitTo?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <div
      role="status"
      className="shrink-0 no-print px-4 sm:px-8 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[#1A1405]"
      style={{ background: "#FFC234" }}
    >
      <Icon name="eye" size={16} className="shrink-0" />
      <p className="text-[13px] leading-snug min-w-0 flex-1">
        <b>{info.artistName}</b> olarak görüntülüyorsun.{" "}
        <span className="opacity-80">
          {info.hasAccount
            ? <>Hesabın ({info.accountEmail}) yetkileriyle — sanatçı ekranında ne görüyorsa birebir bu.</>
            : <>Bu sanatçının henüz hesabı yok; yeni bir sanatçı hesabının varsayılan yetkileriyle gösteriliyor.</>}
          {" "}Önizlemede işlem yapılamaz.
        </span>
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={() => { setBusy(true); void stopPreview(exitTo); }}
        className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-[12.5px] font-semibold bg-[#1A1405] text-white hover:bg-black transition-colors disabled:opacity-60"
      >
        <Icon name="close" size={13} />
        {busy ? "Çıkılıyor…" : "Önizlemeden çık"}
      </button>
    </div>
  );
}
