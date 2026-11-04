import { type Currency } from "./types";
import { query, queryOne, transaction, n } from "./db";
import { periodDisplay } from "./period";
import { cachedByVersion } from "./dashboardCache";
import { paymentLabelsReady } from "./schema";

/* ------------------------------------------------------------------ tipler */

export interface BankAccount {
  artistId: string;
  accountHolder: string;
  bankName: string;
  iban: string;
  currency: Currency;
  note: string | null;
  updatedAt: string | null;
}

export interface BalanceRow {
  artistId: string;
  artistName: string;
  earned: number;
  paid: number;
  balance: number;
  periodCount: number;
  unpaidPeriods: number;
  oldestUnpaidSort: number | null;
  /** En eski ödenmemiş dönemin okunur adı: "Mart 2026" */
  oldestUnpaidLabel: string | null;
  lastPaidAt: string | null;
  hasOpenRequest: boolean;
  openRequestAt: string | null;
  bank: BankAccount | null;
}

/** Bir dönemin hakedişine katkı veren tek bir yükleme (Excel / ödeme partisi). */
export interface PeriodReportSlice {
  reportId: string;
  title: string;
  net: number;
}

export interface PeriodStatus {
  periodId: string;
  /** Excel'deki ham dönem etiketi — ör. "P03 26(Mar 26)". */
  label: string;
  /** Ayrıştırılmış, okunaklı hâli — ör. "Mart 2026". */
  display: string;
  sort: number;
  gross: number;
  net: number;
  paid: number;
  remaining: number;
  /**
   * Bu dönemin hakedişi hangi yükleme(ler)den geldi — net'e göre azalan.
   * Ödemeler ekranında "yükleme bazında grupla" seçeneği bunu kullanıyor.
   * Bir dönem birden fazla Excel'den beslenebiliyor (aynı dönem için ek
   * rapor yüklenmesi engellenmiyor, bkz. yükleme önizlemesi), o yüzden
   * tekil bir rapor değil LİSTE tutuluyor; gruplama ilkini esas alır.
   */
  reports: PeriodReportSlice[];
}

export interface PaymentRow {
  id: string;
  artistId: string;
  artistName: string;
  amountUsd: number;
  paidCurrency: Currency;
  paidAmount: number;
  exchangeRate: number | null;
  ibanSnapshot: string | null;
  bankSnapshot: string | null;
  note: string | null;
  paidAt: string;
  periods: { periodId: string; display: string; amountUsd: number }[];
}

/* ----------------------------------------------------------- banka bilgisi */

export async function getBankAccount(artistId: string): Promise<BankAccount | null> {
  const r = await queryOne<{
    account_holder: string; bank_name: string; iban: string;
    currency: Currency; note: string | null; updated_at: string | null;
  }>(
    `select account_holder, bank_name, iban, currency, note, updated_at
     from artist_bank_accounts where artist_id = $1`,
    [artistId]
  );
  if (!r) return null;
  return {
    artistId,
    accountHolder: r.account_holder,
    bankName: r.bank_name,
    iban: r.iban,
    currency: r.currency,
    note: r.note,
    updatedAt: r.updated_at,
  };
}

export async function upsertBank(
  artistId: string,
  d: Partial<Omit<BankAccount, "artistId" | "updatedAt">>
): Promise<void> {
  await query(
    `insert into artist_bank_accounts (artist_id, account_holder, bank_name, iban, currency, note, updated_at)
     values ($1,$2,$3,$4,$5,$6, now())
     on conflict (artist_id) do update set
       account_holder = excluded.account_holder,
       bank_name      = excluded.bank_name,
       iban           = excluded.iban,
       currency       = excluded.currency,
       note           = excluded.note,
       updated_at     = now()`,
    [
      artistId,
      d.accountHolder ?? "",
      d.bankName ?? "",
      (d.iban ?? "").replace(/\s+/g, "").toUpperCase(),
      d.currency ?? "USD",
      d.note ?? null,
    ]
  );
}

/* --------------------------------------------------------------- bakiyeler */

