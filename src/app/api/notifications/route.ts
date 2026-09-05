import { NextResponse } from "next/server";
import { requireViewer, denyResponse } from "@/lib/guard";
import { inboxFor, markRead, markAllRead, markAnnouncementRead } from "@/lib/notify";

export const runtime = "nodejs";

/**
 * Kullanıcının kendi bildirim kutusu (M4NM Pulse § 1).
 *
 * Yetki basit ve kesin: herkes YALNIZCA kendi bildirimlerini görür ve
 * yalnızca kendi bildirimini okundu işaretleyebilir — kullanıcı kimliği
 * istekten değil oturumdan gelir, bu yüzden başkasının kutusuna erişim
 * mümkün değil.
 */

export async function GET() {
  try {
    const viewer = await requireViewer();
    if (!viewer) return NextResponse.json({ notifications: [], announcements: [], unread: 0, unreadAnnouncements: 0 });
    const inbox = await inboxFor(viewer.userId);
    return NextResponse.json(inbox);
  } catch (e) {
    return denyResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const viewer = await requireViewer();
    if (!viewer) return NextResponse.json({ ok: true });
    const body = await req.json().catch(() => ({}));

    if (body.all === true) {
      await markAllRead(viewer.userId);
    } else if (typeof body.id === "string") {
      if (body.kind === "announcement") {
        await markAnnouncementRead(viewer.userId, body.id);
      } else {
        await markRead(viewer.userId, body.id);
      }
    } else {
      return NextResponse.json({ error: "Ne okundu işaretlenecek?" }, { status: 400 });
    }

    const inbox = await inboxFor(viewer.userId);
    return NextResponse.json({ ok: true, ...inbox });
  } catch (e) {
    return denyResponse(e);
  }
}
