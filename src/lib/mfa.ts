import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Auth'un yerleşik TOTP (iki adımlı doğrulama) desteğinin ince bir
 * sarmalayıcısı. Faktörler Supabase tarafında tutulur — bizim veritabanımızda
 * ek bir tablo gerekmez.
 *
 * M4NM Pulse § 5: giriş standart e-posta + şifre ile yapılır; 2FA zorunlu
 * DEĞİLDİR. Ancak admin kendi hesabına /guvenlik ekranından TOTP kurabilir —
 * kurduysa o andan itibaren girişte ikinci adım istenir (bkz.
 * mfaOkFromState / mfaChallengeNeeded).
 *
 * GÜVENLİK NOTU: Bir API çağrısı beklenmedik şekilde hata verirse (ör.
 * Supabase SDK'sında ileride bir isim değişikliği) burası kullanıcıyı
 * kilitlemesin diye "sorun yok" kabul eder — FAIL_OPEN.
 */

export interface MfaState {
  /** Doğrulanmış bir TOTP faktörü varsa id'si. */
  factorId: string | null;
  hasVerifiedFactor: boolean;
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
}

const FAIL_OPEN: MfaState = {
  factorId: null,
  hasVerifiedFactor: false,
  currentLevel: "aal2",
  nextLevel: "aal2",
};

export async function readMfaState(sb: SupabaseClient): Promise<MfaState> {
  try {
    const [factorsRes, aalRes] = await Promise.all([
      sb.auth.mfa.listFactors(),
      sb.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (factorsRes.error || aalRes.error) return FAIL_OPEN;

    const factorsData = factorsRes.data as { totp?: { id: string; status: string }[]; all?: { id: string; status: string }[] } | null;
    const list = factorsData?.totp?.length ? factorsData.totp : factorsData?.all ?? [];
    const verified = list.find((f) => f.status === "verified");

    const aalData = aalRes.data as { currentLevel: "aal1" | "aal2"; nextLevel: "aal1" | "aal2" | null } | null;

    return {
      factorId: verified?.id ?? null,
      hasVerifiedFactor: !!verified,
      currentLevel: aalData?.currentLevel ?? null,
      nextLevel: aalData?.nextLevel ?? null,
    };
  } catch {
    return FAIL_OPEN;
  }
}

/**
 * Bu oturum hesabın 2FA gereksinimini karşılıyor mu?
 *
 * 2FA artık OPSİYONEL (M4NM Pulse § 5 — giriş e-posta + şifre ile yapılır):
 *  - Hesapta doğrulanmış faktör YOKSA engel yoktur, hesap normal çalışır.
 *  - Hesapta faktör VARSA, o oturum aal2'ye çıkmadan yetkiler açılmaz —
 *    aksi hâlde kullanıcının kendi açtığı 2FA sadece dekoratif olurdu.
 *
 * Bu tanım aynı zamanda FAIL_OPEN'ı gerçekten "açık" hâle getirir:
 * Supabase MFA API'si hata verirse hasVerifiedFactor=false döner ve
 * kullanıcı kilitlenmez (eski tanımda tam tersi oluyordu — yorum
 * "fail open" diyordu ama kod fail-closed davranıyordu).
 */
export function mfaOkFromState(s: MfaState): boolean {
  if (!s.hasVerifiedFactor) return true;
  return s.currentLevel === "aal2";
}

/** Şifre girişinin hemen ardından: ikinci faktör (TOTP kodu) istenmeli mi? */
export function mfaChallengeNeeded(s: MfaState): boolean {
  return s.nextLevel === "aal2" && s.currentLevel !== "aal2";
}