export async function listBalances(): Promise<BalanceRow[]> {
  const rows = await query<{
    artist_id: string; artist_name: string; earned: number; paid: number; balance: number;
    period_count: number; unpaid_periods: number; oldest_unpaid_sort: number | null;
    last_paid_at: string | null; open_request_id: string | null; open_request_at: string | null;
    holder: string | null; bank: string | null; iban: string | null;
    currency: Currency | null; bnote: string | null; bupdated: string | null;
    oldest_label: string | null; oldest_year: number | null;
    oldest_month: number | null; oldest_quarter: number | null;
  }>(
    `select b.artist_id, b.artist_name,
            b.earned::float8, b.paid::float8, b.balance::float8,
            b.period_count, b.unpaid_periods, b.oldest_unpaid_sort,
            b.last_paid_at, b.open_request_id, b.open_request_at,
            k.account_holder holder, k.bank_name bank, k.iban,
            k.currency, k.note bnote, k.updated_at bupdated,
            op.label oldest_label, op.year oldest_year,
            op.month oldest_month, op.quarter oldest_quarter
     from v_artist_balance b
     left join artist_bank_accounts k on k.artist_id = b.artist_id
     left join periods op on op.sort = b.oldest_unpaid_sort
     where b.earned > 0 or b.paid > 0
     order by b.balance desc, b.earned desc`
  );

  return rows.map((r) => ({
    artistId: r.artist_id,
    artistName: r.artist_name,
    earned: n(r.earned),
    paid: n(r.paid),
    balance: n(r.balance),
    periodCount: r.period_count,
    unpaidPeriods: r.unpaid_periods,
    oldestUnpaidSort: r.oldest_unpaid_sort,
    oldestUnpaidLabel: r.oldest_label
      ? periodDisplay({
          year: r.oldest_year ?? 0,
          month: r.oldest_month,
          quarter: r.oldest_quarter,
          label: r.oldest_label,
        })
      : null,
    lastPaidAt: r.last_paid_at,
    hasOpenRequest: !!r.open_request_id,
    openRequestAt: r.open_request_at,
    bank: r.iban !== null || r.bank !== null || r.holder !== null
      ? {
          artistId: r.artist_id,
          accountHolder: r.holder ?? "",
          bankName: r.bank ?? "",
          iban: r.iban ?? "",
          currency: r.currency ?? "USD",
          note: r.bnote,
          updatedAt: r.bupdated,
        }
      : null,
  }));
}

/* ------------------------------- label / ödeme partisi bazında bakiye */

/**
 * Yönetim › Ödemeler'deki Label ve Ödeme partisi seçicilerinin kaynağı:
 * sanatçı × dönem × label × rapor (ödeme partisi) hücreleri.
 *
 * Hakediş (net) doğrudan krediden gelir: v_artist_period_net ile AYNI kaynak
 * (v_credits_effective, yayında/kilitli raporlar) ve aynı net formülü.
 *
 * Ödemeler label'a / partiye değil sanatçı + döneme kaydediliyor
 * (payment_periods). Bu yüzden bir hücrenin "ödenen"i = o sanatçı-dönem
 * ödemesinin, hücrenin o sanatçı-dönem netindeki payı kadarı. Bir
 * sanatçı-dönemin hücrelerinin toplamı v_artist_period_status ile birebir.
 *
 * Kompakt biçim (istemciye ~4 bin satır gidiyor): her hücre
 * [sanatçıIdx, dönemIdx, labelIdx, raporIdx, net, ödenen].
 */
export interface PaymentBreakdown {
  artists: string[];
  periods: { id: string; display: string; sort: number }[];
  labels: string[];
  reports: string[];
  cells: [number, number, number, number, number, number][];
}

type NetCell = { a: string; p: string; l: string; r: string; net: number; tot: number };

/** Kredi tarafı — veri sürümüne göre önbellekli (ödemeler sürümü artırmıyor, ayrı okunur). */
async function breakdownNetCells(): Promise<NetCell[]> {
  return cachedByVersion("pay-breakdown:v1", async () => {
    const rows = await query<NetCell>(
      `with lp as (
         select c.artist_id, c.period_id, c.label_id, c.report_id,
                sum(c.gross * (r.received / nullif(r.gross, 0))) net
         from v_credits_effective c
         join reports r on r.id = c.report_id
         where r.status in ('published','locked') and c.label_id is not null
         group by 1, 2, 3, 4
       )
       select artist_id a, period_id p, label_id l, report_id r, net::float8 net,
              (sum(net) over (partition by artist_id, period_id))::float8 tot
       from lp`
    );
    return rows.map((x) => ({ ...x, net: n(x.net), tot: n(x.tot) }));
  });
}

/**
 * Sanatçı-dönem ödemesini hücrelere (label × rapor) dağıtır.
 *   1. Etiketli tutar (payment_period_labels) kendi label'ının hücrelerine,
 *      o label'ın hücreleri arasında net oranında.
 *   2. Kalan (etiketsiz) tutar, hücrelerin henüz ödenmemiş neti oranında;
 *      hepsi ödenmişse (fazla ödeme, negatif satır) net oranında.
 * Her sanatçı-dönemde hücre ödenenlerinin toplamı = payment_periods toplamı.
 */
