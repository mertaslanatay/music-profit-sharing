import { NextResponse } from "next/server";
import { getSession, requestMeta } from "@/lib/session";
import { authConfigured } from "@/lib/supabase/server";
import { audit, isAdmin, rateLimit } from "@/lib/access";
import { resolveViewAs } from "@/lib/viewAs";
import { scopeFingerprint } from "@/lib/scopePrint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Açık panelin oturum nöbeti (faz-z11).
 *
 * Sekme geçişleri artık sunucuya gitmediği için (faz-z10) oturum her
 * tıklamada yeniden doğrulanmıyordu: askıya alınan ya da yetkisi daraltılan
 * bir kullanıcı, sayfayı yenileyene kadar zaten yüklenmiş veriye bakmaya
 * devam edebiliyordu. Panel bu ucu birkaç dakikada bir, sekmeye geri
 * dönüldüğünde ve ekran değişiminde (seyreltilmiş) çağırır:
 *   - oturum yok / askıda / onaysız → 401/403 + gidilecek adres
 *   - yetkiler değişti → farklı parmak izi → panel sayfayı yeniler
 *
 * Önizleme ("Gözünden gör") açıksa parmak izi önizlenen sanatçınındır; çerez
 * süresi dolunca parmak izi yöneticiye döner ve panel kendiliğinden yenilenir.
 */
export async function GET() {
  if (!authConfigured()) return NextResponse.json({ ok: true, fp: "anon" });
  const { viewer, reason } = await getSession();
  if (!viewer) {
    return NextResponse.json(
      { ok: false, to: reason === "no-session" ? "/giris" : "/beklemede" },
      { status: reason === "no-session" ? 401 : 403 }
    );
  }
  const preview = await resolveViewAs(viewer);
  return NextResponse.json(
    { ok: true, fp: scopeFingerprint(preview?.viewer ?? viewer) },
    { headers: { "cache-control": "no-store" } }
  );
}

const VIEWS = new Set(["overview", "payouts", "artists", "songs", "albums", "labels", "geo", "platforms"]);

/**
 * Sunucuya gitmeyen ekran geçişlerinin denetim kaydı. Önceden her sekme
 * tıklaması sayfa isteğiyle birlikte "view_dashboard" olarak kaydediliyordu;
 * faz-z10'dan beri bu kayıt buradan, aynı eylem adıyla ("via: client") düşer.
 * Yalnızca kayıt yazar — veri döndürmez; önizlemede de çalışsın diye
 * middleware'in yazma engelinden muaftır.
 */
export async function POST(req: Request) {
  if (!authConfigured()) return NextResponse.json({ ok: true });
  const { viewer } = await getSession();
  if (!viewer) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { view?: unknown };
  const view = typeof body.view === "string" && VIEWS.has(body.view) ? body.view : null;
  if (!view) return NextResponse.json({ ok: false }, { status: 400 });

  // Kayıt tablosu şişirilemesin: kullanıcı başına dakikada 60 ekran.
  const rl = await rateLimit(`viewlog:${viewer.userId}`, 60, 60).catch(() => ({ ok: true }));
  if (!rl.ok) return NextResponse.json({ ok: true, skipped: true });

  const preview = await resolveViewAs(viewer);
  const m = await requestMeta();
  await audit({
    userId: viewer.userId,
    action: preview ? "view_dashboard_as" : "view_dashboard",
    resource: preview ? `${view} · artist:${preview.artistId}` : view,
    ip: m.ip, userAgent: m.userAgent,
    meta: { via: "client", admin: isAdmin(viewer) },
  });
  return NextResponse.json({ ok: true });
}
