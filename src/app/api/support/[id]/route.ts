import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { requireViewer, denyResponse, logAction } from "@/lib/guard";
import { isAdmin } from "@/lib/access";
import { getThread, addReply, setThreadStatus, threadOwner, type ThreadStatus } from "@/lib/support";
import { notify, notifyMany, adminUserIds } from "@/lib/notify";
import { mailConfigured, sendSupportReplyMail } from "@/lib/mail";

export const runtime = "nodejs";


/** Basit UUID biçim kontrolü — bozuk kimlik 500 yerine temiz 400/404 versin. */
const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

type Ctx = { params: Promise<{ id: string }> };

/** Konuşmayı aç — okuyan taraf için okundu işaretlenir. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const viewer = await requireViewer();
    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: "Konuşma bulunamadı." }, { status: 404 });

    const thread = await getThread(id, {
      userId: viewer?.userId ?? "",
      isAdmin: viewer ? isAdmin(viewer) : true,
    });
    // getThread, sahibi olmayan bir kullanıcı için null döner — "bulunamadı"
    // ile "yetkin yok" arasında ayrım yapmıyoruz ki konuşma kimliklerini
    // deneyerek varlık tespiti yapılamasın.
    if (!thread) {
      return NextResponse.json({ error: "Konuşma bulunamadı." }, { status: 404 });
    }
    return NextResponse.json({ thread });
  } catch (e) {
    return denyResponse(e);
  }
}

/** Konuşmaya cevap yaz. */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireViewer();
    if (!viewer) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: "Konuşma bulunamadı." }, { status: 404 });

    const b = await req.json().catch(() => ({}));
    const body = typeof b.body === "string" ? b.body.trim().slice(0, 8000) : "";
    if (!body) return NextResponse.json({ error: "Mesaj boş olamaz." }, { status: 400 });

    const owner = await threadOwner(id);
    if (!owner) return NextResponse.json({ error: "Konuşma bulunamadı." }, { status: 404 });

    // Mesajın hangi taraftan geldiği ROLE değil SAHİPLİĞE bakar: konuşmanın
    // sahibi her zaman "user" tarafıdır. Aksi hâlde bir yönetici kendi
    // konuşmasında "Label ekibi" gibi görünür ve kendi kendine bildirim
    // gönderirdi.
    const sahibi = owner.userId === viewer.userId;
    const admin = !sahibi && isAdmin(viewer);
    if (!sahibi && !isAdmin(viewer)) {
      await logAction(viewer, "support_reply_denied", `thread:${id}`);
      return NextResponse.json({ error: "Konuşma bulunamadı." }, { status: 404 });
    }

    const out = await addReply({
      threadId: id,
      senderId: viewer.userId,
      senderName: viewer.fullName,
      role: admin ? "admin" : "user",
      body,
    });
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });

    // Bildirim karşı tarafa gider.
    if (admin) {
      await notify({
        userId: owner.userId,
        type: "message",
        title: "Label ekibi mesajına cevap verdi",
        body: `${owner.subject} — ${body.slice(0, 160)}`,
        resource: `thread:${id}`,
        actionUrl: "/destek",
        createdBy: viewer.userId,
      });
      // E-posta yalnızca kullanıcı İletişim Tercihleri'nden açtıysa gider —
      // uygulama içi bildirim (yukarıda) her zaman gönderilir, bu yalnızca ek.
      if (mailConfigured()) {
        try {
          const pref = await queryOne<{ email: string; notify_email_support: boolean }>(
            `select email, notify_email_support from users where id = $1`, [owner.userId]
          );
          if (pref?.notify_email_support) await sendSupportReplyMail(pref.email, owner.subject, body);
        } catch { /* e-posta asıl işlemi düşürmez */ }
      }
    } else {
      // İşlemi yapan kişiye kendi mesajının bildirimi gitmez.
      const hedef = (await adminUserIds()).filter((uid) => uid !== viewer.userId);
      await notifyMany(hedef, {
        type: "message",
        title: "Destek konuşmasına yeni mesaj",
        body: `${viewer.fullName}: ${owner.subject}`,
        resource: `thread:${id}`,
        actionUrl: "/admin",
        createdBy: viewer.userId,
      });
    }

    await logAction(viewer, "support_reply", `thread:${id}`, { role: admin ? "admin" : "user" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}

/** Konuşmayı kapat / yeniden aç. İki taraf da yapabilir. */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireViewer();
    if (!viewer) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

    const { id } = await params;
    if (!isUuid(id)) return NextResponse.json({ error: "Konuşma bulunamadı." }, { status: 404 });

    const b = await req.json().catch(() => ({}));
    const status = b.status as ThreadStatus;
    if (!["open", "answered", "closed"].includes(status)) {
      return NextResponse.json({ error: "Geçersiz durum." }, { status: 400 });
    }

    const owner = await threadOwner(id);
    if (!owner) return NextResponse.json({ error: "Konuşma bulunamadı." }, { status: 404 });
    if (!isAdmin(viewer) && owner.userId !== viewer.userId) {
      await logAction(viewer, "support_status_denied", `thread:${id}`);
      return NextResponse.json({ error: "Konuşma bulunamadı." }, { status: 404 });
    }

    await setThreadStatus(id, status);
    await logAction(viewer, "support_status_changed", `thread:${id}`, { status });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
