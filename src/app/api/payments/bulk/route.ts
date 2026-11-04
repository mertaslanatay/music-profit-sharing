import { NextResponse } from "next/server";
import { createBatch, finishBatch, getBankAccount, planBulkClose, recordPayment } from "@/lib/payments";
import { requireAdmin, denyResponse, logAction } from "@/lib/guard";
import { notifyMany, usersForArtist } from "@/lib/notify";
import { CURRENCIES, type Currency } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ids = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map(String).filter((x) => UUID.test(x)).map((x) => x.toLowerCase()))] : [];

/**
 * Toplu kapatma — seçili sanatçıların, seçili label × ödeme partisi
 * kapsamındaki kalanını "ödendi" olarak kaydeder.
 *
 * Gövde: { artistIds, labelIds, reportIds, paidAt?, note?, rates?: {TRY: 34.1, …}, dryRun? }
 *  - Tutarlar SUNUCUDA, o anki gerçek ödemelerle yeniden hesaplanır.
 *  - Her sanatçı kendi banka para biriminde kaydedilir; USD dışı için kur zorunlu.
 *  - Her sanatçı kendi işleminde (recordPayment): biri hata verirse diğerleri
 *    etkilenmez; sonuç sanatçı sanatçı döner.
 *  - dryRun: hiçbir şey yazmadan planı döndürür (onay penceresi bunu gösterir).
 */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin("payment_create_denied");
    const body = await req.json();
    const artistIds = ids(body.artistIds);
    if (artistIds.length === 0) {
      return NextResponse.json({ error: "En az bir sanatçı seçilmeli." }, { status: 400 });
    }
    if (artistIds.length > 300) {
      return NextResponse.json({ error: "Tek seferde en fazla 300 sanatçı." }, { status: 400 });
    }
    const scope = { artistIds, labelIds: ids(body.labelIds), reportIds: ids(body.reportIds) };
    const plan = await planBulkClose(scope);

    const banks = new Map(
      await Promise.all(plan.map(async (p) => [p.artistId, await getBankAccount(p.artistId)] as const))
    );
    const rates: Partial<Record<Currency, number>> = {};
    for (const c of CURRENCIES) {
      const v = Number(body.rates?.[c]);
      if (c !== "USD" && v > 0) rates[c] = v;
    }

    if (body.dryRun) {
      return NextResponse.json({
        plan: plan.map((p) => ({
          artistId: p.artistId,
          amountUsd: p.amountUsd,
          periods: p.allocations.length,
          currency: banks.get(p.artistId)?.currency ?? "USD",
          hasIban: !!banks.get(p.artistId)?.iban,
        })),
      });
    }

    const paidAt = typeof body.paidAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.paidAt)
      ? `${body.paidAt}T12:00:00Z` : null;
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

    // Bu kapatmanın işlem kaydı (0019) — sonradan tek seferde geri alınabilsin.
    const batchId = plan.length
      ? await createBatch({
          createdBy: admin?.userId ?? null,
          labelIds: scope.labelIds,
          reportIds: scope.reportIds,
          scopeText: typeof body.scopeText === "string" ? body.scopeText : "",
          note,
          paidAt,
        })
      : null;

    const results: { artistId: string; ok: boolean; amountUsd: number; error?: string }[] = [];
    for (const p of plan) {
      const cur: Currency = banks.get(p.artistId)?.currency ?? "USD";
      const rate = cur === "USD" ? null : rates[cur] ?? null;
      try {
        if (cur !== "USD" && !rate) throw new Error(`${cur} için kur girilmedi.`);
        const paidAmount = Math.round(p.amountUsd * (rate ?? 1) * 100) / 100;
        await recordPayment({
          artistId: p.artistId,
          allocations: p.allocations,
          labelSplits: p.labelSplits,
          paidCurrency: cur,
          paidAmount,
          exchangeRate: rate,
          note,
          paidAt,
          createdBy: admin?.userId ?? null,
          batchId,
        });
        results.push({ artistId: p.artistId, ok: true, amountUsd: p.amountUsd });
        try {
          await notifyMany(await usersForArtist(p.artistId), {
            type: "payment",
            title: "Ödemen kaydedildi",
            body: `${paidAmount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur} tutarındaki ödemen hesabına işlendi.`,
            resource: `artist:${p.artistId}`,
            actionUrl: "/hesabim",
            createdBy: admin?.userId ?? null,
          });
        } catch { /* bildirim ödemeyi düşürmez */ }
        await logAction(admin, "payment_recorded", `artist:${p.artistId}`, {
          paidAmount, currency: cur, periods: p.allocations.length, via: "bulk", batchId,
        });
      } catch (e) {
        results.push({ artistId: p.artistId, ok: false, amountUsd: p.amountUsd, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const ok = results.filter((r) => r.ok);
    if (batchId) {
      try { await finishBatch(batchId, ok.length, ok.reduce((a, r) => a + r.amountUsd, 0)); } catch { /* yalnızca gösterim */ }
    }
    await logAction(admin, "payment_bulk_close", batchId ? `batch:${batchId}` : null, {
      requested: artistIds.length,
      recorded: ok.length,
      failed: results.length - ok.length,
      amountUsd: Math.round(ok.reduce((a, r) => a + r.amountUsd, 0) * 100) / 100,
      labelIds: scope.labelIds,
      reportIds: scope.reportIds,
    });
    return NextResponse.json({ results, batchId });
  } catch (e) { return denyResponse(e); }
}
