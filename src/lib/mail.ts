/**
 * Uygulamadan gönderilen e-postalar (M4NM Pulse § 7).
 *
 * Bugüne kadar TÜM e-postalar Supabase Auth şablonlarından gidiyordu
 * (doğrulama, şifre sıfırlama). Ama "hesabın onaylandı" gibi e-postaları
 * Supabase göndermez — onları uygulamanın kendisi göndermek zorunda.
 *
 * Resend'in HTTP API'si doğrudan fetch ile çağrılıyor; ek bir paket
 * kurmuyoruz (alan adı m4nm.net zaten Resend'de doğrulanmış durumda).
 *
 * TASARIM KURALI: E-posta gönderimi hiçbir zaman asıl işlemi düşürmez.
 * Anahtar tanımlı değilse veya Resend hata verirse, işlem (ör. kullanıcı
 * onayı) yine de tamamlanır; sadece log ve denetim kaydına düşer. Aksi hâlde
 * bir e-posta sağlayıcısı arızası yönetim panelini çalışmaz hâle getirirdi.
 */

const ENDPOINT = "https://api.resend.com/emails";

const KEY = () => process.env.RESEND_API_KEY ?? "";
const FROM = () => process.env.MAIL_FROM || "M4NM Pulse <bildirim@m4nm.net>";
const SITE = () => process.env.NEXT_PUBLIC_SITE_URL || "https://label.m4nm.net";

export const mailConfigured = (): boolean => !!KEY();

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  /** Düz metin karşılığı; verilmezse HTML'den kaba bir metin üretilir. */
  text?: string;
  replyTo?: string;
}

export interface MailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/** Kullanıcıdan gelen metni HTML gövdesine gömmeden önce kaçırır. */
export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const stripHtml = (html: string) =>
  html.replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

export async function sendMail(input: MailInput): Promise<MailResult> {
  if (!mailConfigured()) {
    console.warn("[mail] RESEND_API_KEY tanımlı değil — e-posta gönderilmedi:", input.subject);
    return { ok: false, error: "E-posta gönderimi yapılandırılmamış (RESEND_API_KEY yok)." };
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM(),
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text ?? stripHtml(input.html),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
      // Sunucusuz ortamda asılı kalmasın.
      signal: AbortSignal.timeout(10_000),
    });

    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      const msg = json.message || `Resend ${res.status}`;
      console.error("[mail] gönderilemedi:", msg);
      return { ok: false, error: msg };
    }
    return { ok: true, id: json.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "bilinmeyen hata";
    console.error("[mail] gönderilemedi:", msg);
    return { ok: false, error: msg };
  }
}

/* ------------------------------------------------------------- şablonlar */

/**
 * Ortak e-posta iskeleti — marka rengi (#0E8C4B), açık gri zemin, beyaz kart.
 * Tüm stiller satır içi: e-posta istemcilerinin çoğu <style> bloğunu atar.
 */
export function mailLayout(opts: {
  heading: string;
  intro: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footnote?: string;
  preheader?: string;
}): string {
  const { heading, intro, ctaLabel, ctaUrl, footnote, preheader } = opts;
  return `<div style="background-color:#F1F3F5;padding:32px 16px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>` : ""}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;">
    <tr>
      <td style="padding-bottom:24px;text-align:center;">
        <span style="font-size:15px;font-weight:700;letter-spacing:0.02em;color:#0F1720;">M4NM</span>
        <span style="font-size:15px;font-weight:400;color:#64748B;"> Pulse</span>
      </td>
    </tr>
    <tr>
      <td style="background-color:#FFFFFF;border:1px solid #E8ECEF;border-radius:18px;padding:40px 36px;">
        <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0F1720;font-weight:700;">${heading}</h1>
        <p style="margin:0 0 ${ctaUrl ? "28px" : "0"};font-size:14.5px;line-height:1.6;color:#33414F;">${intro}</p>
        ${ctaUrl && ctaLabel ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 ${footnote ? "28px" : "0"};">
          <tr>
            <td style="border-radius:10px;background-color:#0E8C4B;">
              <a href="${ctaUrl}" style="display:inline-block;padding:13px 28px;font-size:14.5px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">${ctaLabel}</a>
            </td>
          </tr>
        </table>` : ""}
        ${footnote ? `<p style="margin:0;font-size:13px;line-height:1.6;color:#8A97A6;">${footnote}</p>` : ""}
      </td>
    </tr>
    <tr>
      <td style="padding-top:24px;text-align:center;">
        <p style="margin:0;font-size:12px;line-height:1.6;color:#8A97A6;">M4NM Pulse — sanatçı hakediş ve ödeme paneli</p>
      </td>
    </tr>
  </table>
</div>`;
}

/**
 * "Hesabın onaylandı" e-postası.
 *
 * Ton: kurumsal ama sistem e-postası gibi değil — modern bir music-tech
 * platformunun dili (şartname § 7).
 */
export async function sendApprovalMail(to: string, firstName?: string | null): Promise<MailResult> {
  const ad = esc((firstName ?? "").trim().slice(0, 80));
  const html = mailLayout({
    preheader: "Hesabın onaylandı — M4NM Pulse'a giriş yapabilirsin.",
    heading: "Aramıza hoş geldin.",
    intro:
      `${ad ? `${ad}, h` : "H"}esabın Label ekibi tarafından onaylandı. ` +
      "Artık M4NM Pulse üzerinden yayınlarını, performansını, hakedişlerini " +
      "ve ödeme geçmişini takip edebilirsin.",
    ctaLabel: "M4NM Pulse'a git",
    ctaUrl: `${SITE()}/giris`,
    footnote:
      "Giriş yaparken kayıt olurken kullandığın e-posta ve şifreyi kullan. " +
      "Şifreni hatırlamıyorsan giriş ekranındaki “Şifremi unuttum” bağlantısı işini görür.",
  });

  return sendMail({
    to,
    subject: "Hesabın onaylandı — M4NM Pulse",
    html,
  });
}
