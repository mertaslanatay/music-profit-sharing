import { NextResponse } from "next/server";
import { requireViewer, denyResponse, logAction } from "@/lib/guard";
import { isAdmin } from "@/lib/access";
import { queryOne } from "@/lib/db";
import { createTransfer, listTransfers } from "@/lib/transfers";
import { notify, notifyMany, adminUserIds, usersForArtist } from "@/lib/notify";
import { money } from "@/lib/format";

export const runtime = "nodejs";

/** Devir listesi — kendi sanatçılarıyla ilgili olanlar; admin hepsini görür. */
export async function GET(req: Request) {
  try {
    const viewer = await requireViewer();
    const url = new URL(req.url);
    const songId = url.searchParams.get("songId") ?? undefined;
    const reportId = url.searchParams.get("reportId") ?? undefined;

    if (!viewer || isAdmin(viewer)) {
      return NextResponse.json({ transfers: await listTransfers({ songId, reportId }) });
    }
    // Kısıtlı kullanıcı: yalnızca kendi sanatçılarının dahil olduğu devirler.
    const mine = new Set(viewer.artistIds);
    const all = await listTransfers({ songId, reportId, limit: 200 });
    return NextResponse.json({
      transfers: all.filter((t) => mine.has(t.fromArtistId) || mine.has(t.toArtistId)),
    });
  } catch (e) {
    return denyResponse(e);
  }
}

/**
 * Gelir hakkı devri oluştur (M4NM Pulse § 2).
 *
 * YETKİ — burada bilinçli olarak canAccessArtist() KULLANILMIYOR. O fonksiyon
 * "görebilir mi" sorusunu yanıtlar ve label geneline yetkilendirilmiş bir
 * sanatçı için tüm sanatçılara true döner; devir ise "sahibi mi" sorusudur.
 * Kullanıcı yalnızca KENDİSİNE ATANMIŞ (user_artist_access) bir sanatçının
 * payını devredebilir. Admin herkes adına yapabilir.
 */
export async function POST(req: Request) {
  try {
    const viewer = await requireViewer();
    const b = await req.json().catch(() => ({}));

    const reportId = String(b.reportId ?? "");
    const periodId = String(b.periodId ?? "");
    const songId = String(b.songId ?? "");
    const fromArtistId = String(b.fromArtistId ?? "");
    const toArtistId = String(b.toArtistId ?? "");
    const ratio = Number(b.ratio);

    if (!reportId || !periodId || !songId || !fromArtistId || !toArtistId) {
      return NextResponse.json({ error: "Eksik bilgi." }, { status: 400 });
    }

    const admin = viewer ? isAdmin(viewer) : true;
    if (viewer && !admin && !viewer.artistIds.includes(fromArtistId)) {
      await logAction(viewer, "transfer_create_denied", `artist:${fromArtistId}`, {
        songId, periodId,
      });
      return NextResponse.json(
        { error: "Yalnızca kendi gelir payını devredebilirsin." },
        { status: 403 }
      );
    }

    const out = await createTransfer({
      reportId, periodId, songId, fromArtistId, toArtistId, ratio,
      note: typeof b.note === "string" ? b.note.slice(0, 500) : null,
      createdBy: viewer?.userId ?? null,
    });
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });

    // --- bildirim metni için isimler --------------------------------------
    const meta = await queryOne<{
      song: string; period: string; from_name: string; to_name: string;
    }>(
      `select s.title song, p.label period,
              fa.display_name from_name, ta.display_name to_name
       from songs s, periods p, artists fa, artists ta
       where s.id = $1 and p.id = $2 and fa.id = $3 and ta.id = $4`,
      [songId, periodId, fromArtistId, toArtistId]
    );

    const yuzde = `%${(ratio * 100).toFixed(ratio * 100 % 1 === 0 ? 0 : 1)}`;
    const tutar = out.amount ? ` (${money(out.amount)})` : "";
    const govde =
      `${meta?.song ?? "Şarkı"} · ${meta?.period ?? "dönem"} — ` +
      `${meta?.from_name ?? "sanatçı"} payının ${yuzde}'ini ` +
      `${meta?.to_name ?? "sanatçı"} adına devretti${tutar}.`;

    if (admin) {
      // Admin yaptıysa: işlemden etkilenen sanatçıların ikisine de haber ver.
      const hedef = [
        ...(await usersForArtist(fromArtistId)),
        ...(await usersForArtist(toArtistId)),
      ];
      await notifyMany(hedef, {
        type: "revenue_transfer",
        title: "Gelir hakkı devri yapıldı",
        body: govde,
        resource: `transfer:${out.id}`,
        actionUrl: "/?v=songs",
        createdBy: viewer?.userId ?? null,
      });
    } else {
      // Sanatçı yaptıysa: Label yönetimine haber ver.
      await notifyMany(await adminUserIds(), {
        type: "revenue_transfer",
        title: "Sanatçı gelir hakkı devretti",
        body: govde,
        resource: `transfer:${out.id}`,
        actionUrl: "/admin",
        createdBy: viewer?.userId ?? null,
      });
      // Devralan da bilmeli.
      for (const uid of await usersForArtist(toArtistId)) {
        await notify({
          userId: uid,
          type: "revenue_transfer",
          title: "Sana gelir hakkı devredildi",
          body: govde,
          resource: `transfer:${out.id}`,
          actionUrl: "/hesabim",
          createdBy: viewer?.userId ?? null,
        });
      }
    }

    await logAction(viewer, "revenue_transfer_created", `transfer:${out.id}`, {
      songId, periodId, reportId, fromArtistId, toArtistId, ratio, amount: out.amount ?? null,
    });

    return NextResponse.json({ ok: true, id: out.id, amount: out.amount });
  } catch (e) {
    return denyResponse(e);
  }
}
