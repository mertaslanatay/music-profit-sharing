import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";
import { notifyMany, usersInReport } from "@/lib/notify";

export const runtime = "nodejs";

type Status = "draft" | "published" | "locked";

/** Rapor durumu değiştir: taslak → yayında → kilitli. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const admin = await requireAdmin("report_patch_denied");
    const body = (await req.json()) as { status?: Status; deduction?: number };

    const current = await queryOne<{ status: Status; gross: string }>(
      `select status, gross from reports where id = $1`,
      [id]
    );
    if (!current) return NextResponse.json({ error: "Rapor bulunamadı." }, { status: 404 });

    // Kilitli rapor değişmez — ödemesi yapılmış dönemin geçmişi korunur.
    if (current.status === "locked") {
      return NextResponse.json(
        { error: "Bu rapor kilitli. Kilitli raporlar değiştirilemez." },
        { status: 409 }
      );
    }

    if (body.deduction !== undefined) {
      const d = Number(body.deduction);
      if (!Number.isFinite(d) || d < 0) {
        return NextResponse.json({ error: "Geçersiz kesinti tutarı." }, { status: 400 });
      }
      await query(
        `update reports set deduction = $2, received = gross - $2 where id = $1`,
        [id, d]
      );
    }

    if (body.status) {
      const stamp =
        body.status === "published"
          ? `, published_at = coalesce(published_at, now())`
          : body.status === "locked"
            ? `, locked_at = now()`
            : "";
      await query(`update reports set status = $2::report_status ${stamp} where id = $1`, [
        id,
        body.status,
      ]);
    }

    // Taslak → yayında geçişi, sanatçının hakedişinin görünür hâle geldiği
    // andır: ilgili sanatçılara bildirim gider. Yalnızca İLK yayınlamada —
    // zaten yayındaki bir raporun kesintisi düzeltilince tekrar bildirim
    // göndermek gürültü olurdu.
    if (body.status === "published" && current.status !== "published") {
      const report = await queryOne<{ title: string; file_name: string }>(
        `select title, file_name from reports where id = $1`, [id]
      );
      const adi = report?.title || report?.file_name || "Yeni ödeme partisi";
      const targets = await usersInReport(id);
      await notifyMany(targets, {
        type: "payment_batch",
        title: "Yeni ödeme partisi yayınlandı",
        body: `${adi} yayınlandı. Bu dönemdeki hakedişini panelinden görebilirsin.`,
        resource: `report:${id}`,
        actionUrl: "/?v=payouts",
        createdBy: admin?.userId ?? null,
      });
    }

    const updated = await queryOne(`select * from reports where id = $1`, [id]);
    await logAction(admin, "report_updated", `report:${id}`, {
      status: body.status ?? null, deduction: body.deduction ?? null, from: current.status,
    });
    return NextResponse.json({ ok: true, report: updated });
  } catch (e) {
    return denyResponse(e);
  }
}

/** Rapor sil — yalnızca taslak. Yayında veya kilitli rapor silinemez. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const admin = await requireAdmin("report_delete_denied");
    const current = await queryOne<{ status: Status }>(
      `select status from reports where id = $1`,
      [id]
    );
    if (!current) return NextResponse.json({ error: "Rapor bulunamadı." }, { status: 404 });
    if (current.status !== "draft") {
      return NextResponse.json(
        { error: "Yalnızca taslak raporlar silinebilir. Önce taslağa al." },
        { status: 409 }
      );
    }
    // credits ve report_rows cascade ile gider.
    await query(`delete from reports where id = $1`, [id]);
    await logAction(admin, "report_deleted", `report:${id}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
