import { NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";

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
}

export async function GET() {
  try {
    const admin = await requireAdmin("announcements_list_denied");
    const rows = await query<{
      id: string; title: string; body: string;
      published_at: string | null; created_at: string; read_count: number;
    }>(
      `select a.id, a.title, a.body, a.published_at, a.created_at,
              (select count(*) from announcement_reads r where r.announcement_id = a.id)::int read_count
       from announcements a
       order by coalesce(a.published_at, a.created_at) desc`
    );
    await logAction(admin, "announcements_list", null, { count: rows.length });
    return NextResponse.json({
      announcements: rows.map((r) => ({
        id: r.id, title: r.title, body: r.body,
        publishedAt: r.published_at, createdAt: r.created_at, readCount: r.read_count,
      })),
    });
  } catch (e) {
    return denyResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin("announcement_create_denied");
    const b = await req.json().catch(() => ({}));

    const title = typeof b.title === "string" ? b.title.trim().slice(0, 160) : "";
    const body = typeof b.body === "string" ? b.body.trim().slice(0, 4000) : "";
    const publish = b.publish === true;

    if (!title) return NextResponse.json({ error: "Başlık zorunlu." }, { status: 400 });

    const row = await queryOne<{ id: string }>(
      `insert into announcements (title, body, published_at, created_by)
       values ($1,$2,${publish ? "now()" : "null"},$3) returning id`,
      [title, body, admin?.userId ?? null]
    );

    await logAction(admin, publish ? "announcement_published" : "announcement_created",
      `announcement:${row?.id}`, { title });
    return NextResponse.json({ ok: true, id: row?.id });
  } catch (e) {
    return denyResponse(e);
  }
}
