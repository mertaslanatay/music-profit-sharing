import { Pool, type PoolClient } from "pg";

/**
 * Postgres bağlantı havuzu.
 *
 * Geliştirmede yerel Postgres, üretimde Supabase — ikisi de aynı sürüm ailesi.
 * Supabase'de connection pooler (port 6543) kullanılır; DATABASE_URL bunu içerir.
 *
 * ---------------------------------------------------------------------------
 * 7 Eyl 2026 — "timeout exceeded when trying to connect" arızasının çözümü
 * ---------------------------------------------------------------------------
 * Üretimde ana sayfa bu hatayla düşüyordu. Mesaj yanıltıcıdır: node-postgres
 * hem "sunucuya ulaşılamadı" hem de "havuzdan sıra gelmedi" durumunda AYNI
 * metni verir. Gerçek Postgres üzerinde 390.000 satırlık veriyle yeniden
 * üretildi ve nedenin İKİNCİSİ olduğu kanıtlandı:
 *
 *   - Tek bir gösterge paneli yüklemesi (loadResult) ~23 sorguyu PARALEL atar.
 *   - Havuzda sunucusuz ortamda yalnızca 3 bağlantı vardı.
 *   - Aynı sunucusuz örneğe düşen 3 eşzamanlı istek = 69 sorgu / 3 bağlantı.
 *   - Kuyrukta bekleyen sorgular connectionTimeoutMillis (10 sn) sınırını aştı
 *     ve 69 sorgunun 12-17'si bu hatayla düştü. (Ölçüm: 3 bağlantı ile 10,2 sn
 *     sonunda 12 başarısız sorgu — üstelik ağ gecikmesi OLMAYAN yerel makinede.)
 *
 * Üç ayrı düzeltme yapıldı:
 *
 *   1. HAVUZ BOYUTU artık bağlantı tipine göre belirleniyor. Supabase'in
 *      transaction pooler'ı (6543) zaten çok sayıda istemci bağlantısını az
 *      sayıda sunucu bağlantısına çoğullamak için vardır; oraya 3 bağlantıyla
 *      bağlanmak kendi ayağımıza sıkmaktı. Doğrudan bağlantıda (5432) ise
 *      sunucunun sabit bir bağlantı kotası olduğu için ölçülü davranılıyor.
 *
 *   2. KAPI (gate): kendi paralelliğimiz artık havuz boyutuyla sınırlı. Fazla
 *      sorgular pg'nin 10 saniyelik ZAMAN AŞIMLI kuyruğunda değil, JavaScript
 *      tarafında ZAMAN AŞIMSIZ bekliyor. Böylece connectionTimeoutMillis
 *      yalnızca GERÇEK bağlantı kurma sorunlarında devreye girer — kendi
 *      yığdığımız iş yüzünden bir daha asla tetiklenemez. Bu, arızanın
 *      yapısal olarak kapatılmasıdır: havuzu büyütmek tek başına aynı sorunu
 *      daha yüksek bir eşiğe taşırdı, kapı ise eşiği tamamen ortadan kaldırır.
 *
 *   3. HATA MESAJI artık iki durumu ayırt ediyor ve havuzun o anki durumunu
 *      (kaç açık / kaç boşta / kaç bekliyor) yazıyor — teşhis için.
 */
declare global {
  // eslint-disable-next-line no-var
  var __m4nmPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __m4nmGate: Gate | undefined;
  // eslint-disable-next-line no-var
  var __m4nmMax: number | undefined;
}

/**
 * Basit sayaç kapısı (semaphore).
 *
 * Zaman aşımı YOKTUR — bu bilinçlidir. Bekleyen iş burada sırasını bekler;
 * isteğin toplam süresini zaten Vercel'in kendi fonksiyon zaman aşımı
 * sınırlar. Amaç, pg havuzunun zaman aşımlı kuyruğuna hiç girmemek.
 *
 * KİLİTLENME (deadlock) GÜVENLİĞİ: her iş birimi TEK izin alır — query() bir,
 * transaction() bir. transaction() içindeki sorgular doğrudan client üzerinden
 * (c.query) gider, yeniden izin istemez. Dolayısıyla izin tutarken ikinci bir
 * izin bekleyen hiçbir yol yoktur. (Kod tabanı bu kurala uygunluk açısından
 * tarandı: transaction() geri çağrımlarının içinde query()/queryOne() çağrısı
 * bulunmuyor. Yeni kod yazarken bu kurala uyulmalı.)
 */
