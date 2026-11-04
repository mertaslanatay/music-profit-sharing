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

/* ------------------------------------------------- kalıcı şarkı bölüşümü */

let songSplitsCache: { ready: boolean; at: number } | null = null;

/**
 * song_splits tablosu (0013) kurulu mu?
 *
 * Aynı dağıtım penceresi sorunu: kod push ile canlıya çıkıyor, migration
 * insan tarafından sonra çalıştırılıyor. Migration çalışmadan önce şarkı
 * drawer'ındaki "bölüşümü düzenle" ekranı ham Postgres hatası yerine
 * "henüz kurulmadı" mesajı göstermeli.
 */
export async function songSplitsReady(): Promise<boolean> {
  const now = Date.now();
  if (songSplitsCache && (songSplitsCache.ready || now - songSplitsCache.at < RETRY_MS)) {
    return songSplitsCache.ready;
  }
  try {
    const row = await queryOne<{ t: string | null }>(
      `select to_regclass('public.song_splits')::text as t`
    );
    songSplitsCache = { ready: !!row?.t, at: now };
  } catch {
    songSplitsCache = { ready: false, at: now };
  }
  return songSplitsCache.ready;
}

/* ------------------------------------------- ödemelerde label izi (0018) */

let payLabelsCache: { ready: boolean; at: number } | null = null;

/**
 * payment_period_labels tablosu (0018) kurulu mu? Kurulu değilse toplu
 * kapatma label izi yazmaz, kırılım ödemeyi eskisi gibi orantılı böler.
 */
export async function paymentLabelsReady(): Promise<boolean> {
  const now = Date.now();
  if (payLabelsCache && (payLabelsCache.ready || now - payLabelsCache.at < RETRY_MS)) {
    return payLabelsCache.ready;
  }
  try {
    const row = await queryOne<{ t: string | null }>(
      `select to_regclass('public.payment_period_labels')::text as t`
    );
    payLabelsCache = { ready: !!row?.t, at: now };
  } catch {
    payLabelsCache = { ready: false, at: now };
  }
  return payLabelsCache.ready;
}

/* --------------------------------------------- toplu işlem kaydı (0019) */

let batchesCache: { ready: boolean; at: number } | null = null;

/** payment_batches tablosu ve payments.batch_id sütunu (0019) kurulu mu? */
export async function paymentBatchesReady(): Promise<boolean> {
  const now = Date.now();
  if (batchesCache && (batchesCache.ready || now - batchesCache.at < RETRY_MS)) {
    return batchesCache.ready;
  }
  try {
    const row = await queryOne<{ ok: boolean }>(
      `select to_regclass('public.payment_batches') is not null
              and exists (select 1 from information_schema.columns
                          where table_schema = 'public' and table_name = 'payments'
                            and column_name = 'batch_id') as ok`
    );
    batchesCache = { ready: !!row?.ok, at: now };
  } catch {
    batchesCache = { ready: false, at: now };
  }
  return batchesCache.ready;
}

/* --------------------------------------- label'a özel duyurular (0020) */

let annLabelsCache: { ready: boolean; at: number } | null = null;

/** announcements.label_ids (0020) kurulu mu? */
export async function announcementLabelsReady(): Promise<boolean> {
  const now = Date.now();
  if (annLabelsCache && (annLabelsCache.ready || now - annLabelsCache.at < RETRY_MS)) {
    return annLabelsCache.ready;
  }
  try {
    const row = await queryOne<{ ok: boolean }>(
      `select exists (select 1 from information_schema.columns
                      where table_schema = 'public' and table_name = 'announcements'
                        and column_name = 'label_ids') as ok`
    );
    annLabelsCache = { ready: !!row?.ok, at: now };
  } catch {
    annLabelsCache = { ready: false, at: now };
  }
  return annLabelsCache.ready;
}

/**
 * Duyuru görünürlüğü — `a` takma adlı announcements satırı, `$n` kullanıcı
 * kimliği. Boş label listesi herkese açıktır.
 */
export const ANNOUNCEMENT_VISIBLE = (userParam: string) => `(
  a.label_ids = '{}'
  or exists (select 1 from user_label_access x where x.user_id = ${userParam} and x.label_id = any(a.label_ids))
  or exists (select 1 from user_artist_access x join credits c on c.artist_id = x.artist_id
             where x.user_id = ${userParam} and c.label_id = any(a.label_ids))
)`;
