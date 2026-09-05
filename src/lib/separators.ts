import { query, queryOne } from "./db";
import { DEFAULT_SEPARATORS, type Separator, type SeparatorKind } from "./types";

/**
 * Sanatçı ayrıştırma belirteçleri — veri katmanı.
 *
 * Belirteçler yükleme (ingest) sırasında uygulanır. Bir belirteci değiştirmek
 * GEÇMİŞ raporları yeniden hesaplamaz; yalnızca bundan sonraki yüklemeleri
 * etkiler. (Geçmişi yeniden hesaplama Faz C'de gelecek — recalc_log iskeleti
 * bunun için duruyor.) Bu kısıt kullanıcıya arayüzde açıkça söylenir.
 */

interface Row {
  id: string;
  token: string;
  kind: SeparatorKind;
  is_active: boolean;
  sort: number;
}

const toSeparator = (r: Row): Separator => ({
  id: r.id,
  token: r.token,
  kind: r.kind,
  isActive: r.is_active,
  sort: r.sort,
});

/** Tablo henüz yoksa (migration çalışmadıysa) koddaki tohum listesine düşeriz. */
const fallback = (): Separator[] =>
  DEFAULT_SEPARATORS.map((s, i) => ({ ...s, id: `default-${i}` }));

/** Tüm belirteçler — yönetim ekranı için (pasif olanlar dâhil). */
export async function listSeparators(): Promise<Separator[]> {
  try {
    const rows = await query<Row>(
      `select id, token, kind, is_active, sort from artist_separators order by sort, token`
    );
    return rows.length ? rows.map(toSeparator) : fallback();
  } catch {
    return fallback();
  }
}

/** Ayrıştırmada kullanılacak liste. */
export async function activeSeparators(): Promise<Separator[]> {
  const all = await listSeparators();
  return all.filter((s) => s.isActive);
}

export interface SeparatorInput {
  token: string;
  kind: SeparatorKind;
  isActive: boolean;
  sort: number;
}

/** Girdi doğrulama — kabul edilebilir bir belirteç mi? */
export function separatorProblem(input: Partial<SeparatorInput>): string | null {
  const token = (input.token ?? "").trim();
  if (!token) return "Belirteç boş olamaz.";
  if (token.length > 24) return "Belirteç en fazla 24 karakter olabilir.";
  if (/\s/.test(token)) return "Belirteç boşluk içeremez.";
  if (input.kind && input.kind !== "word" && input.kind !== "symbol") {
    return "Belirteç türü 'word' veya 'symbol' olmalı.";
  }
  // Harf içeren bir belirteç "symbol" olarak tanımlanırsa isim içinde de
  // eşleşir ve sanatçı adlarını ortadan böler — bu neredeyse her zaman hatadır.
  if (input.kind === "symbol" && /[\p{L}]/u.test(token)) {
    return "Harf içeren belirteçler 'kelime' türünde olmalı — aksi hâlde isimlerin içinde de bölme yapar.";
  }
  if (input.sort !== undefined && (!Number.isFinite(input.sort) || input.sort < 0 || input.sort > 9999)) {
    return "Sıra 0 ile 9999 arasında olmalı.";
  }
  return null;
}

export async function createSeparator(
  input: SeparatorInput,
  userId: string | null
): Promise<Separator | null> {
  const row = await queryOne<Row>(
    `insert into artist_separators (token, kind, is_active, sort, updated_by)
     values ($1,$2,$3,$4,$5)
     on conflict do nothing
     returning id, token, kind, is_active, sort`,
    [input.token.trim(), input.kind, input.isActive, input.sort, userId]
  );
  return row ? toSeparator(row) : null;
}

export async function updateSeparator(
  id: string,
  input: Partial<SeparatorInput>,
  userId: string | null
): Promise<Separator | null> {
  const row = await queryOne<Row>(
    `update artist_separators set
       token      = coalesce($2, token),
       kind       = coalesce($3, kind),
       is_active  = coalesce($4, is_active),
       sort       = coalesce($5, sort),
       updated_at = now(),
       updated_by = $6
     where id = $1
     returning id, token, kind, is_active, sort`,
    [
      id,
      input.token !== undefined ? input.token.trim() : null,
      input.kind ?? null,
      input.isActive ?? null,
      input.sort ?? null,
      userId,
    ]
  );
  return row ? toSeparator(row) : null;
}

export async function deleteSeparator(id: string): Promise<Separator | null> {
  const row = await queryOne<Row>(
    `delete from artist_separators where id = $1
     returning id, token, kind, is_active, sort`,
    [id]
  );
  return row ? toSeparator(row) : null;
}
