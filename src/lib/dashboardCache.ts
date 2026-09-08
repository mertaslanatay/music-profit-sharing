import { gunzipSync, gzipSync } from "node:zlib";

import { query } from "./db";
import type { Scope } from "./queries";

/**
 * Gösterge paneli sonucu için SÜRÜM KONTROLLÜ önbellek.
 *
 * NEDEN
 * -----
 * Ana sayfa her yüklemede ~23 ağır sorgu atıyor. Mert'in üretim ölçeğinin
 * birebir aynısı (242.424 satır / 58 MB) kurulup ölçüldü: tek yükleme
 * 4171 ms sürüyor — üstelik ağ gecikmesi OLMAYAN yerel bir makinede.
 * Supabase'de bunun 2-4 katı. Oysa bu veri NADİREN değişiyor (14 rapor,
 * ayda bir yükleme): aynı sonuç defalarca yeniden hesaplanıyor.
 *
 * NASIL — VE NEDEN BAYAT VERİ RİSKİ YOK
 * -------------------------------------
 * Klasik önbellekler "şu kadar saniye eski veri göster" der. Burada öyle bir
 * şey YOK. Veritabanında tek satırlık bir sürüm sayacı var (0015 migration);
 * panelin sonucunu etkileyen tablolardan herhangi birine yazıldığı ANDA
 * sayaç artıyor. Burada sonucu o sayaçla birlikte saklıyoruz ve her istekte
 * önce sayacı okuyoruz (tek satır, birincil anahtar araması). Sayaç
 * değiştiyse önbellek yok sayılır ve yeniden hesaplanır.
 *
 * Yani: bir rapor yayınlandığı anda panel yeni rakamları gösterir. Hız
 * kazanırken doğruluktan hiçbir şey verilmiyor.
 *
 * GÜVENLİK — EN KRİTİK NOKTA
 * --------------------------
 * Anahtar, kullanıcının YETKİ KAPSAMINI (access) içermek ZORUNDA. Aksi hâlde
 * bir sanatçının önbelleğe aldığı sonuç başka bir sanatçıya servis edilir ve
 * bu, uygulamanın tüm yetki süzmesini tek hamlede delerdi. Anahtar bu yüzden
 * labelIds/artistIds/denied değerlerini de içeriyor ve diziler SIRALANIYOR
 * (aynı yetki, farklı sırayla gelirse farklı anahtar üretmesin diye).
 *
 * İKİ KATMANLI
 * ------------
 * 1. Bellek (süreç başına)  -> isabet ederse ~5 ms.
 * 2. Veritabanı (paylaşımlı) -> soğuk başlayan bir örnek için ~100 ms.
 *
 * İkinci katman şart: Vercel'de her sunucusuz örneğin kendi belleği vardır ve
 * düşük trafikte çoğu istek soğuk bir örneğe düşer. Yalnızca bellek içi bir
 * önbellek bu durumda hiç işe yaramaz, kullanıcı 4 saniyeyi yine bekler.
 * Veritabanı katmanı sayesinde hesaplama, veri her değiştiğinde SADECE BİR KEZ
 * yapılır; sonrasında hangi örneğe düşerse düşsün hazır sonuç bulunur.
 *
 * Önbellek okuma/yazmadaki HER hata sessizce yutulur ve normal hesaplamaya
 * dönülür: önbellek bir hızlandırmadır, asla bir arıza kaynağı olmamalıdır.
 */

/** Sürüm sayacı tablosu var mı? (0015 çalıştırılmadıysa önbellek devre dışı.) */
let hazir: { ok: boolean; at: number } | null = null;
const HAZIR_RETRY_MS = 30_000;

async function versiyonHazir(): Promise<boolean> {
  const now = Date.now();
  if (hazir && (hazir.ok || now - hazir.at < HAZIR_RETRY_MS)) return hazir.ok;
  try {
    const rows = await query<{ t: string | null }>(
      `select to_regclass('public.data_version')::text as t`
    );
    hazir = { ok: !!rows[0]?.t, at: now };
  } catch {
    hazir = { ok: false, at: now };
  }
  return hazir.ok;
}

