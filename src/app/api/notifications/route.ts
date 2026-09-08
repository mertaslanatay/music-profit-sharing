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

export async function GET(req: Request) {
  try {
    const viewer = await requireViewer();
    if (!viewer) return NextResponse.json({ notifications: [], announcements: [], unread: 0, unreadAnnouncements: 0 });
    // Zil modalı varsayılanla yetinir; /bildirimler sayfası daha fazlasını
    // ister. Üst sınır bilinçli: sınırsız bir liste hem sorguyu hem de
    // taşınan JSON'u kontrolsüz büyütürdü.
    // DİKKAT: önce HAM string okunuyor. Number(null) === 0 ve
    // Number.isFinite(0) === true olduğu için, doğrudan Number()'a
    // geçirilseydi parametresiz istekler limit=1'e düşerdi — yani zil tek
    // bildirim gösterirdi.
    const ham = new URL(req.url).searchParams.get("limit");
    const sayi = ham === null || ham.trim() === "" ? NaN : Number(ham);
    // Math.trunc şart: kesirli bir değer (?limit=10.5) sorguya bigint
    // parametresi olarak gidip hata üretirdi.
    const limit = Number.isFinite(sayi) ? Math.trunc(Math.min(Math.max(sayi, 1), 200)) : 50;
    const inbox = await inboxFor(viewer.userId, limit);
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
