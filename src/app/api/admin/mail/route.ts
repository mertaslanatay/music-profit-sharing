import { NextResponse } from "next/server";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";
import { mailConfigured, sendMail, mailLayout, esc } from "@/lib/mail";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * Admin serbest e-posta aracı — kayıtlı bir kullanıcıyı seçip veya elle bir
 * adres girip Label ekibi adına doğrudan e-posta gönderir. Destek konuşma
 * sisteminden (support_threads) BAĞIMSIZ: burada gönderilen bir yanıt
 * beklemez, tek yönlü bir bildirim/duyuru gibidir.
 */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin("admin_mail_denied");
    if (!mailConfigured()) {
      return NextResponse.json(
        { error: "E-posta gönderimi yapılandırılmamış (RESEND_API_KEY yok)." }, { status: 503 }
      );
    }

    const b = await req.json().catch(() => ({}));
    const to = typeof b.to === "string" ? b.to.trim().toLowerCase() : "";
    const subject = typeof b.subject === "string" ? b.subject.trim().slice(0, 160) : "";
    const message = typeof b.message === "string" ? b.message.trim().slice(0, 8000) : "";

    if (!EMAIL_RE.test(to)) return NextResponse.json({ error: "Geçerli bir e-posta adresi gir." }, { status: 400 });
    if (!subject) return NextResponse.json({ error: "Konu zorunlu." }, { status: 400 });
    if (!message) return NextResponse.json({ error: "Mesaj boş olamaz." }, { status: 400 });

    const html = mailLayout({
      preheader: esc(subject),
      heading: esc(subject),
      intro: esc(message).replace(/\n/g, "<br/>"),
      footnote: `${admin?.fullName ?? "Label ekibi"} tarafından M4NM Pulse üzerinden gönderildi.`,
    });

    const result = await sendMail({
      to, subject, html,
      replyTo: admin?.email,
    });
    if (!result.ok) {
      await logAction(admin, "admin_mail_failed", to, { subject, error: result.error });
      return NextResponse.json({ error: result.error || "E-posta gönderilemedi." }, { status: 502 });
    }

    await logAction(admin, "admin_mail_sent", to, { subject });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