/** Veritabanındaki sürüm sayacı. Okunamazsa null (önbellek kullanılmaz). */
async function dataVersion(): Promise<string | null> {
  if (!(await versiyonHazir())) return null;
  try {
    const rows = await query<{ v: string }>(`select v::text as v from data_version where id = 1`);
    return rows[0]?.v ?? null;
  } catch {
    return null;
  }
}

/**
 * Kapsamdan KARARLI bir anahtar üretir.
 *
 * Diziler sıralanır: aynı yetkinin farklı sırayla gelmesi ayrı bir anahtar
 * (ve dolayısıyla gereksiz bir önbellek kaybı) üretmesin. undefined ile null
 * ayrı tutulur — access verilmemesi "kısıt yok" demektir ve bu, boş diziyle
 * ("hiçbir şey görme") ASLA aynı anahtara düşmemelidir.
 */
export function scopeKey(scope: Scope): string {
  const a = scope.access;
  return JSON.stringify({
    p: scope.periodIds ? [...scope.periodIds].sort() : null,
    r: scope.reportId ?? null,
    pub: scope.publishedOnly ?? null,
    acc: a
      ? {
          l: a.labelIds ? [...a.labelIds].sort() : null,
          ar: a.artistIds ? [...a.artistIds].sort() : null,
          d: a.denied,
        }
      : "yok",
  });
}

interface Kayit<T> {
  v: string;
  data: T;
  at: number;
}

const store = new Map<string, Kayit<unknown>>();
const MAX_KAYIT = 24;
/** Emniyet supabı: sürüm artışı bir şekilde kaçarsa kayıt yine de bayatlamaz. */
const TTL_MS = 10 * 60 * 1000;

/**
 * Sonucu sürüm kontrollü önbellekten döndürür; yoksa hesaplayıp saklar.
 * Sürüm okunamıyorsa (migration yok / hata) önbellek tamamen atlanır —
 * uygulama eskisi gibi çalışmaya devam eder.
 */
async function dbOku<T>(key: string, v: string): Promise<T | null> {
  try {
    const rows = await query<{ payload: Buffer }>(
      `select payload from dashboard_cache where key = $1 and v = $2::bigint`,
      [key, v]
    );
    const buf = rows[0]?.payload;
    if (!buf) return null;
    return JSON.parse(gunzipSync(buf).toString("utf8")) as T;
  } catch {
    return null; // önbellek asla arıza kaynağı olmamalı
  }
}

async function dbYaz<T>(key: string, v: string, data: T): Promise<void> {
  try {
    const gz = gzipSync(Buffer.from(JSON.stringify(data), "utf8"));
    await query(
      `insert into dashboard_cache (key, v, payload, at)
       values ($1, $2::bigint, $3, now())
       on conflict (key) do update
         set v = excluded.v, payload = excluded.payload, at = excluded.at`,
      [key, v, gz]
    );
  } catch {
    /* önbelleğe yazamamak bir hata değildir — sessizce geç */
  }
}

export async function cachedByVersion<T>(
  key: string,
  compute: () => Promise<T>
): Promise<T> {
  const v = await dataVersion();
  if (!v) return compute();

  // 1. katman: bellek
  const hit = store.get(key) as Kayit<T> | undefined;
  if (hit && hit.v === v && Date.now() - hit.at < TTL_MS) return hit.data;

  // 2. katman: veritabanı (soğuk başlayan örnekler için)
  const paylasimli = await dbOku<T>(key, v);
  if (paylasimli !== null) {
    belleğeYaz(key, v, paylasimli);
    return paylasimli;
  }

  const data = await compute();
  belleğeYaz(key, v, data);
  await dbYaz(key, v, data);
  return data;
}

function belleğeYaz<T>(key: string, v: string, data: T): void {
  store.set(key, { v, data, at: Date.now() });
  // En eski kaydı at — sunucusuz bir örnekte sınırsız büyümesin.
  if (store.size > MAX_KAYIT) {
    let enEski: string | null = null;
    let enEskiAt = Infinity;
    for (const [k, kayit] of store) {
      if (kayit.at < enEskiAt) {
        enEskiAt = kayit.at;
        enEski = k;
      }
    }
    if (enEski) store.delete(enEski);
  }
}

/** Testler için: önbelleği tamamen boşaltır. */
export function cacheReset(): void {
  store.clear();
  hazir = null;
}

/** Testler/teşhis için: önbellekteki kayıt sayısı. */
export function cacheSize(): number {
  return store.size;
}
