import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

export const runtime = "nodejs";

type Status = "draft" | "published" | "locked";

/** Rapor durumu değiştir: taslak → yayında → kilitli. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
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

    const updated = await queryOne(`select * from reports where id = $1`, [id]);
    return NextResponse.json({ ok: true, report: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bilinmeyen hata" },
      { status: 500 }
    );
  }
}

/** Rapor sil — yalnızca taslak. Yayında veya kilitli rapor silinemez. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
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
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Bilinmeyen hata" },
      { status: 500 }
    );
  }
}
