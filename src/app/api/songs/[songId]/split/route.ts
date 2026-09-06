import { NextResponse } from "next/server";
import { requireViewer, denyResponse, logAction } from "@/lib/guard";
import { isAdmin } from "@/lib/access";
import { songSplitsReady } from "@/lib/schema";
import {
  songSplitDetail,
  labelArtistsForSong,
  canViewSongSplit,
  canEditSongSplit,
  setSongSplit,
} from "@/lib/songSplits";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ songId: string }> };

/**
 * Bir şarkının KALICI bölüşüm detayı — dönem/rapor bağımsız (Şarkılar
 * ekranındaki her satır için, hiçbir ödeme partisi seçili olmasa bile
 * çalışır; bkz. src/lib/transfers.ts'teki dönem bazlı devir akışından farkı).
 *
 * Yetki: admin her şarkıyı görür. Label yöneticisi/muhasebeci kendi
 * label'ına ait şarkıları görür. Sanatçı yalnızca kendi rosterunda geçtiği
 * şarkıları görür (redactForViewer ile aynı "önce hesapla, sonra süz" ilkesi).
 */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireViewer();
    const { songId } = await params;

    if (!(await songSplitsReady())) {
      return NextResponse.json(
        { error: "Bölüşüm düzenleme altyapısı henüz kurulmadı (0013 migration'ı çalıştırılmalı)." },
        { status: 503 }
      );
    }

    const detail = await songSplitDetail(songId);
    if (!detail) return NextResponse.json({ error: "Şarkı bulunamadı." }, { status: 404 });

    const rosterIds = detail.roster.map((r) => r.artistId);
    if (!(await canViewSongSplit(viewer, songId, rosterIds))) {
      await logAction(viewer, "song_split_view_denied", `song:${songId}`);
      return NextResponse.json({ error: "Bu şarkıyı görme yetkin yok." }, { status: 403 });
    }

    const canEdit = await canEditSongSplit(viewer, songId, detail.primaryArtistId);
    const labelArtists = canEdit ? await labelArtistsForSong(songId) : [];

    return NextResponse.json({
      detail,
      canEdit,
      isAdmin: viewer ? isAdmin(viewer) : true,
      labelArtists,
    });
  } catch (e) {
    return denyResponse(e);
  }
}

/**
 * Bölüşümü kalıcı olarak değiştirir.
 *
 * Gövde: { roster: { artistId: string; share: number }[] } — toplamı 1
 * olmalı. Yetki kontrolü GET ile aynı canEditSongSplit üzerinden yapılır;
 * asıl yazma + tüm iş kuralları (kilitli dönem dokunulmaz, ödenmiş tutarın
 * altına düşürülemez, aktif devri olan çıkarılamaz) src/lib/songSplits.ts'te.
 */
export async function POST(req: Request, { params }: Ctx) {
  try {
    const viewer = await requireViewer();
    const { songId } = await params;

    if (!(await songSplitsReady())) {
      return NextResponse.json(
        { error: "Bölüşüm düzenleme altyapısı henüz kurulmadı (0013 migration'ı çalıştırılmalı)." },
        { status: 503 }
      );
    }

    const detail = await songSplitDetail(songId);
    if (!detail) return NextResponse.json({ error: "Şarkı bulunamadı." }, { status: 404 });

    if (!(await canEditSongSplit(viewer, songId, detail.primaryArtistId))) {
      await logAction(viewer, "song_split_edit_denied", `song:${songId}`);
      return NextResponse.json({ error: "Bu şarkının bölüşümünü düzenleme yetkin yok." }, { status: 403 });
    }

    const b = await req.json().catch(() => ({}));
    // reset:true -> özel bölüşümü tamamen kaldır, credits türevi doğal
    // roster'a dön (bkz. setSongSplit'in roster:null dalı).
    const roster = b.reset === true
      ? null
      : Array.isArray(b.roster)
        ? b.roster
            .filter((r: unknown): r is { artistId: unknown; share: unknown } => !!r && typeof r === "object")
            .map((r: { artistId: unknown; share: unknown }) => ({
              artistId: String(r.artistId ?? ""),
              share: Number(r.share),
            }))
            .filter((r: { artistId: string; share: number }) => r.artistId)
        : [];

    const result = await setSongSplit({ songId, roster, updatedBy: viewer?.userId ?? null });
    if (!result.ok) {
      await logAction(viewer, "song_split_rejected", `song:${songId}`, { error: result.error });
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await logAction(viewer, "song_split_updated", `song:${songId}`, {
      affectedArtists: result.affectedArtistIds?.length ?? 0,
      affectedPeriods: result.affectedPeriodIds?.length ?? 0,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
