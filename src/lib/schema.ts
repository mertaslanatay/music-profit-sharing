import { queryOne } from "./db";

/**
 * Şema yetenek keşfi.
 *
 * Kod ile veritabanı migration'ı aynı anda canlıya çıkmıyor: Vercel push ile
 * dağıtıyor, migration'ı ise insan elle çalıştırıyor. Arada kalan pencerede
 * yeni kod eski şemaya çarpar. Bu yüzden gelir devri görünümüne (0009) körlemesine
 * güvenmiyoruz — varsa onu, yoksa ham `credits` tablosunu kullanıyoruz.
 *
 * Fark yalnızca devirlerin uygulanıp uygulanmamasıdır; migration çalışmadan
 * önce zaten hiç devir kaydı olamayacağı için sonuçlar da aynıdır.
 */

let cached: { source: "v_credits_effective" | "credits"; at: number } | null = null;

/** Görünüm bulunmadığında bir dakika sonra tekrar bakılır (migration sonrası ısınma). */
const RETRY_MS = 60_000;

export async function creditsSource(): Promise<"v_credits_effective" | "credits"> {
  const now = Date.now();
  if (cached && (cached.source === "v_credits_effective" || now - cached.at < RETRY_MS)) {
    return cached.source;
  }
  try {
    const row = await queryOne<{ t: string | null }>(
      `select to_regclass('public.v_credits_effective')::text as t`
    );
    cached = { source: row?.t ? "v_credits_effective" : "credits", at: now };
  } catch {
    cached = { source: "credits", at: now };
  }
  return cached.source;
}

/**
 * Devir satırlarını dışarıda bırakan sayım süzgeci.
 *
 * Para toplamlarına devir satırları DAHİL edilir (devralanın hakedişi odur),
 * ama "kaç Excel satırı" gibi sayımlara edilmez — aksi hâlde bir devir,
 * raporun satır sayısını şişirirdi. Görünüm yoksa süzgeç boş döner.
 */
export function realRowFilter(source: string, alias = "c"): string {
  return source === "v_credits_effective" ? ` filter (where not ${alias}.is_transfer)` : "";
}

/* --------------------------------------------------- gelir devri tablosu */

let transfersCache: { ready: boolean; at: number } | null = null;

/**
 * revenue_transfers tablosu kurulu mu?
 *
 * creditsSource() yalnızca GÖRÜNÜMÜ yokluyordu; oysa devir okuma/yazma yolu
 * TABLOYA bağlı. Migration çalışmadan kod canlıya çıktığında şarkı satırına
 * tıklayan herkes ham Postgres hatası alırdı — bu kontrol o pencereyi kapatır.
 */
export async function transfersReady(): Promise<boolean> {
  const now = Date.now();
  if (transfersCache && (transfersCache.ready || now - transfersCache.at < RETRY_MS)) {
    return transfersCache.ready;
  }
  try {
    const row = await queryOne<{ t: string | null }>(
      `select to_regclass('public.revenue_transfers')::text as t`
    );
    transfersCache = { ready: !!row?.t, at: now };
  } catch {
    transfersCache = { ready: false, at: now };
  }
  return transfersCache.ready;
}

/* ------------------------------------------------- iletişim merkezi tabloları */

let supportCache: { ready: boolean; at: number } | null = null;

/**
 * support_threads tablosu kurulu mu? (0010)
 *
 * Aynı dağıtım penceresi sorunu: kod push ile canlıya çıkıyor, migration'ı
 * insan sonra çalıştırıyor. Arada kalan sürede destek kutusunu açan herkes
 * ham Postgres hatası almasın diye.
 */
export async function supportReady(): Promise<boolean> {
  const now = Date.now();
  if (supportCache && (supportCache.ready || now - supportCache.at < RETRY_MS)) {
    return supportCache.ready;
  }
  try {
    const row = await queryOne<{ t: string | null }>(
      `select to_regclass('public.support_threads')::text as t`
    );
    supportCache = { ready: !!row?.t, at: now };
  } catch {
    supportCache = { ready: false, at: now };
  }
  return supportCache.ready;
}