class Gate {
  private permits: number;
  private queue: Array<{ resolve: () => void; reject: (e: Error) => void; timer: NodeJS.Timeout }> = [];

  constructor(n: number) {
    this.permits = n;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits -= 1;
      return;
    }
    // ZAMAN AŞIMI NEDEN VAR: ilk sürümde kapı sınırsız bekliyordu. O hâliyle
    // veritabanı yavaşladığında sorgular sonsuza kadar sırada bekliyor,
    // isteği Vercel'in KENDİ fonksiyon zaman aşımı öldürüyordu — ve o
    // durumda kullanıcı okunabilir bir mesaj değil, yine opak bir
    // "Application error ... Digest" ekranı görüyordu. Artık kapı, platform
    // bizi öldürmeden ÖNCE anlaşılır bir hatayla vazgeçiyor.
    await new Promise<void>((resolve, reject) => {
      const entry = {
        resolve,
        reject,
        timer: setTimeout(() => {
          const i = this.queue.indexOf(entry);
          if (i >= 0) this.queue.splice(i, 1);
          reject(
            new Error(
              `Veritabanı sırası ${Math.round(GATE_WAIT_MS / 1000)} saniyede açılmadı ` +
                `(${this.queue.length + 1} iş bekliyordu). Veritabanı şu an çok yavaş ` +
                `ya da yanıt vermiyor.`
            )
          );
        }, GATE_WAIT_MS),
      };
      this.queue.push(entry);
    });
  }

  release(): void {
    const next = this.queue.shift();
    // İzni doğrudan sıradakine devret — sayacı artırıp tekrar azaltmak
    // arada başka bir çağrının araya girmesine (starvation) yol açardı.
    if (next) {
      clearTimeout(next.timer);
      next.resolve();
    } else {
      this.permits += 1;
    }
  }

  get waiting(): number {
    return this.queue.length;
  }
}

/**
 * Kapıda en fazla ne kadar beklenir. Vercel fonksiyon bütçesinin (page.tsx'te
 * maxDuration = 30 sn) ALTINDA olmalı ki hata bize düşsün, platforma değil.
 */
const GATE_WAIT_MS = Number(process.env.DB_GATE_WAIT_MS ?? 20_000);

/**
 * Havuz boyutu.
 *
 * Supabase transaction pooler'ı (host'ta "pooler." ya da port 6543) çok sayıda
 * istemci bağlantısını kaldırmak için tasarlanmıştır; orada cömert olabiliriz.
 * Doğrudan bağlantıda (5432) sunucunun kotası sabittir — ölçülü davranıyoruz.
 */
function poolMax(connectionString: string, serverless: boolean): number {
  if (!serverless) return 8; // tek süreçli sunucu / yerel geliştirme
  const pooled =
    /pooler\./i.test(connectionString) || /:6543(?:[/?]|$)/.test(connectionString);
  return pooled ? 12 : 5;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL tanımlı değil. .env.local dosyasına Supabase bağlantı adresini ekle."
    );
  }
  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  // Sertifika doğrulaması varsayılan olarak AÇIK — Supabase genel-güvenilir bir CA
  // kullanıyor, doğrulamayı kapatmak bağlantıyı ortadaki-adam saldırısına karşı
  // savunmasız bırakır. Sadece bağlantı gerçekten kopuyorsa (ör. host'un TLS zinciri
  // farklı davranıyorsa) DATABASE_SSL_INSECURE=1 ile geçici olarak eskisi gibi
  // (doğrulamasız) çalıştırılabilir — kod değişikliği/yeniden build gerekmeden.
  const insecure = process.env.DATABASE_SSL_INSECURE === "1";
  const serverless = !!process.env.VERCEL;
  const max = poolMax(connectionString, serverless);
  global.__m4nmMax = max;

  const p = new Pool({
    connectionString,
    max,
    idleTimeoutMillis: serverless ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    // Uzun süre boşta kalan TCP bağlantılarının aradaki ağ ekipmanı tarafından
    // sessizce düşürülmesini engeller — aksi hâlde ilk sorgu ölü bir soketle
    // karşılaşıp zaman aşımına düşer.
    keepAlive: true,
    // Supabase TLS ister; yerel geliştirmede kapalı.
    ssl: isLocal ? undefined : { rejectUnauthorized: !insecure },
  });

  // Boştaki bir bağlantı sunucu tarafında düşerse pg 'error' olayı yayar.
  // Bu olayın dinleyicisi YOKSA Node süreci komple çöker (unhandled 'error').
  // Sunucusuz ortamda bu, o örneğe düşen TÜM istekleri düşürür.
  p.on("error", (err) => {
    console.error("[db] boştaki bağlantı hatası (havuz kendini toparlayacak):", err.message);
  });

  return p;
}

