import { NextResponse } from "next/server";
import * as crypto from "node:crypto";
import * as XLSX from "@e965/xlsx";
import { readWorkbook, toRows } from "@/lib/parse";
import { missingRequired, FIELDS } from "@/lib/columns";
import { flattenCredits } from "@/lib/ingest";
import { splitArtists } from "@/lib/artists";
import { getActiveRules } from "@/lib/rules";
import { periodDisplay } from "@/lib/period";
import { query } from "@/lib/db";
import { requireAdmin, denyResponse, Denied } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Yüklemeden ÖNCE önizleme (v2 şartnamesi § 4.2, madde 3-4):
 *   "Önizleme: kaç satır, kaç sanatçı, toplam brüt — kaydetmeden önce"
 *   "Aynı dönem daha önce yüklendiyse uyarı"
 *
 * Bu uç hiçbir şey YAZMAZ — yalnızca aynı ayrıştırma/bölüşüm mantığını
 * (ingest.ts'teki flattenCredits) çalıştırıp sonucu döner. Gerçek kayıt hâlâ
 * POST /api/reports üzerinden olur; admin önizlemeyi görüp onayladığında o uç
 * çağrılır. İki uç aynı kodu kullandığı için önizleme ile gerçek sonuç asla
 * birbirinden sapmaz.
 */
export async function POST(req: Request) {
  try {
    await requireAdmin("report_preview_denied");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const hash = crypto.createHash("sha256").update(buf).digest("hex");

    let parsed;
    try {
      parsed = readWorkbook(XLSX.read(buf, { type: "buffer" }), file.name);
    } catch {
      return NextResponse.json(
        { error: "Dosya okunamadı. Excel (.xlsx/.xls) veya CSV olduğundan emin ol." },
        { status: 400 }
      );
    }

    const missing = missingRequired(parsed.map);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: "columns",
          message: `Zorunlu sütun bulunamadı: ${missing.map((m) => m.label).join(", ")}.`,
          headers: parsed.headers,
        },
        { status: 400 }
      );
    }

    const rows = toRows(parsed, parsed.map);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Dosyada veri satırı yok." }, { status: 400 });
    }

    const rules = await getActiveRules();
    const flat = flattenCredits(rows, rules);

    // Kolon eşleşmesi — hangi başlık hangi alana gitti (admin gözden geçirsin).
    const mapping = FIELDS.map((f) => ({
      key: f.key,
      label: f.label,
      required: f.required,
      header: parsed.map[f.key] !== undefined ? parsed.headers[parsed.map[f.key]!] : null,
    }));

    // Dönem bazında kırılım.
    const perPeriod = new Map<string, { gross: number; rowCount: number }>();
    for (const r of rows) {
      const k = r.period || "—";
      const cur = perPeriod.get(k) ?? { gross: 0, rowCount: 0 };
      cur.gross += Number(r.net) || 0;
      cur.rowCount += 1;
      perPeriod.set(k, cur);
    }

    // Bu dosyadaki dönemleri kapsayan mevcut raporlar var mı? (yazma yok,
    // yalnızca okuma — "periods" tablosu daha önce hiç kullanılmamış bir
    // etiket için boş dönebilir, bu normaldir.)
    const labels = Array.from(perPeriod.keys());
    const existing = labels.length
      ? await query<{ label: string; id: string; title: string; status: string; gross: string }>(
          `select p.label, r.id, r.title, r.status, r.gross
             from periods p
             join report_periods rp on rp.period_id = p.id
             join reports r on r.id = rp.report_id
            where p.label = any($1::text[])
            order by r.created_at desc`,
          [labels]
        )
      : [];
    const existingByLabel = new Map<string, typeof existing>();
    for (const e of existing) {
      const list = existingByLabel.get(e.label) ?? [];
      list.push(e);
      existingByLabel.set(e.label, list);
    }

    const periods = Array.from(perPeriod.entries())
      .map(([label, v]) => {
        const p = flat.periods.get(label)!;
        return {
          label,
          display: periodDisplay(p),
          sort: p.sort,
          gross: v.gross,
          rowCount: v.rowCount,
          existingReports: (existingByLabel.get(label) ?? []).map((e) => ({
            id: e.id,
            title: e.title,
            status: e.status,
            gross: Number(e.gross),
          })),
        };
      })
      .sort((a, b) => b.sort - a.sort);

    // Aynı dosya (byte-birebir) daha önce yüklenmiş mi?
    const dup = await query<{ id: string; title: string; status: string }>(
      `select id, title, status from reports where file_hash = $1 limit 1`,
      [hash]
    );

    // Sanatçı ayrıştırmasının doğru göründüğünü kanıtlamak için küçük örnek.
    const sample = rows.slice(0, 5).map((r) => ({
      artist: r.artist,
      parts: splitArtists(r.artist, rules.separators ?? rules.split),
      song: r.song || r.album || "—",
      period: r.period,
      net: r.net,
    }));

    return NextResponse.json({
      ok: true,
      mapping,
      rowCount: rows.length,
      negativeRows: flat.totals.negativeRows,
      gross: flat.totals.gross,
      artistCount: flat.artistNames.size,
      songCount: flat.songs.size,
      labelCount: flat.labels.size,
      periods,
      sample,
      duplicateFile: dup.length > 0 ? { id: dup[0].id, title: dup[0].title, status: dup[0].status } : null,
    });
  } catch (e) {
    if (e instanceof Denied) return denyResponse(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Önizleme başarısız." },
      { status: 500 }
    );
  }
}
