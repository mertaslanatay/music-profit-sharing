import type { Viewer } from "./access";
import { createHash } from "node:crypto";

/**
 * Bir görüntüleyicinin GÖREBİLDİKLERİNİ belirleyen her şeyin kısa parmak izi.
 * Sayfa açıkken yönetici rolü, label/sanatçı atamasını, "diğerlerini görsün"
 * ayarlarını veya hesap durumunu değiştirirse parmak izi değişir; panel bunu
 * arka plan kontrolünde fark edip sayfayı yeniler (bkz. api/session/check).
 */
export function scopeFingerprint(v: Viewer | null): string {
  if (!v) return "anon";
  const raw = JSON.stringify([
    v.userId, v.role, v.status, v.mfaOk,
    [...v.labelIds].sort(), [...v.artistIds].sort(),
    v.canSeeLabelTotals, v.canSeeOtherArtists,
  ]);
  return createHash("sha256").update(raw).digest("base64url").slice(0, 16);
}