function labelPaidSplit(
  cells: NetCell[],
  paidOf: Map<string, number>,
  tagOf: Map<string, number>
): number[] {
  const groups = new Map<string, number[]>();
  cells.forEach((c, i) => {
    const k = c.a + "|" + c.p;
    const g = groups.get(k);
    if (g) g.push(i); else groups.set(k, [i]);
  });
  const out = new Array<number>(cells.length).fill(0);
  for (const [k, idxs] of groups) {
    const total = paidOf.get(k) ?? 0;
    if (!total) continue;
    // label → o label'ın hücreleri
    const byLabel = new Map<string, number[]>();
    for (const i of idxs) {
      const l = cells[i].l;
      const g = byLabel.get(l);
      if (g) g.push(i); else byLabel.set(l, [i]);
    }
    let tagged = 0;
    for (const [l, li] of byLabel) {
      const t = Math.min(tagOf.get(k + "|" + l) ?? 0, total - tagged);
      if (t <= 0) continue;
      tagged += t;
      const lnet = li.reduce((a, i) => a + Math.max(cells[i].net, 0), 0);
      for (const i of li) out[i] += lnet > 0 ? t * (Math.max(cells[i].net, 0) / lnet) : t / li.length;
    }
    const rest = total - tagged;
    if (rest <= 1e-9) continue;
    const open = idxs.map((i) => Math.max(cells[i].net - out[i], 0));
    const openSum = open.reduce((a, v) => a + v, 0);
    const tot = cells[idxs[0]].tot;
    idxs.forEach((i, j) => {
      out[i] += openSum > 1e-9 ? rest * (open[j] / openSum) : tot > 0 ? rest * (cells[i].net / tot) : rest / idxs.length;
    });
  }
  return out;
}

export async function getPaymentBreakdown(): Promise<PaymentBreakdown> {
  const tagsReady = await paymentLabelsReady();
  const [cells, paidRows, periodRows, tagRows] = await Promise.all([
    breakdownNetCells(),
    query<{ a: string; p: string; paid: number }>(
      `select pay.artist_id a, pp.period_id p, sum(pp.amount_usd)::float8 paid
       from payment_periods pp join payments pay on pay.id = pp.payment_id
       group by 1, 2`
    ),
    query<{ id: string; label: string; sort: number; year: number; month: number | null; quarter: number | null }>(
      `select id, label, sort, year, month, quarter from periods`
    ),
    tagsReady
      ? query<{ a: string; p: string; l: string; paid: number }>(
          `select pay.artist_id a, x.period_id p, x.label_id l, sum(x.amount_usd)::float8 paid
           from payment_period_labels x join payments pay on pay.id = x.payment_id
           group by 1, 2, 3`
        )
      : Promise.resolve([] as { a: string; p: string; l: string; paid: number }[]),
  ]);

  const paidOf = new Map(paidRows.map((r) => [r.a + "|" + r.p, n(r.paid)]));
  const tagOf = new Map(tagRows.map((r) => [r.a + "|" + r.p + "|" + r.l, n(r.paid)]));
  const paidByCell = labelPaidSplit(cells, paidOf, tagOf);
  const pInfo = new Map(periodRows.map((r) => [r.id, r]));
  const idx = <K,>(list: K[], map: Map<K, number>, k: K) => {
    let i = map.get(k);
    if (i === undefined) { i = list.length; list.push(k); map.set(k, i); }
    return i;
  };
  const out: PaymentBreakdown = { artists: [], periods: [], labels: [], reports: [], cells: [] };
  const aI = new Map<string, number>(), lI = new Map<string, number>(), rI = new Map<string, number>();
  const pIds: string[] = [], pI = new Map<string, number>();
  const r4 = (v: number) => Math.round(v * 1e6) / 1e6;

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const paid = paidByCell[i];
    out.cells.push([
      idx(out.artists, aI, c.a), idx(pIds, pI, c.p),
      idx(out.labels, lI, c.l), idx(out.reports, rI, c.r),
      r4(c.net), r4(paid),
    ]);
  }
  out.periods = pIds.map((id) => {
    const pr = pInfo.get(id);
    return {
      id,
      display: pr ? periodDisplay({ year: pr.year, month: pr.month, quarter: pr.quarter, label: pr.label }) : "—",
      sort: pr?.sort ?? 0,
    };
  });
  return out;
}

/* ------------------------------------------------------- toplu kapatma */

export interface BulkScope {
  artistIds: string[];
  /** boş = tüm label'lar */
  labelIds: string[];
  /** boş = tüm ödeme partileri */
  reportIds: string[];
}

export interface BulkPlanItem {
  artistId: string;
  amountUsd: number;
  allocations: { periodId: string; amountUsd: number }[];
  labelSplits: { periodId: string; labelId: string; amountUsd: number }[];
}

/**
 * Seçili kapsamdaki (label × parti) kalan tutarları sanatçı bazında ödeme
 * planına çevirir. Sunucuda, o anki gerçek ödemelerle yeniden hesaplanır —
 * istemcinin gördüğü rakama güvenilmez. Bir dönemin tutarı, o dönemin genel
 * kalanını asla aşmaz (fazla ödeme kontrolü recordPayment'ta ayrıca var).
 */
