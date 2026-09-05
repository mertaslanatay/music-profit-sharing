import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Duyuruyu düzenle / yayınla / yayından kaldır. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const admin = await requireAdmin("announcement_update_denied");
    const { id } = await params;
    const b = await req.json().catch(() => ({}));

    const sets: string[] = [];
    const vals: unknown[] = [id];

    if (typeof b.title === "string") {
      const t = b.title.trim().slice(0, 160);
      if (!t) return NextResponse.json({ error: "Başlık boş olamaz." }, { status: 400 });
      vals.push(t);
      sets.push(`title = $${vals.length}`);
    }
    if (typeof b.body === "string") {
      vals.push(b.body.trim().slice(0, 4000));
      sets.push(`body = $${vals.length}`);
    }
    if (typeof b.publish === "boolean") {
      // Yayınla: ilk yayın tarihini koru (tekrar yayınlamak tarihi ileri atmasın).
      sets.push(b.publish ? `published_at = coalesce(published_at, now())` : `published_at = null`);
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: "Değiştirilecek bir alan yok." }, { status: 400 });
    }
    sets.push(`updated_at = now()`);

    const row = await queryOne<{ id: string; title: string; published_at: string | null }>(
      `update announcements set ${sets.join(", ")} where id = $1
       returning id, title, published_at`,
      vals
    );
    if (!row) return NextResponse.json({ error: "Duyuru bulunamadı." }, { status: 404 });

    await logAction(admin, "announcement_updated", `announcement:${id}`, {
      title: row.title, published: !!row.published_at,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const admin = await requireAdmin("announcement_delete_denied");
    const { id } = await params;
    const row = await queryOne<{ title: string }>(
      `delete from announcements where id = $1 returning title`,
      [id]
    );
    if (!row) return NextResponse.json({ error: "Duyuru bulunamadı." }, { status: 404 });
    // announcement_reads cascade ile gider.
    await logAction(admin, "announcement_deleted", `announcement:${id}`, { title: row.title });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
