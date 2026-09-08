import { NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { requireViewer, denyResponse, logAction } from "@/lib/guard";
import { isAdmin } from "@/lib/access";
import { countryByCode, normalizePhoneDigits, isValidPhoneDigits } from "@/lib/countries";

export const runtime = "nodejs";

/**
 * Kendi hesap ayarların — telefon numarası ve e-posta bildirim tercihleri
 * (/hesabim § İletişim Tercihleri). Herkes yalnızca KENDİ satırını okur/
 * yazar; artistId/userId body'den değil oturumdan (requireViewer) gelir.
 */

interface AccountRow {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
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
      `select first_name, last_name, email,
              phone, phone_country,
              notify_email_support, notify_email_payout, notify_email_announcement
       from users where id = $1`,
      [viewer.userId]
    );
    return NextResponse.json({
      firstName: row?.first_name ?? "",
      lastName: row?.last_name ?? "",
      // E-posta yalnızca GÖSTERİLİR. Değiştirilmesi kimlik doğrulama
      // kaydını da ilgilendirdiği için buradan yapılmaz.
      email: row?.email ?? "",
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

    // Ad-soyad: YALNIZCA yöneticiler kendi adlarını düzenleyebilir.
    //
    // Neden kısıtlı: denetim kaydı (auditQueries.ts) ve destek arama
    // (support.ts) kullanıcı adını audit satırına kopyalamaz, users tablosuna
    // CANLI join yapar. Herkes kendi adını serbestçe değiştirebilseydi, bir
    // sanatçı adını "Mert Aslanatay" yapıp geçmişte KENDİ ürettiği tüm denetim
    // kayıtlarının yönetici adıyla görünmesini sağlayabilirdi. İstenen özellik
    // zaten "yönetici kendi bilgilerini girsin" idi; yüzeyi oraya sabitliyoruz.
    //
    // E-posta bilinçli olarak DIŞARIDA — onu değiştirmek Supabase Auth
    // kaydını da değiştirmeyi gerektirir, bu ekranın işi değil.
    let adDegisti: { onceki: string; yeni: string } | null = null;
    if (typeof b.firstName === "string" || typeof b.lastName === "string") {
      if (!isAdmin(viewer)) {
        return NextResponse.json(
          { error: "Ad ve soyadını buradan değiştiremezsin." },
          { status: 403 }
        );
      }
      const mevcut = await queryOne<{ first_name: string; last_name: string }>(
        `select first_name, last_name from users where id = $1`,
        [viewer.userId]
      );
      const ad = typeof b.firstName === "string" ? b.firstName.trim().slice(0, 80) : null;
      const soyad = typeof b.lastName === "string" ? b.lastName.trim().slice(0, 80) : null;
      if ((ad !== null && !ad) || (soyad !== null && !soyad)) {
        return NextResponse.json({ error: "Ad ve soyad boş olamaz." }, { status: 400 });
      }
      if (ad !== null) { vals.push(ad); sets.push(`first_name = $${vals.length}`); }
      if (soyad !== null) { vals.push(soyad); sets.push(`last_name = $${vals.length}`); }
      adDegisti = {
        onceki: `${mevcut?.first_name ?? ""} ${mevcut?.last_name ?? ""}`.trim(),
        yeni: `${ad ?? mevcut?.first_name ?? ""} ${soyad ?? mevcut?.last_name ?? ""}`.trim(),
      };
    }

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
         returning first_name, last_name, email, phone, phone_country,
                   notify_email_support, notify_email_payout, notify_email_announcement`,
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

    // İsim değişikliği ayrı bir eylem olarak ve ÖNCE/SONRA değeriyle
    // kaydediliyor — denetim kaydı canlı join yaptığı için, adın ne zaman
    // neden değiştiğinin izi başka türlü kalmazdı.
    if (adDegisti && (adDegisti.onceki !== adDegisti.yeni)) {
      await logAction(viewer, "account_name_updated", `user:${viewer.userId}`, adDegisti);
    }
    await logAction(viewer, "account_contact_updated", `user:${viewer.userId}`);
    return NextResponse.json({
      ok: true,
      firstName: updated?.first_name ?? "",
      lastName: updated?.last_name ?? "",
      email: updated?.email ?? "",
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