export async function planBulkClose(scope: BulkScope): Promise<BulkPlanItem[]> {
  const bd = await getPaymentBreakdown();
  const want = new Set(scope.artistIds);
  const labels = scope.labelIds.length ? new Set(scope.labelIds) : null;
  const reps = scope.reportIds.length ? new Set(scope.reportIds) : null;

  // sanatçı → dönem → { genel kalan, label → kapsamdaki kalan }
  const per = new Map<string, Map<string, { total: number; byLabel: Map<string, number> }>>();
  for (const [ai, pi, li, ri, net, paid] of bd.cells) {
    const a = bd.artists[ai];
    if (!want.has(a)) continue;
    const p = bd.periods[pi].id;
    const l = bd.labels[li];
    const r = bd.reports[ri];
    let m = per.get(a);
    if (!m) { m = new Map(); per.set(a, m); }
    let e = m.get(p);
    if (!e) { e = { total: 0, byLabel: new Map() }; m.set(p, e); }
    e.total += net - paid;
    if ((labels && !labels.has(l)) || (reps && !reps.has(r))) continue;
    e.byLabel.set(l, (e.byLabel.get(l) ?? 0) + (net - paid));
  }

  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  const plan: BulkPlanItem[] = [];
  for (const a of scope.artistIds) {
    const m = per.get(a);
    if (!m) continue;
    const item: BulkPlanItem = { artistId: a, amountUsd: 0, allocations: [], labelSplits: [] };
    for (const [p, e] of m) {
      const parts = [...e.byLabel].filter(([, v]) => v > 0.005);
      const want = parts.reduce((s, [, v]) => s + v, 0);
      const amt = Math.min(want, e.total);
      if (amt <= 0.005) continue;
      const k = amt / want; // genel kalan daha azsa label payları orantılı kısılır
      item.allocations.push({ periodId: p, amountUsd: r6(amt) });
      for (const [l, v] of parts) item.labelSplits.push({ periodId: p, labelId: l, amountUsd: r6(v * k) });
      item.amountUsd += amt;
    }
    if (item.allocations.length) {
      // Yuvarlama: label payları toplamı dönem tutarıyla birebir olsun.
      for (const al of item.allocations) {
        const sp = item.labelSplits.filter((x) => x.periodId === al.periodId);
        const diff = r6(al.amountUsd - sp.reduce((s, x) => s + x.amountUsd, 0));
        if (diff && sp.length) sp[0].amountUsd = r6(sp[0].amountUsd + diff);
      }
      plan.push(item);
    }
  }
  return plan;
}

/* ----------------------------------------------- tek sanatçının cari hesabı */

export interface LedgerSummary {
  earned: number;
  paid: number;
  balance: number;
  hasOpenRequest: boolean;
  openRequestAt: string | null;
}

export async function getArtistLedger(artistId: string): Promise<{
  summary: LedgerSummary;
  periods: PeriodStatus[];
  payments: PaymentRow[];
} | null> {
  const exists = await queryOne(`select 1 from artists where id = $1`, [artistId]);
  if (!exists) return null;

  const bal = await queryOne<{
    earned: number; paid: number; balance: number;
    open_request_id: string | null; open_request_at: string | null;
  }>(
    `select earned::float8, paid::float8, balance::float8, open_request_id, open_request_at
     from v_artist_balance where artist_id = $1`,
    [artistId]
  );

  const [pRows, sliceRows, payRows] = await Promise.all([
    query<{
      period_id: string; label: string; sort: number; year: number;
      month: number | null; quarter: number | null;
      gross: number; net: number; paid: number; remaining: number;
    }>(
      `select s.period_id, p.label, p.sort, p.year, p.month, p.quarter,
              s.gross::float8, s.net::float8, s.paid::float8, s.remaining::float8
       from v_artist_period_status s
       join periods p on p.id = s.period_id
       where s.artist_id = $1
       order by p.sort desc`,
      [artistId]
    ),
    // Dönemin hakedişini yükleme (rapor) bazında parçalar.
    // v_artist_period_net ile AYNI kaynağı ve aynı net formülünü kullanıyor;
    // bir dönemin dilimlerinin toplamı o dönemin net'ine eşit olmalı.
    query<{ period_id: string; report_id: string; title: string; net: number }>(
      `select c.period_id, c.report_id, r.title,
              sum(c.gross * (r.received / nullif(r.gross, 0)))::float8 as net
       from v_credits_effective c
       join reports r on r.id = c.report_id
       where c.artist_id = $1 and r.status in ('published','locked')
       group by c.period_id, c.report_id, r.title`,
      [artistId]
    ),
    query<{
      id: string; artist_id: string; artist_name: string; amount_usd: number;
      paid_currency: Currency; paid_amount: number; exchange_rate: number | null;
      iban_snapshot: string | null; bank_snapshot: string | null; note: string | null;
      paid_at: string; periods: { period_id: string; label: string; year: number;
        month: number | null; quarter: number | null; amount_usd: number }[] | null;
    }>(
      `select pay.id, pay.artist_id, a.display_name artist_name,
              pay.amount_usd::float8, pay.paid_currency, pay.paid_amount::float8,
              pay.exchange_rate::float8, pay.iban_snapshot, pay.bank_snapshot,
              pay.note, pay.paid_at,
              coalesce(json_agg(json_build_object(
                'period_id', p.id, 'label', p.label, 'year', p.year,
                'month', p.month, 'quarter', p.quarter,
                'amount_usd', pp.amount_usd::float8
              ) order by p.sort) filter (where p.id is not null), '[]'::json) periods
       from payments pay
       join artists a on a.id = pay.artist_id
       left join payment_periods pp on pp.payment_id = pay.id
       left join periods p on p.id = pp.period_id
       where pay.artist_id = $1
       group by pay.id, a.display_name
       order by pay.paid_at desc`,
      [artistId]
    ),
  ]);

  // Dilimleri döneme göre topla, net'e göre azalan sırala: ilk eleman o
  // dönemin "birincil yüklemesi" olur ve gruplama ona bakar.
  const dilimler = new Map<string, PeriodReportSlice[]>();
  for (const s of sliceRows) {
    const liste = dilimler.get(s.period_id) ?? [];
    liste.push({ reportId: s.report_id, title: s.title, net: n(s.net) });
    dilimler.set(s.period_id, liste);
  }
  for (const liste of dilimler.values()) liste.sort((a, b) => b.net - a.net);

  return {
    summary: {
      earned: n(bal?.earned),
      paid: n(bal?.paid),
      balance: n(bal?.balance),
      hasOpenRequest: !!bal?.open_request_id,
      openRequestAt: bal?.open_request_at ?? null,
    },
    periods: pRows.map((r) => ({
      periodId: r.period_id,
      label: r.label,
      display: periodDisplay({ year: r.year, month: r.month, quarter: r.quarter, label: r.label }),
      sort: r.sort,
      gross: n(r.gross),
      net: n(r.net),
      paid: n(r.paid),
      remaining: n(r.remaining),
      reports: dilimler.get(r.period_id) ?? [],
    })),
    payments: payRows.map(mapPayment),
  };
}

