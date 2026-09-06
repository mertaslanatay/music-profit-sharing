import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { requireViewer, denyResponse, logAction } from "@/lib/guard";
import { countryByCode, normalizePhoneDigits, isValidPhoneDigits } from "@/lib/countries";

export const runtime = "nodejs";

/**
 * Kendi hesap ayarların — telefon numarası ve e-posta bildirim tercihleri
 * (/hesabim § İletişim Tercihleri). Herkes yalnızca KENDİ satırını okur/
 * yazar; artistId/userId body'den değil oturumdan (requireViewer) gelir.
 */

interface AccountRow {
  phone: string | null;
  phone_country: string | null;
  notify_email_support: boolean;
  notify_email_payout: boolean;
  notify_email_announcement: boolean;
}

export async function GET() {
  try {
    const viewer = await requireViewer();
    if (!viewer) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

    const row = await queryOne<AccountRow>(
      `select phone, phone_country, notify_email_support, notify_email_payout, notify_email_announcement
       from users where id = $1`,
      [viewer.userId]
    );
    return NextResponse.json({
      phone: row?.phone ?? "",
      phoneCountry: row?.phone_country ?? "TR",
      notifyEmailSupport: row?.notify_email_support ?? false,
      notifyEmailPayout: row?.notify_email_payout ?? false,
      notifyEmailAnnouncement: row?.notify_email_announcement ?? false,
    });
  } catch (e) {
    return denyResponse(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const viewer = await requireViewer();
    if (!viewer) return NextResponse.json({ error: "Oturum gerekli." }, { status: 401 });

    const b = await req.json().catch(() => ({}));
    const sets: string[] = [];
    const vals: unknown[] = [viewer.userId];

    // Telefon: gönderilmediyse dokunulmaz. Gönderildiyse (boş string dâhil)
    // güncellenir — kullanıcının numarasını silmesine izin vermek için.
    if (typeof b.phone === "string" || typeof b.phoneCountry === "string") {
      const digits = normalizePhoneDigits(typeof b.phone === "string" ? b.phone : "");
      const countryRaw = (typeof b.phoneCountry === "string" ? b.phoneCountry : "TR")
        .trim().slice(0, 2).toUpperCase();
      if (digits) {
        const country = countryByCode(countryRaw);
        if (!country) return NextResponse.json({ error: "Geçerli bir ülke seç." }, { status: 400 });
        if (!isValidPhoneDigits(digits)) {
          return NextResponse.json({ error: "Telefon numarasını kontrol et." }, { status: 400 });
        }
        vals.push(digits); sets.push(`phone = $${vals.length}`);
        vals.push(country.code); sets.push(`phone_country = $${vals.length}`);
      } else {
        sets.push(`phone = null`, `phone_country = null`);
      }
    }

    for (const [key, col] of [
      ["notifyEmailSupport", "notify_email_support"],
      ["notifyEmailPayout", "notify_email_payout"],
      ["notifyEmailAnnouncement", "notify_email_announcement"],
    ] as const) {
      if (typeof b[key] === "boolean") {
        vals.push(b[key]); sets.push(`${col} = $${vals.length}`);
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: "Değiştirilecek bir alan yok." }, { status: 400 });
    }

    let updated: AccountRow | null;
    try {
      updated = await queryOne<AccountRow>(
        `update users set ${sets.join(", ")} where id = $1
         returning phone, phone_country, notify_email_support, notify_email_payout, notify_email_announcement`,
        vals
      );
    } catch (e) {
      // 42703 = undefined_column — migration henüz Supabase'de çalışmadıysa
      // isteği kırma yerine "henüz kullanılamıyor" ile temiz cevap ver.
      const code = (e as { code?: string } | null)?.code;
      if (code === "42703") {
        return NextResponse.json(
          { error: "Bu özellik için gereken güncelleme henüz yayında değil. Birazdan tekrar dene." },
          { status: 503 }
        );
      }
      throw e;
    }

    await logAction(viewer, "account_contact_updated", `user:${viewer.userId}`);
    return NextResponse.json({
      ok: true,
      phone: updated?.phone ?? "",
      phoneCountry: updated?.phone_country ?? "TR",
      notifyEmailSupport: updated?.notify_email_support ?? false,
      notifyEmailPayout: updated?.notify_email_payout ?? false,
      notifyEmailAnnouncement: updated?.notify_email_announcement ?? false,
    });
  } catch (e) {
    return denyResponse(e);
  }
}
