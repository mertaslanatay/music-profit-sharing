import { NextResponse } from "next/server";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";
import {
  updateSeparator,
  deleteSeparator,
  separatorProblem,
  type SeparatorInput,
} from "@/lib/separators";
import type { SeparatorKind } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const admin = await requireAdmin("separator_update_denied");
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const patch: Partial<SeparatorInput> = {};
    if (typeof body.token === "string") patch.token = body.token.trim();
    if (body.kind === "word" || body.kind === "symbol") patch.kind = body.kind as SeparatorKind;
    if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
    if (body.sort !== undefined && Number.isFinite(Number(body.sort))) patch.sort = Number(body.sort);

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Değiştirilecek bir alan yok." }, { status: 400 });
    }
    // Doğrulama yalnızca gönderilen alanlar için — kısmi güncelleme desteklenir.
    const problem = separatorProblem(patch);
    if (problem && (patch.token !== undefined || patch.kind !== undefined || patch.sort !== undefined)) {
      // token gönderilmediyse "boş olamaz" hatası yanlış olur; onu ayıklıyoruz.
      if (!(patch.token === undefined && problem === "Belirteç boş olamaz.")) {
        return NextResponse.json({ error: problem }, { status: 400 });
      }
    }

    const updated = await updateSeparator(id, patch, admin?.userId ?? null);
    if (!updated) return NextResponse.json({ error: "Belirteç bulunamadı." }, { status: 404 });

    await logAction(admin, "separator_updated", `separator:${id}`, {
      token: updated.token,
      kind: updated.kind,
      isActive: updated.isActive,
      sort: updated.sort,
    });
    return NextResponse.json({ ok: true, separator: updated });
  } catch (e) {
    return denyResponse(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const admin = await requireAdmin("separator_delete_denied");
    const { id } = await params;

    const removed = await deleteSeparator(id);
    if (!removed) return NextResponse.json({ error: "Belirteç bulunamadı." }, { status: 404 });

    await logAction(admin, "separator_deleted", `separator:${id}`, {
      token: removed.token,
      kind: removed.kind,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return denyResponse(e);
  }
}
