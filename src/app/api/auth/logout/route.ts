import { NextResponse } from "next/server";
import { supabaseServer, authConfigured } from "@/lib/supabase/server";
import { audit } from "@/lib/access";
import { currentViewer } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!authConfigured()) return NextResponse.json({ ok: true });
  const viewer = await currentViewer().catch(() => null);
  const sb = await supabaseServer();
  await sb.auth.signOut();
  await audit({
    userId: viewer?.userId ?? null, action: "logout", resource: viewer?.email ?? null,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? null,
  });
  return NextResponse.json({ ok: true });
}
