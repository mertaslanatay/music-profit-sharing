import { NextResponse } from "next/server";
import { requireViewer, denyResponse, logAction } from "@/lib/guard";
import { isAdmin } from "@/lib/access";
import { rateLimit } from "@/lib/access";
import { listThreads, createThread, type ThreadStatus } from "@/lib/support";
import { notifyMany, adminUserIds } from "@/lib/notify";

export const runtime = "nodejs";

/** Basit UUID biçim kontrolü — bozuk kimlik 500 yerine temiz 400/404 versin. */
const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);


/**
 * İletişim merkezi — konuşma listesi (M4NM Pulse § 9).
 *
 * Sanatçı yalnızca KENDİ konuşmalarını görür; kimlik oturumdan gelir, bu
 * yüzden istek gövdesiyle başkasının kutusuna bakmak mümkün değildir.
 * Yönetici tüm konuşmaları görür, kullanıcıya ve duruma göre süzebilir.
 */
export async function GET(req: Request) {
  try {
    const viewer = await requireViewer();
    const url = new URL(req.url);
    const rawStatus = url.searchParams.get("status") ?? "all";
    const status = (["open", "answered", "closed", "all"].includes(rawStatus)
      ? rawStatus
      : "all") as ThreadStatus | "all";
    const q = url.searchParams.get("q") ?? undefined;
    // Yönetici süzgeci: bozuk bir kimlik Postgres'te cast hatası verip 500
    // olmasın diye biçim kontrolünden geçirilir.
    const rawUserId = url.searchParams.get("userId");
    const userId = rawUserId && isUuid(rawUserId) ? rawUserId : undefined;

    const admin = viewer ? isAdmin(viewer) : true;

    const threads = await listThreads(
      admin
        ? { side: "admin", status, q, userId }
        : { side: "user", status, q, ownerId: viewer!.userId }
    );

    return NextResponse.json({ threads, isAdmin: admin });
  } catch (e) {
    return denyResponse(e);
  }
}

/**
 * Yeni talep aç.
 *
 * Yalnızca kullanıcı tarafı açar — yönetici bir sanatçı adına konuşma
 * başlatmaz (o zaman "kimin talebi" belirsizleşirdi); yönetici mevcut bir
 * konuşmaya cevap yazar.
 */
export async function POST(req: Request) {
  try {
    const viewer = await requireViewer();
    if (!viewer) {
      return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });
    }

    // Talebi SANATÇI açar. Yönetici bir sanatçı adına konuşma başlatmaz —
    // aksi hâlde "kimin talebi" belirsizleşir ve yönetici kendi kendine
    // bildirim gönderirdi. Yönetici mevcut konuşmalara cevap yazar.
    if (isAdmin(viewer)) {
      return NextResponse.json(
        { error: "Yönetici hesabı talep açmaz; mevcut konuşmalara cevap yazabilirsin." },
        { status: 400 }
      );
    }

    const b = await req.json().catch(() => ({}));
    const subject = typeof b.subject === "string" ? b.subject.trim().slice(0, 160) : "";
    const body = typeof b.body === "string" ? b.body.trim().slice(0, 8000) : "";

    if (!subject) return NextResponse.json({ error: "Konu zorunlu." }, { status: 400 });
    if (!body) return NextResponse.json({ error: "Mesaj boş olamaz." }, { status: 400 });

    // Kötüye kullanıma karşı: saatte 10 yeni talep.
    const rl = await rateLimit(`support:${viewer.userId}`, 10, 3600);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Çok fazla talep açtın. Biraz sonra tekrar dene." },
        { status: 429 }
      );
    }

    const { id, error } = await createThread({
      userId: viewer.userId,
      userName: viewer.fullName,
      subject,
      body,
    });
    if (error || !id) {
      return NextResponse.json({ error: error ?? "Talep oluşturulamadı." }, { status: 503 });
    }

    await notifyMany(await adminUserIds(), {
      type: "message",
      title: "Yeni destek mesajı",
      body: `${viewer.fullName}: ${subject}`,
      resource: `thread:${id}`,
      actionUrl: "/admin",
      createdBy: viewer.userId,
    });

    await logAction(viewer, "support_thread_created", `thread:${id}`, { subject });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return denyResponse(e);
  }
}
