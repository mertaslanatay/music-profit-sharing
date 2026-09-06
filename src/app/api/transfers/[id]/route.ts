import { NextResponse } from "next/server";
import { requireViewer, denyResponse, logAction } from "@/lib/guard";
import { isAdmin } from "@/lib/access";
import { queryOne } from "@/lib/db";
import { revertTransfer } from "@/lib/transfers";
import { notifyMany, adminUserIds, usersForArtist } from "@/lib/notify";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Devri geri al.
 *
 * Yetki: admin her devri; sanatçı yalnızca KENDİ payından yaptığı devri geri
 * alabilir (devralan geri alamaz — aldığı payı kendi iradesiyle iade etmesi
 * ayrı bir devir olurdu, sessizce silmek değil).
 */
export async function PATCH(_req: Request, { params }: Ctx) {
  try {
    const viewer = await requireViewer();
    const { id } = await params;

    const row = await queryOne<{
      from_artist_id: string; to_artist_id: string; status: string;
      song: string; period: string; from_name: string; to_name: string;
    }>(
      `select rt.from_artist_id, rt.to_artist_id, rt.status,
              s.title song, p.label period,
              fa.display_name from_name, ta.display_name to_name
       from revenue_transfers rt
       join songs s on s.id = rt.song_id
       join periods p on p.id = rt.period_id
       join artists fa on fa.id = rt.from_artist_id
       join artists ta on ta.id = rt.to_artist_id
       where rt.id = $1`,
      [id]
    );
    if (!row) return NextResponse.json({ error: "Devir kaydı bulunamadı." }, { status: 404 });

    const admin = viewer ? isAdmin(viewer) : true;
    if (viewer && !admin && !viewer.artistIds.includes(row.from_artist_id)) {
      await logAction(viewer, "transfer_revert_denied", `transfer:${id}`);
      return NextResponse.json(
        { error: "Yalnızca kendi yaptığın devri geri alabilirsin." },
        { status: 403 }
      );
    }

    const out = await revertTransfer(id, viewer?.userId ?? null);
    if (!out.ok) return NextResponse.json({ error: out.error }, { status: 400 });

    const govde =
      `${row.song} · ${row.period} — ${row.from_name} → ${row.to_name} devri geri alındı. ` +
      "Bu dönemin hakedişleri devir öncesi hâline döndü.";

    const hedef = [
      ...(await usersForArtist(row.from_artist_id)),
      ...(await usersForArtist(row.to_artist_id)),
    ];
    await notifyMany(hedef, {
      type: "revenue_transfer",
      title: "Gelir hakkı devri geri alındı",
      body: govde,
      resource: `transfer:${id}`,
      actionUrl: "/hesabim",
      createdBy: viewer?.userId ?? null,
    });
    if (!admin) {
      await notifyMany(await adminUserIds(), {
        type: "revenue_transfer",
        title: "Sanatçı gelir devrini geri aldı",
        body: govde,
        resource: `transfer:${id}`,
        actionUrl: "/admin",
        createdBy: viewer?.userId ?? null,
      });
    }

    await logAction(viewer, "revenue_transfer_reverted", `transfer:${id}`, {
      fromArtistId: row.from_artist_id, toArtistId: row.to_artist_id,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
