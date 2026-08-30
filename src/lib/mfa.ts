import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Auth'un yerleşik TOTP (iki adımlı doğrulama) desteğinin ince bir
 * sarmalayıcısı. Faktörler Supabase tarafında tutulur — bizim veritabanımızda
 * ek bir tablo gerekmez.
 *
 * v2-sartname.md § 5: "Admin hesabında 2FA (TOTP) zorunlu."
 *
 * GÜVENLİK NOTU: Bir API çağrısı beklenmedik şekilde hata verirse (ör.
 * Supabase SDK'sında ileride bir isim değişikliği) burası admin'i sonsuza
 * kadar kilitlemesin diye "sorun yok" (mfaOk kısıtlamıyor) kabul eder —
 * güvenlik açısından ideal olan "hata varsa kapat" olurdu ama bu ekran hiç
 * canlı ortamda test edilmediği için yanlış bir varsayım tüm admin panelini
 * kilitleyebilir. Canlıya alınınca gerçek davranış doğrulanmalı.
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

/** Oturum tam olarak kurulmuş mu — doğrulanmış faktör VE bu oturum aal2'ye çıkmış mı? */
export function mfaOkFromState(s: MfaState): boolean {
  return s.hasVerifiedFactor && s.currentLevel === "aal2";
}

/** Şifre girişinin hemen ardından: ikinci faktör (TOTP kodu) istenmeli mi? */
export function mfaChallengeNeeded(s: MfaState): boolean {
  return s.nextLevel === "aal2" && s.currentLevel !== "aal2";
}