function mapPayment(r: {
  id: string; artist_id: string; artist_name: string; amount_usd: number;
  paid_currency: Currency; paid_amount: number; exchange_rate: number | null;
  iban_snapshot: string | null; bank_snapshot: string | null; note: string | null;
  paid_at: string; periods: { period_id: string; label: string; year: number;
    month: number | null; quarter: number | null; amount_usd: number }[] | null;
}): PaymentRow {
  return {
    id: r.id,
    artistId: r.artist_id,
    artistName: r.artist_name,
    amountUsd: n(r.amount_usd),
    paidCurrency: r.paid_currency,
    paidAmount: n(r.paid_amount),
    exchangeRate: r.exchange_rate === null ? null : n(r.exchange_rate),
    ibanSnapshot: r.iban_snapshot,
    bankSnapshot: r.bank_snapshot,
    note: r.note,
    paidAt: r.paid_at,
    periods: (r.periods ?? []).map((p) => ({
      periodId: p.period_id,
      display: periodDisplay({ year: p.year, month: p.month, quarter: p.quarter, label: p.label }),
      amountUsd: n(p.amount_usd),
    })),
  };
}

/* ------------------------------------------------------------ ödeme kaydet */

export interface RecordPaymentInput {
  artistId: string;
  /** Kapatılacak dönemler ve her birine düşen USD tutarı */
  allocations: { periodId: string; amountUsd: number }[];
  paidCurrency: Currency;
  /** Fiilen ödenen tutar (USD dışı bir para biriminde ise o para biriminde) */
  paidAmount: number;
  /** USD dışı ödemede 1 USD karşılığı kur (ör. USD→TRY) */
  exchangeRate?: number | null;
  note?: string | null;
  paidAt?: string | null;
  /** Ödemeyi kaydeden yönetici — geriye dönük "bunu kim girdi" sorusu için. */
  createdBy?: string | null;
  /**
   * İsteğe bağlı: her dönem tutarının label'lara dağılımı (0018). Toplu
   * kapatma yazar; bir dönemin label tutarlarının toplamı o dönemin
   * allocation tutarına eşit olmalı.
   */
  labelSplits?: { periodId: string; labelId: string; amountUsd: number }[];
}

