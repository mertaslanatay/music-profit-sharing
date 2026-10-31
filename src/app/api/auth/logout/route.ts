import { NextResponse } from "next/server";
import { supabaseServer, authConfigured } from "@/lib/supabase/server";
import { audit } from "@/lib/access";
import { currentViewer } from "@/lib/session";
import { cookies } from "next/headers";
import { VIEW_AS_COOKIE } from "@/lib/viewAs";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!authConfigured()) return NextResponse.json({ ok: true });
  const viewer = await currentViewer().catch(() => null);
  const sb = await supabaseServer();
  await sb.auth.signOut();
  // Önizleme çerezi oturumla birlikte düşsün — bir sonraki girişte yönetici
  // kendini beklenmedik şekilde sanatçı ekranında bulmasın.
  (await cookies()).delete(VIEW_AS_COOKIE);
  await audit({
    userId: viewer?.userId ?? null, action: "logout", resource: viewer?.email ?? null,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
  });
  return NextResponse.json({ ok: true });
}
