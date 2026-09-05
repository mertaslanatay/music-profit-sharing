import { Pool, type PoolClient } from "pg";

/**
 * Postgres bağlantı havuzu.
 *
 * Geliştirmede yerel Postgres, üretimde Supabase — ikisi de aynı sürüm ailesi.
 * Supabase'de connection pooler (port 6543) kullanılır; DATABASE_URL bunu içerir.
 */
declare global {
  // eslint-disable-next-line no-var
  var __m4nmPool: Pool | undefined;
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
  // Vercel'de her sunucusuz (serverless) örnek KENDİ havuzunu açar; aynı anda
  // onlarca örnek çalışabildiği için örnek başına havuzu küçük tutuyoruz —
  // aksi hâlde Supabase pooler'ın bağlantı kotası (ücretsiz planda 60) tükenir
  // ve istekler "too many connections" ile düşer. Tek süreçli bir sunucuda
  // (kendi sunucumuz / yerel geliştirme) ise daha geniş havuz mantıklı.
  const serverless = !!process.env.VERCEL;
  return new Pool({
    connectionString,
    max: serverless ? 3 : 8,
    idleTimeoutMillis: serverless ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    // Supabase TLS ister; yerel geliştirmede kapalı.
    ssl: isLocal ? undefined : { rejectUnauthorized: !insecure },
  });
}

export function pool(): Pool {
  if (!global.__m4nmPool) global.__m4nmPool = createPool();
  return global.__m4nmPool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const res = await pool().query(text, params);
  return res.rows as T[];
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
  const client = await pool().connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

/** numeric sütunları JS number'a çevirir (pg bunları string döndürür). */
export const n = (v: unknown): number => {
  if (v === null || v === undefined) return 0;
  const x = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};