export async function recordPayment(input: RecordPaymentInput): Promise<{ id: string }> {
  const allocations = input.allocations.filter((a) => a.amountUsd > 0);
  if (allocations.length === 0) throw new Error("En az bir dönem seçilmeli.");

  const amountUsd = allocations.reduce((a, x) => a + x.amountUsd, 0);
  if (!(amountUsd > 0)) throw new Error("Ödeme tutarı sıfırdan büyük olmalı.");
  // USD dışındaki her para biriminde kur zorunlu (payments_rate_required).
  if (input.paidCurrency !== "USD" && !(Number(input.exchangeRate) > 0)) {
    throw new Error(`${input.paidCurrency} ödemede kur girilmeli.`);
  }

  return transaction(async (c) => {
    // Bu sanatçı için advisory kilit — src/lib/songSplits.ts'teki setSongSplit
    // aynı kilidi (aynı hashtext(artistId) anahtarıyla) alıyor. Amaç: bu
    // fonksiyonun az sonra okuyacağı "kalan tutar" (remaining), eşzamanlı bir
    // kalıcı bölüşüm düzenlemesinin COMMIT'inden hemen önceki bayat bir
    // anlık görüntü olmasın — aksi hâlde ikisi de kendi guard'ını geçip
    // ikisi birden uygulanınca sanatçı payının üstünde ödeme yapılabilirdi.
    // Tek sanatçı kilitlendiği için sıralama sorunu yok (bkz. songSplits.ts).
    await c.query(`select pg_advisory_xact_lock(hashtext($1::uuid::text)::bigint)`, [input.artistId]);

    // Fazla ödemeyi engelle: her dönem için kalan tutarı kontrol et.
    const rem = await c.query<{ period_id: string; remaining: string }>(
      `select period_id, remaining from v_artist_period_status
       where artist_id = $1 and period_id = any($2::uuid[])`,
      [input.artistId, allocations.map((a) => a.periodId)]
    );
    const remMap = new Map(rem.rows.map((r) => [r.period_id, n(r.remaining)]));
    for (const a of allocations) {
      const left = remMap.get(a.periodId);
      if (left === undefined) throw new Error("Bu sanatçının seçilen dönemde hakedişi yok.");
      // yarım kuruş tolerans
      if (a.amountUsd > left + 0.005) {
        throw new Error(
          `Seçilen dönemde kalan tutar $${left.toFixed(2)}, daha fazlası ödenemez.`
        );
      }
    }

    const bank = await c.query<{ iban: string; bank_name: string }>(
      `select iban, bank_name from artist_bank_accounts where artist_id = $1`,
      [input.artistId]
    );

    const pay = await c.query<{ id: string }>(
      `insert into payments (artist_id, amount_usd, paid_currency, paid_amount,
                             exchange_rate, iban_snapshot, bank_snapshot, note, paid_at,
                             recorded_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8, coalesce($9::timestamptz, now()), $10)
       returning id`,
      [
        input.artistId,
        amountUsd,
        input.paidCurrency,
        input.paidAmount,
        input.paidCurrency !== "USD" ? input.exchangeRate : null,
        bank.rows[0]?.iban ?? null,
        bank.rows[0]?.bank_name ?? null,
        input.note ?? null,
        input.paidAt ?? null,
        input.createdBy ?? null,
      ]
    );
    const paymentId = pay.rows[0].id;

    for (const a of allocations) {
      await c.query(
        `insert into payment_periods (payment_id, period_id, amount_usd) values ($1,$2,$3)`,
        [paymentId, a.periodId, a.amountUsd]
      );
    }

    const splits = (input.labelSplits ?? []).filter((x) => x.amountUsd > 0);
    if (splits.length && (await paymentLabelsReady())) {
      for (const x of splits) {
        await c.query(
          `insert into payment_period_labels (payment_id, period_id, label_id, amount_usd)
           values ($1,$2,$3,$4)`,
          [paymentId, x.periodId, x.labelId, x.amountUsd]
        );
      }
    }

    // Açık istek varsa kapat
    await c.query(
      `update payment_requests
       set status = 'paid', resolved_at = now(), payment_id = $2
       where artist_id = $1 and status = 'pending'`,
      [input.artistId, paymentId]
    );

    return { id: paymentId };
  });
}

export async function deletePayment(id: string): Promise<void> {
  await transaction(async (c) => {
    await c.query(
      `update payment_requests set status = 'pending', resolved_at = null, payment_id = null
       where payment_id = $1`,
      [id]
    );
    await c.query(`delete from payments where id = $1`, [id]);
  });
}

/* ---------------------------------------------------------- ödeme istekleri */

