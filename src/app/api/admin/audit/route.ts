import { NextResponse } from "next/server";
import { listAuditLog, listAuditActions, findSuspiciousActivity } from "@/lib/auditQueries";
import { requireAdmin, denyResponse } from "@/lib/guard";

export const dynamic = "force-dynamic";

/** Admin: filtrelenebilir denetim kaydı listesi + şüpheli hareket özeti. */
export async function GET(req: Request) {
  try {
    const admin = await requireAdmin("admin_audit_denied");
    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") ?? "1");
    const [result, actions, suspicious] = await Promise.all([
      listAuditLog({
        action: searchParams.get("action") || undefined,
        userId: searchParams.get("userId") || undefined,
        q: searchParams.get("q") || undefined,
        from: searchParams.get("from") || undefined,
        to: searchParams.get("to") || undefined,
        page: Number.isFinite(page) && page > 0 ? page : 1,
      }),
      listAuditActions(),
      findSuspiciousActivity(),
    ]);
    // Bu listelemenin kendisi de bir görüntüleme — ama denetim ekranını her
    // açışta kayıt şişirmemek için loglamıyoruz; admin_users_list gibi
    // yönetsel ekranlar zaten kendi başına hassas veri saymıyor.
    void admin;
    return NextResponse.json({ ...result, actions, suspicious });
  } catch (e) {
    return denyResponse(e);
  }
}
