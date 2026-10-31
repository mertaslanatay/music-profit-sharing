import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { queryOne } from "@/lib/db";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";
import { currentViewer } from "@/lib/session";
import { VIEW_AS_COOKIE, VIEW_AS_MAX_AGE, isUuid } from "@/lib/viewAs";

export const runtime = "nodejs";

/**
 * Sanatçı gözüyle önizleme — başlat (POST) / bitir (DELETE).
 * Güvenlik modeli için bkz. src/lib/viewAs.ts.
 *
 * Bu rota middleware'in "önizlemede yazma yok" kuralından muaftır; aksi
 * hâlde önizlemeden çıkmak da engellenirdi.
 */

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin("view_as_denied");
    const body = (await req.json().catch(() => ({}))) as { artistId?: unknown };
    if (!isUuid(body.artistId)) {
      return NextResponse.json({ error: "Geçersiz sanatçı." }, { status: 400 });
    }
    const artist = await queryOne<{ id: string; display_name: string }>(
      `select id, display_name from artists where id = $1::uuid`, [body.artistId]
    );
    if (!artist) return NextResponse.json({ error: "Sanatçı bulunamadı." }, { status: 404 });

    (await cookies()).set(VIEW_AS_COOKIE, artist.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: VIEW_AS_MAX_AGE,
    });
    await logAction(admin, "view_as_start", `artist:${artist.id}`, { artistName: artist.display_name });
    return NextResponse.json({ ok: true, artistName: artist.display_name });
  } catch (e) {
    return denyResponse(e);
  }
}

export async function DELETE() {
  // Çerezi silmek her zaman güvenli — yetki gerekmez. Kaydı ise yalnızca
  // oturum varsa yazarız.
  const jar = await cookies();
  const had = jar.get(VIEW_AS_COOKIE)?.value ?? null;
  jar.delete(VIEW_AS_COOKIE);
  if (had) {
    const v = await currentViewer().catch(() => null);
    if (v) await logAction(v, "view_as_end", `artist:${had}`).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