export interface RequestRow {
  id: string;
  artistId: string;
  artistName: string;
  amountUsd: number;
  status: "pending" | "paid" | "rejected" | "cancelled";
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export async function listRequests(status?: RequestRow["status"]): Promise<RequestRow[]> {
  const rows = await query<{
    id: string; artist_id: string; artist_name: string; amount_usd: number;
    status: RequestRow["status"]; note: string | null;
    created_at: string; resolved_at: string | null;
  }>(
    `select r.id, r.artist_id, a.display_name artist_name, r.amount_usd::float8,
            r.status, r.note, r.created_at, r.resolved_at
     from payment_requests r join artists a on a.id = r.artist_id
     ${status ? `where r.status = $1` : ""}
     order by r.created_at desc`,
    status ? [status] : []
  );
  return rows.map((r) => ({
    id: r.id,
    artistId: r.artist_id,
    artistName: r.artist_name,
    amountUsd: n(r.amount_usd),
    status: r.status,
    note: r.note,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }));
}

/** Sanatçı "bakiyemi öde" der — tutar o anki bakiyedir, elle girilmez. */
export async function createRequest(artistId: string, note?: string | null): Promise<{ id: string } | { error: string }> {
  const bal = await queryOne<{ balance: number }>(
    `select balance::float8 from v_artist_balance where artist_id = $1`,
    [artistId]
  );
  const amount = n(bal?.balance);
  if (!(amount > 0.005)) return { error: "Ödenecek bakiyen yok." };

  const open = await queryOne(
    `select 1 from payment_requests where artist_id = $1 and status = 'pending'`,
    [artistId]
  );
  if (open) return { error: "Zaten bekleyen bir ödeme isteğin var." };

  const r = await queryOne<{ id: string }>(
    `insert into payment_requests (artist_id, amount_usd, note) values ($1,$2,$3) returning id`,
    [artistId, amount, note ?? null]
  );
  return { id: r!.id };
}

export async function setRequestStatus(
  id: string,
  status: "rejected" | "cancelled" | "pending",
  adminNote?: string | null
): Promise<void> {
  await query(
    `update payment_requests
     set status = $2,
         admin_note = coalesce($3, admin_note),
         resolved_at = case when $2 = 'pending' then null else now() end
     where id = $1`,
    [id, status, adminNote ?? null]
  );
}

/* ------------------------------------------- banka değişiklik istekleri */
//
// Sanatçı kendi IBAN'ını doğrudan değiştiremez (bkz. src/app/api/bank/[artistId]/route.ts
// üstündeki not). Değişiklik isteği açar, admin onaylayana kadar eski bilgi geçerli kalır.

export interface BankChangeRequestRow {
  id: string;
  artistId: string;
  artistName: string;
  accountHolder: string;
  bankName: string;
  iban: string;
  currency: Currency;
  note: string | null;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  /** Bu istek onaylanırsa, o anda geçerli olan (eski) bilgi — karşılaştırma için */
  current: BankAccount | null;
}

function mapBankChangeRequest(r: {
  id: string; artist_id: string; artist_name: string; account_holder: string;
  bank_name: string; iban: string; currency: Currency; note: string | null;
  status: "pending" | "approved" | "rejected"; admin_note: string | null;
  created_at: string; resolved_at: string | null;
  cur_holder: string | null; cur_bank: string | null; cur_iban: string | null;
  cur_currency: Currency | null; cur_note: string | null; cur_updated: string | null;
}): BankChangeRequestRow {
  return {
    id: r.id,
    artistId: r.artist_id,
    artistName: r.artist_name,
    accountHolder: r.account_holder,
    bankName: r.bank_name,
    iban: r.iban,
    currency: r.currency,
    note: r.note,
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    current: r.cur_iban !== null || r.cur_bank !== null || r.cur_holder !== null
      ? {
          artistId: r.artist_id,
          accountHolder: r.cur_holder ?? "",
          bankName: r.cur_bank ?? "",
          iban: r.cur_iban ?? "",
          currency: r.cur_currency ?? "USD",
          note: r.cur_note,
          updatedAt: r.cur_updated,
        }
      : null,
  };
}

const BANK_CHANGE_SELECT = `
  select q.id, q.artist_id, a.display_name artist_name, q.account_holder, q.bank_name,
         q.iban, q.currency, q.note, q.status, q.admin_note, q.created_at, q.resolved_at,
         k.account_holder cur_holder, k.bank_name cur_bank, k.iban cur_iban,
         k.currency cur_currency, k.note cur_note, k.updated_at cur_updated
  from bank_change_requests q
  join artists a on a.id = q.artist_id
  left join artist_bank_accounts k on k.artist_id = q.artist_id`;

/** Sanatçının bekleyen bir banka değişikliği isteği var mı? */
export async function getOpenBankChangeRequest(artistId: string): Promise<BankChangeRequestRow | null> {
  const r = await queryOne(
    `${BANK_CHANGE_SELECT} where q.artist_id = $1 and q.status = 'pending' order by q.created_at desc limit 1`,
    [artistId]
  );
  return r ? mapBankChangeRequest(r as Parameters<typeof mapBankChangeRequest>[0]) : null;
}

/** Bir sanatçının banka değişiklik istek geçmişi (en yeni önce). */
export async function listBankChangeRequestsForArtist(artistId: string): Promise<BankChangeRequestRow[]> {
  const rows = await query(
    `${BANK_CHANGE_SELECT} where q.artist_id = $1 order by q.created_at desc`,
    [artistId]
  );
  return rows.map((r) => mapBankChangeRequest(r as Parameters<typeof mapBankChangeRequest>[0]));
}

/** Admin için: tüm istekler (varsayılan yalnızca bekleyenler). */
export async function listBankChangeRequests(
  status?: BankChangeRequestRow["status"]
): Promise<BankChangeRequestRow[]> {
  const rows = await query(
    `${BANK_CHANGE_SELECT} ${status ? "where q.status = $1" : ""} order by q.created_at desc`,
    status ? [status] : []
  );
  return rows.map((r) => mapBankChangeRequest(r as Parameters<typeof mapBankChangeRequest>[0]));
}

export interface CreateBankChangeInput {
  artistId: string;
  requestedBy: string | null;
  accountHolder: string;
  bankName: string;
  iban: string;
  currency: Currency;
  note?: string | null;
}

export async function createBankChangeRequest(
  input: CreateBankChangeInput
): Promise<{ id: string } | { error: string }> {
  const iban = input.iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) {
    return { error: "IBAN biçimi geçersiz görünüyor. Örnek: TR33 0006 1005 1978 6457 8413 26" };
  }
  if (!input.accountHolder.trim() || !input.bankName.trim()) {
    return { error: "Hesap sahibi ve banka adı boş bırakılamaz." };
  }

