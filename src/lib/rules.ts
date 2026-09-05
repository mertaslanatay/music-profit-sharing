import { query, transaction } from "./db";
import { activeSeparators } from "./separators";
import { DEFAULT_CONFIG, type EngineConfig, type Separator } from "./types";

/**
 * Aktif hesaplama kuralları. Yükleme sırasında bu kurallar uygulanır.
 * Kurallar değişince geçmiş raporların yeniden hesaplanması Faz C'de gelecek —
 * şimdilik değişiklik yalnızca sonraki yüklemeleri etkiler.
 */
export interface ActiveRules extends EngineConfig {
  version: number;
  /**
   * Yöneticinin tanımladığı ayrıştırma belirteçleri (yalnızca aktif olanlar).
   * `split` bayrakları geriye dönük uyumluluk için duruyor; ayrıştırma artık
   * bu listeden yapılır.
   */
  separators: Separator[];
}

export async function getActiveRules(): Promise<ActiveRules> {
  const rows = await query<{
    version: number;
    split: EngineConfig["split"];
    aliases: EngineConfig["aliases"];
    overrides: EngineConfig["overrides"];
  }>(`select version, split, aliases, overrides from engine_rules where is_active limit 1`);

  const separators = await activeSeparators();

  if (rows.length === 0) {
    // İlk çalıştırmada varsayılan kural setini kur.
    const created = await transaction(async (c) => {
      const r = await c.query<{ version: number }>(
        `insert into engine_rules (version, split, aliases, overrides, is_active)
         values (1, $1, '{}'::jsonb, '{}'::jsonb, true)
         returning version`,
        [JSON.stringify(DEFAULT_CONFIG.split)]
      );
      return r.rows[0].version;
    });
    return { ...DEFAULT_CONFIG, version: created, separators };
  }

  const r = rows[0];
  return {
    split: { ...DEFAULT_CONFIG.split, ...(r.split ?? {}) },
    aliases: r.aliases ?? {},
    overrides: r.overrides ?? {},
    received: null,
    version: r.version,
    separators,
  };
}
