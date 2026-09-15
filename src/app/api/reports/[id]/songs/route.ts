import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireViewer, denyResponse } from "@/lib/guard";
import { scopeFor, accessSql } from "@/lib/access";

export const runtime = "nodejs";

/**
 * Bir ödeme partisinde kredisi olan şarkıların kimlikleri.
 *
 * Neden var: Şarkılar ekranındaki liste DÖNEM seçicisiyle süzülür, gelir devri
 * kapsamı ise ayrı bir ÖDEME PARTİSİ seçicisidir (bilinçli olarak bağımsız —
 * bkz. Dashboard.tsx'teki `tr` parametresi notu). İkisi örtüşmeyince tabloda,
 * seçili partide hiç kaydı olmayan şarkılar da görünüyordu; 🔀 simgesi yine de
 * çıktığı için kullanıcı tıklıyor, drawer açılıyor ve "bu şarkının seçili ödeme
 * partisinde kaydı yok" diyordu. Boşa tıklama. Artık istemci bu listeyi bir kez
 * çekip simgeyi yalnızca gerçekten devredilebilir şarkılarda gösteriyor.
 *
 * Süzgeç, devir drawer'ının kendi sorgusuyla AYNI olmalı ki simge ile drawer
 * hiç çelişmesin: o da ham `credits` üzerinde `song_id + report_id` bakıyor
 * (bkz. /api/songs/[songId]/transfer). Görünüm katmanı (v_credits_effective)
 * bilinçli olarak kullanılmıyor — devir satırlarının kendisi üyeliği
 * değiştirmemeli.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    // null yalnızca kimlik doğrulama hiç yapılandırılmamışken döner (yerel
    // geliştirme); o durumda kapsam kısıtı da uygulanmaz. Yetkisiz bir istek
    // buraya gelmez — requireViewer Denied fırlatır.
    const viewer = await requireViewer();

    const params: unknown[] = [id];
    const conditions = ["c.report_id = $1", "c.song_id is not null"];

    if (viewer) {
      const scope = scopeFor(viewer);
      const a = accessSql(scope, params.length, "c");
      conditions.push(...a.conditions);
      params.push(...a.params);
    }

    const rows = await query<{ song_id: string }>(
      `select distinct c.song_id from credits c where ${conditions.join(" and ")}`,
      params
    );

    return NextResponse.json({ songIds: rows.map((r) => r.song_id) });
  } catch (e) {
    return denyResponse(e);
  }
}
