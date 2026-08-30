import { NextResponse } from "next/server";
import * as crypto from "node:crypto";
import * as XLSX from "xlsx";
import { readWorkbook, toRows } from "@/lib/parse";
import { missingRequired } from "@/lib/columns";
import { ingestReport } from "@/lib/ingest";
import { getActiveRules } from "@/lib/rules";
import { listReports } from "@/lib/queries";
import { transaction, query } from "@/lib/db";
import { requireAdmin, denyResponse, logAction, Denied } from "@/lib/guard";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Rapor listesi (admin). */
export async function GET() {
  try {
    await requireAdmin("reports_list_denied");
    return NextResponse.json({ reports: await listReports() });
  } catch (e) {
    if (e instanceof Denied) return denyResponse(e);
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

/**
 * Yeni rapor yükle. Excel sunucuda ayrıştırılır, taslak olarak kaydedilir.
 * Taslak yayınlanana kadar kimse göremez — admin kontrol edip yayınlar.
 */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin("report_upload_denied");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
    }

    const title = String(form.get("title") ?? "").trim() || file.name.replace(/\.[^.]+$/, "");
    const deduction = Number(String(form.get("deduction") ?? "0").replace(",", ".")) || 0;
    if (deduction < 0) {
      return NextResponse.json({ error: "Kesinti negatif olamaz." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const hash = crypto.createHash("sha256").update(buf).digest("hex");

    // Aynı dosya daha önce yüklenmiş mi?
    const dup = await query<{ id: string; title: string; status: string }>(
      `select id, title, status from reports where file_hash = $1 limit 1`,
      [hash]
    );
    if (dup.length > 0 && form.get("force") !== "1") {
      return NextResponse.json(
        {
          error: "duplicate",
          message: `Bu dosya daha önce "${dup[0].title}" adıyla yüklenmiş (${statusTr(dup[0].status)}).`,
          existingId: dup[0].id,
        },
        { status: 409 }
      );
    }

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
    const result = await transaction((c) =>
      ingestReport(c, {
        title,
        fileName: file.name,
        fileHash: hash,
        deduction,
        rows,
        cfg: rules,
        notes: String(form.get("notes") ?? "") || null,
      })
    );
    await query(`update reports set rules_version = $2, uploaded_by = $3 where id = $1`, [
      result.reportId,
      rules.version,
      admin?.userId ?? null,
    ]);

    await logAction(admin, "report_uploaded", `report:${result.reportId}`, {
      title, fileName: file.name, rows: rows.length, deduction,
    });
    return NextResponse.json({ ok: true, report: result });
  } catch (e) {
    if (e instanceof Denied) return denyResponse(e);
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

function statusTr(s: string): string {
  return s === "published" ? "yayında" : s === "locked" ? "kilitli" : "taslak";
}

function msg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  // Bağlantı hatasını kullanıcıya anlaşılır çevir
  if (m.includes("ECONNREFUSED") || m.includes("EAI_AGAIN")) {
    return "Veritabanına bağlanılamadı. DATABASE_URL ayarını kontrol et.";
  }
  if (m.includes("DATABASE_URL")) return m;
  return `Sunucu hatası: ${m}`;
}
