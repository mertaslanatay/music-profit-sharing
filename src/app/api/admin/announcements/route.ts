import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireStaff, denyResponse, logAction } from "@/lib/guard";
import { announcementLabelsReady } from "@/lib/schema";
import { emailAnnouncement } from "@/lib/mail";

export const runtime = "nodejs";

/**
 * Ürün duyuruları / What's New (M4NM Pulse § 1) — yalnızca admin yazar.
 *
 * Duyurular kullanıcı başına çoğaltılmaz: tek satır yazılır, herkes görür,
 * okundu bilgisi announcement_reads tablosunda tutulur (bkz. 0007).
 */

export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  publishedAt: string | null;
  createdAt: string;
  readCount: number;
  /** Boş = herkese; dolu = yalnızca bu label'ların kullanıcılarına. */
  labelIds: string[];
}

export async function GET() {
  try {
    const st = await requireStaff("announcements_list_denied");
    const admin = st.viewer;
    const ready = await announcementLabelsReady();
    // Label yöneticisi yalnızca KENDİ label'larına hedeflenmiş duyuruları
    // görür ve düzenler; herkese açık (yönetici) duyurular listede yok.
    if (st.labelIds && !ready) return NextResponse.json({ announcements: [] });
    const rows = await query<{
      id: string; title: string; body: string;
      published_at: string | null; created_at: string; read_count: number; label_ids: string[] | null;
    }>(
      `select a.id, a.title, a.body, a.published_at, a.created_at,
              ${ready ? "a.label_ids" : "'{}'::uuid[] label_ids"},
              (select count(*) from announcement_reads r where r.announcement_id = a.id)::int read_count
       from announcements a
       ${st.labelIds ? "where a.label_ids <> '{}' and a.label_ids <@ $1::uuid[]" : ""}
       order by coalesce(a.published_at, a.created_at) desc`,
      st.labelIds ? [st.labelIds] : []
    );
    await logAction(admin, "announcements_list", null, { count: rows.length });
    return NextResponse.json({
      announcements: rows.map((r) => ({
        id: r.id, title: r.title, body: r.body,
        publishedAt: r.published_at, createdAt: r.created_at, readCount: r.read_count,
        labelIds: r.label_ids ?? [],
      })),
    });
  } catch (e) {
    return denyResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const st = await requireStaff("announcement_create_denied");
    const admin = st.viewer;
    const b = await req.json().catch(() => ({}));
    // Label yöneticisinin duyurusu her zaman yalnızca kendi label'larına.
    const ready = await announcementLabelsReady();
    if (st.labelIds && !ready) {
      return NextResponse.json({ error: "Label'a özel duyuru henüz kurulmadı." }, { status: 503 });
    }
    const labelIds = st.labelIds ?? [];

    const title = typeof b.title === "string" ? b.title.trim().slice(0, 160) : "";
    const body = typeof b.body === "string" ? b.body.trim().slice(0, 4000) : "";
    const publish = b.publish === true;

    if (!title) return NextResponse.json({ error: "Başlık zorunlu." }, { status: 400 });

    const row = ready
      ? await queryOne<{ id: string }>(
          `insert into announcements (title, body, published_at, created_by, label_ids)
           values ($1,$2,${publish ? "now()" : "null"},$3,$4::uuid[]) returning id`,
          [title, body, admin?.userId ?? null, labelIds]
        )
      : await queryOne<{ id: string }>(
          `insert into announcements (title, body, published_at, created_by)
           values ($1,$2,${publish ? "now()" : "null"},$3) returning id`,
          [title, body, admin?.userId ?? null]
        );

    await logAction(admin, publish ? "announcement_published" : "announcement_created",
      `announcement:${row?.id}`, { title, labelIds });
    if (publish) await emailAnnouncement(title, body, admin?.userId ?? null, labelIds);
    return NextResponse.json({ ok: true, id: row?.id });
  } catch (e) {
    return denyResponse(e);
  }
}
