import { query, queryOne, transaction, n } from "./db";
import { periodDisplay } from "./period";

/* ------------------------------------------------------------------ tipler */

export interface BankAccount {
  artistId: string;
  accountHolder: string;
  bankName: string;
  iban: string;
  currency: "USD" | "TRY";
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

export interface PeriodStatus {
  periodId: string;
  label: string;
  display: string;
  sort: number;
  gross: number;
  net: number;
  paid: number;
  remaining: number;
}

export interface PaymentRow {
  id: string;
  artistId: string;
  artistName: string;
  amountUsd: number;
  paidCurrency: "USD" | "TRY";
  paidAmount: number;
  exchangeRate: number | null;
  ibanSnapshot: string | null;
  bankSnapshot: string | null;
  note: string | null;
  paidAt: string;
  periods: { periodId: string; display: string; amountUsd: number }[];
}

/* ----------------------------------------------------------- banka bilgisi */

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
    currency: "USD" | "TRY" | null; bnote: string | null; bupdated: string | null;
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

/* ----------------------------------------------- tek sanatçının cari hesabı */

export async function getArtistLedger(artistId: string): Promise<{
  periods: PeriodStatus[];
  payments: PaymentRow[];
} | null> {
  const exists = await queryOne(`select 1 from artists where id = $1`, [artistId]);
  if (!exists) return null;

  const [pRows, payRows] = await Promise.all([
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
    query<{
      id: string; artist_id: string; artist_name: string; amount_usd: number;
      paid_currency: "USD" | "TRY"; paid_amount: number; exchange_rate: number | null;
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

  return {
    periods: pRows.map((r) => ({
      periodId: r.period_id,
      label: r.label,
      display: periodDisplay({ year: r.year, month: r.month, quarter: r.quarter, label: r.label }),
      sort: r.sort,
      gross: n(r.gross),
      net: n(r.net),
      paid: n(r.paid),
      remaining: n(r.remaining),
    })),
    payments: payRows.map(mapPayment),
  };
}

function mapPayment(r: {
  id: string; artist_id: string; artist_name: string; amount_usd: number;
  paid_currency: "USD" | "TRY"; paid_amount: number; exchange_rate: number | null;
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
  paidCurrency: "USD" | "TRY";
  /** Fiilen ödenen tutar (TRY ise TL cinsinden) */
  paidAmount: number;
  /** TRY ödemede USD→TRY kuru */
  exchangeRate?: number | null;
  note?: string | null;
  paidAt?: string | null;
  /** Ödemeyi kaydeden yönetici — geriye dönük "bunu kim girdi" sorusu için. */
  createdBy?: string | null;
}

export async function recordPayment(input: RecordPaymentInput): Promise<{ id: string }> {
  const allocations = input.allocations.filter((a) => a.amountUsd > 0);
  if (allocations.length === 0) throw new Error("En az bir dönem seçilmeli.");

  const amountUsd = allocations.reduce((a, x) => a + x.amountUsd, 0);
  if (!(amountUsd > 0)) throw new Error("Ödeme tutarı sıfırdan büyük olmalı.");
  if (input.paidCurrency === "TRY" && !(Number(input.exchangeRate) > 0)) {
    throw new Error("TL ödemede kur girilmeli.");
  }

  return transaction(async (c) => {
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
        input.paidCurrency === "TRY" ? input.exchangeRate : null,
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
