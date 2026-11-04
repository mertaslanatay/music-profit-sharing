import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { requireStaff, denyResponse, logAction, type StaffCtx } from "@/lib/guard";
import { announcementLabelsReady } from "@/lib/schema";
import { emailAnnouncement } from "@/lib/mail";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Label yöneticisi yalnızca kendi label'larına hedeflenmiş duyuruya dokunur.
 * Döner: duyurunun hedef label'ları (e-posta için) ya da null (yetki yok /
 * bulunamadı — ikisi ayırt edilmez).
 */
async function allowed(st: StaffCtx, id: string): Promise<string[] | null> {
  const ready = await announcementLabelsReady();
  if (!ready) return st.labelIds ? null : [];
  const r = await queryOne<{ label_ids: string[] }>(`select label_ids from announcements where id = $1`, [id]);
  if (!r) return null;
  const ids = r.label_ids ?? [];
  if (!st.labelIds) return ids;
  const mine = new Set(st.labelIds);
  return ids.length > 0 && ids.every((x) => mine.has(x)) ? ids : null;
}

/** Duyuruyu düzenle / yayınla / yayından kaldır. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const st = await requireStaff("announcement_update_denied");
    const admin = st.viewer;
    const { id } = await params;
    const b = await req.json().catch(() => ({}));
    const hedef = await allowed(st, id);
    if (hedef === null) return NextResponse.json({ error: "Duyuru bulunamadı." }, { status: 404 });

    // Yayınlama e-postasını yalnızca YAYINSIZ → YAYINDA geçişinde göndermek
    // için, güncellemeden önceki durumu ayrıca çekiyoruz.
    const before = await queryOne<{ published_at: string | null }>(
      `select published_at from announcements where id = $1`, [id]
    );
    if (!before) return NextResponse.json({ error: "Duyuru bulunamadı." }, { status: 404 });

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

    const row = await queryOne<{ id: string; title: string; body: string; published_at: string | null }>(
      `update announcements set ${sets.join(", ")} where id = $1
       returning id, title, body, published_at`,
      vals
    );
    if (!row) return NextResponse.json({ error: "Duyuru bulunamadı." }, { status: 404 });

    await logAction(admin, "announcement_updated", `announcement:${id}`, {
      title: row.title, published: !!row.published_at,
    });

    // İlk yayınlamada e-posta gider; zaten yayındaki bir duyuru metni
    // düzeltilip tekrar publish:true gönderilirse ikinci kez gitmez.
    if (b.publish === true && !before.published_at && row.published_at) {
      await emailAnnouncement(row.title, row.body, admin?.userId ?? null, hedef);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const st = await requireStaff("announcement_delete_denied");
    const admin = st.viewer;
    const { id } = await params;
    if ((await allowed(st, id)) === null) return NextResponse.json({ error: "Duyuru bulunamadı." }, { status: 404 });
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