export function pool(): Pool {
  if (!global.__m4nmPool) global.__m4nmPool = createPool();
  return global.__m4nmPool;
}

function gate(): Gate {
  if (!global.__m4nmGate) {
    pool(); // __m4nmMax'i doldurur
    global.__m4nmGate = new Gate(global.__m4nmMax ?? 8);
  }
  return global.__m4nmGate;
}

/**
 * pg'nin "timeout exceeded when trying to connect" mesajı iki FARKLI arızayı
 * aynı metinle anlatır. Hangisi olduğunu havuzun o anki durumundan anlayıp
 * mesajı okunabilir hâle getiriyoruz — bu ayrım olmadan üretimdeki arızayı
 * teşhis etmek günler almıştı.
 */
function enrich(e: unknown): unknown {
  if (!(e instanceof Error)) return e;
  if (!/timeout exceeded when trying to connect/i.test(e.message)) return e;

  const p = global.__m4nmPool;
  const max = global.__m4nmMax ?? 0;
  if (!p) return e;

  const saturated = p.waitingCount > 0 || p.totalCount >= max;
  const durum = `havuz: ${p.totalCount}/${max} açık, ${p.idleCount} boşta, ${p.waitingCount} bekliyor`;

  e.message = saturated
    ? `Veritabanı havuzu doldu (${durum}). Eşzamanlı sorgu sayısı bağlantı ` +
      `sayısını aştı; sorgular sıra beklerken zaman aşımına uğradı.`
    : `Veritabanı sunucusuna ulaşılamadı (${durum}). DATABASE_URL adresini ve ` +
      `Supabase projesinin ayakta olduğunu kontrol et.`;
  return e;
}

/**
 * Yavaş sorgu günlüğü — VARSAYILAN KAPALI.
 *
 * DB_LOG_SLOW_MS=500 gibi bir değer verilirse, o eşiği aşan her sorgu
 * süresiyle birlikte loglanır. Üretimde "hangi sorgu yavaş" sorusunu
 * tahminle değil ölçümle cevaplamak için var: Vercel > Logs ekranında
 * "[db] yavaş sorgu" diye aratmak yeterli.
 */
const LOG_SLOW_MS = Number(process.env.DB_LOG_SLOW_MS ?? 0);

function logSlow(text: string, ms: number): void {
  if (!LOG_SLOW_MS || ms < LOG_SLOW_MS) return;
  const tek = text.replace(/\s+/g, " ").trim().slice(0, 120);
  console.warn(`[db] yavaş sorgu ${ms}ms :: ${tek}`);
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const g = gate();
  await g.acquire();
  const t0 = LOG_SLOW_MS ? Date.now() : 0;
  try {
    const res = await pool().query(text, params);
    return res.rows as T[];
  } catch (e) {
    throw enrich(e);
  } finally {
    if (LOG_SLOW_MS) logSlow(text, Date.now() - t0);
    g.release();
  }
}

export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Bir işlemi tek transaction içinde çalıştırır; hata olursa geri alır. */
export async function transaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const g = gate();
  await g.acquire();
  let client: PoolClient;
  try {
    client = await pool().connect();
  } catch (e) {
    g.release();
    throw enrich(e);
  }

  // Bağlantı bozulduysa havuza GERİ VERİLMEMELİ. Eskiden bozuk bir bağlantı
  // havuza dönüyordu ve sıradaki isteği de düşürüyordu; 3 bağlantılı bir
  // havuzda üç bozuk bağlantı tüm örneği çalışamaz hâle getirebilirdi.
  let bozuk = false;
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    try {
      await client.query("rollback");
    } catch {
      // rollback bile başarısızsa bağlantı gerçekten bozuktur. ASIL hatayı
      // rollback hatasıyla değiştirmiyoruz — eskiden öyle oluyordu ve gerçek
      // sebep kayboluyordu.
      bozuk = true;
    }
    throw e;
  } finally {
    client.release(bozuk ? new Error("bozuk bağlantı havuzdan çıkarıldı") : undefined);
    g.release();
  }
}

/** numeric sütunları JS number'a çevirir (pg bunları string döndürür). */
export const n = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};
