import { NextResponse } from "next/server";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";
import {
  listSeparators,
  createSeparator,
  separatorProblem,
  type SeparatorInput,
} from "@/lib/separators";
import type { SeparatorKind } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Sanatçı ayrıştırma belirteçleri (M4NM Pulse § 4) — yalnızca admin.
 *
 * Belirteçler YÜKLEME sırasında uygulanır: burada yapılan değişiklik geçmiş
 * raporları yeniden hesaplamaz, bundan sonraki yüklemeleri etkiler.
 */

export async function GET() {
  try {
    const admin = await requireAdmin("separators_list_denied");
    const separators = await listSeparators();
    await logAction(admin, "separators_list", null, { count: separators.length });
    return NextResponse.json({ separators });
  } catch (e) {
    return denyResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin("separator_create_denied");
    const body = await req.json().catch(() => ({}));

    const input: SeparatorInput = {
      token: typeof body.token === "string" ? body.token.trim() : "",
      kind: (body.kind === "symbol" ? "symbol" : "word") as SeparatorKind,
      isActive: body.isActive !== false,
      sort: Number.isFinite(Number(body.sort)) ? Number(body.sort) : 100,
    };

    const problem = separatorProblem(input);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });

    const created = await createSeparator(input, admin?.userId ?? null);
    if (!created) {
      return NextResponse.json(
        { error: "Bu belirteç zaten tanımlı." },
        { status: 409 }
      );
    }

    await logAction(admin, "separator_created", `separator:${created.id}`, {
      token: created.token,
      kind: created.kind,
      isActive: created.isActive,
    });
    return NextResponse.json({ ok: true, separator: created });
  } catch (e) {
    return denyResponse(e);
  }
}