  const open = await queryOne(
    `select 1 from bank_change_requests where artist_id = $1 and status = 'pending'`,
    [input.artistId]
  );
  if (open) return { error: "Zaten bekleyen bir banka değişikliği isteğin var." };

  const r = await queryOne<{ id: string }>(
    `insert into bank_change_requests
       (artist_id, requested_by, account_holder, bank_name, iban, currency, note)
     values ($1,$2,$3,$4,$5,$6,$7)
     returning id`,
    [
      input.artistId, input.requestedBy, input.accountHolder.trim(),
      input.bankName.trim(), iban, input.currency, input.note ?? null,
    ]
  );
  return { id: r!.id };
}

/** Admin onaylar/reddeder. Onayda güncel banka bilgisi hemen değişir. */
export async function resolveBankChangeRequest(
  id: string,
  action: "approve" | "reject",
  resolvedBy: string | null,
  adminNote?: string | null
): Promise<{ ok: true } | { error: string }> {
  return transaction(async (c) => {
    const req = await c.query<{
      id: string; artist_id: string; account_holder: string; bank_name: string;
      iban: string; currency: Currency; status: string;
    }>(
      `select id, artist_id, account_holder, bank_name, iban, currency, status
       from bank_change_requests where id = $1 for update`,
      [id]
    );
    const row = req.rows[0];
    if (!row) return { error: "İstek bulunamadı." };
    if (row.status !== "pending") return { error: "Bu istek zaten sonuçlanmış." };

    if (action === "approve") {
      await c.query(
        `insert into artist_bank_accounts (artist_id, account_holder, bank_name, iban, currency, note, updated_at)
         values ($1,$2,$3,$4,$5, null, now())
         on conflict (artist_id) do update set
           account_holder = excluded.account_holder,
           bank_name      = excluded.bank_name,
           iban           = excluded.iban,
           currency       = excluded.currency,
           updated_at     = now()`,
        [row.artist_id, row.account_holder, row.bank_name, row.iban, row.currency]
      );
    }

    await c.query(
      `update bank_change_requests
       set status = $2, admin_note = $3, resolved_at = now(), resolved_by = $4
       where id = $1`,
      [id, action === "approve" ? "approved" : "rejected", adminNote ?? null, resolvedBy]
    );

    return { ok: true };
  });
}

/* ------------------------------------------------- panel: bekleyen ödeme */

/**
 * Henüz ödenmemiş net hakediş (tüm dönemler) — Panel'deki "Bekleyen ödeme".
 *
 * Ödemeler data_version'ı artırmadığı için panel önbelleğine konamaz; burada
 * kısa (60 sn) bir süreç içi önbellek var. Fazla ödenmiş (eksi bakiyeli)
 * sanatçılar toplamı düşürmesin diye bakiye sıfırın altına inmez.
 *
 * artistIds null = herkes (yönetici). Sanatçı için id başına ayrı sorgu
 * atılıyor: `artist_id = any($1)` görünüme inmiyor ve herkesi hesaplıyor
 * (canlıda 593 ms), `artist_id = $1` ise ~30 ms.
 */
const pendingCache = new Map<string, { at: number; v: number }>();
const PENDING_TTL_MS = 60_000;

export async function pendingTotal(artistIds: string[] | null): Promise<number> {
  const key = artistIds === null ? "*" : [...artistIds].sort().join(",");
  const hit = pendingCache.get(key);
  if (hit && Date.now() - hit.at < PENDING_TTL_MS) return hit.v;

  let v = 0;
  if (artistIds === null) {
    const r = await query<{ v: number }>(
      `select coalesce(sum(greatest(balance, 0)), 0)::float8 v from v_artist_balance`
    );
    v = n(r[0]?.v);
  } else {
    const parts = await Promise.all(
      artistIds.map((id) =>
        query<{ v: number }>(
          `select greatest(balance, 0)::float8 v from v_artist_balance where artist_id = $1::uuid`,
          [id]
        )
      )
    );
    v = parts.reduce((a, r) => a + n(r[0]?.v), 0);
  }
  pendingCache.set(key, { at: Date.now(), v });
  return v;
}
