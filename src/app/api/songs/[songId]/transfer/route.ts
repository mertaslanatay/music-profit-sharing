import { NextResponse } from "next/server";
import { requireViewer, denyResponse, logAction } from "@/lib/guard";
import { isAdmin } from "@/lib/access";
import { query } from "@/lib/db";
import { songPeriodDetail, redactForViewer, type SongPeriodDetail } from "@/lib/transfers";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ songId: string }> };

/**
 * Bir şarkının seçili ödeme partisindeki dönem dönem dağılımı + devir geçmişi.
 *
 * Bir rapor birden fazla dönem içerebildiği için (Q2 dosyasında P03+P04
 * birlikte) her dönem ayrı ayrı döner — devir her zaman TEK bir döneme aittir.
 *
 * Yetki: admin her şarkıyı görür. Diğer kullanıcılar yalnızca kendilerine
 * atanmış sanatçılardan biri şarkıda geçiyorsa görebilir.
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireViewer();
    const { songId } = await params;
    const url = new URL(req.url);
    const reportId = url.searchParams.get("reportId");
    if (!reportId) {
      return NextResponse.json({ error: "Ödeme partisi belirtilmedi." }, { status: 400 });
    }

    // Şarkının bu raporda kredisi olan dönemleri
    const periods = await query<{ period_id: string; label: string; sort: number }>(
      `select distinct c.period_id, p.label, p.sort
       from credits c join periods p on p.id = c.period_id
       where c.song_id = $1 and c.report_id = $2
       order by p.sort desc`,
      [songId, reportId]
    );

    if (periods.length === 0) {
      return NextResponse.json({ periods: [] });
    }

    const details = (
      await Promise.all(
        periods.map((p) => songPeriodDetail(songId, reportId, p.period_id))
      )
    ).filter((d): d is SongPeriodDetail => d !== null);

    // Yetki süzmesi. Sadece "erişebilir mi" yetmez: erişebilen kullanıcıya da
    // yalnızca görmeye yetkili olduğu kadarı gönderilir. Bu uygulamanın temel
    // kuralı, görmemesi gereken veriyi istemciye HİÇ göndermemektir — ekranda
    // gizlemek güvenlik sayılmaz.
    let payload = details;
    if (viewer && !isAdmin(viewer)) {
      payload = redactForViewer(details, viewer.artistIds, viewer.canSeeOtherArtists);
      if (payload.length === 0) {
        await logAction(viewer, "song_transfer_view_denied", `song:${songId}`);
        return NextResponse.json({ error: "Bu şarkıyı görme yetkin yok." }, { status: 403 });
      }
    }

    return NextResponse.json({
      periods: payload,
      // İstemci, devri kimin adına yapabileceğini bilmeli.
      canTransferFor: viewer ? (isAdmin(viewer) ? "all" : viewer.artistIds) : "all",
      isAdmin: viewer ? isAdmin(viewer) : true,
    });
  } catch (e) {
    return denyResponse(e);
  }
}
