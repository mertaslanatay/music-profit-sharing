-- =====================================================================
-- 0003 — Ödeme takibi, banka bilgileri ve sanatçı bakiyeleri
--
-- Model: sanatçı bir cari hesap gibi çalışır.
--   kazanılan (yayınlanmış raporlardan net hakediş)
--   − ödenen  (kaydedilen ödemeler)
--   = bakiye  (birikmiş, henüz ödenmemiş tutar)
--
-- Ödeme yapılırken hangi dönemleri kapattığı elle seçilir (payment_periods),
-- böylece "Mart ödendi, Nisan bekliyor" sorusu kesin cevaplanır.
-- =====================================================================

-- ------------------------------------------------------- banka bilgileri
create table if not exists artist_bank_accounts (
  artist_id      uuid primary key references artists(id) on delete cascade,
  account_holder text not null default '',        -- hesap sahibinin tam adı
  bank_name      text not null default '',
  iban           text not null default '',
  currency       text not null default 'USD' check (currency in ('USD','TRY')),
  note           text,
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);

-- --------------------------------------------------------------- ödemeler
create table if not exists payments (
  id             uuid primary key default gen_random_uuid(),
  artist_id      uuid not null references artists(id) on delete restrict,
  -- Kapatılan hakediş her zaman USD (raporlar USD)
  amount_usd     numeric(24,12) not null check (amount_usd > 0),
  -- Fiilen ödenen para birimi ve tutarı
  paid_currency  text not null default 'USD' check (paid_currency in ('USD','TRY')),
  paid_amount    numeric(24,12) not null check (paid_amount > 0),
  -- TRY ödemede kullanılan USD→TRY kuru (USD ödemede null)
  exchange_rate  numeric(18,8),
  -- Ödeme anındaki banka bilgisi (sonradan değişse bile kayıt bozulmasın)
  iban_snapshot  text,
  bank_snapshot  text,
  note           text,
  paid_at        timestamptz not null default now(),
  recorded_by    uuid,
  request_id     uuid,
  created_at     timestamptz not null default now(),
  -- TRY ödemede kur zorunlu
  constraint payments_rate_required
    check (paid_currency = 'USD' or exchange_rate is not null)
);
create index if not exists payments_artist_idx on payments (artist_id, paid_at desc);

-- Bir ödemenin hangi dönemleri kapattığı
create table if not exists payment_periods (
  payment_id uuid not null references payments(id) on delete cascade,
  period_id  uuid not null references periods(id)  on delete restrict,
  amount_usd numeric(24,12) not null check (amount_usd >= 0),
  primary key (payment_id, period_id)
);
create index if not exists payment_periods_period_idx on payment_periods (period_id);

-- --------------------------------------------------------- ödeme istekleri
create table if not exists payment_requests (
  id           uuid primary key default gen_random_uuid(),
  artist_id    uuid not null references artists(id) on delete cascade,
  requested_by uuid,                                -- Faz 2: users(id)
  amount_usd   numeric(24,12) not null,             -- istek anındaki bakiye
  status       text not null default 'pending'
               check (status in ('pending','paid','rejected','cancelled')),
  note         text,
  admin_note   text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid,
  payment_id   uuid references payments(id) on delete set null
);
create index if not exists payment_requests_artist_idx on payment_requests (artist_id, created_at desc);
create index if not exists payment_requests_open_idx on payment_requests (status) where status = 'pending';

-- =====================================================================
-- Görünümler
-- =====================================================================

-- Sanatçı × dönem NET hakediş.
-- Her rapor kendi kesinti oranıyla hesaplanır: net = brüt × (yatan / brüt).
-- Yalnızca yayınlanmış/kilitli raporlar sayılır — taslak borç doğurmaz.
create or replace view v_artist_period_net as
select
  c.artist_id,
  c.period_id,
  sum(c.gross)                                                    as gross,
  sum(c.gross * (r.received / nullif(r.gross, 0)))                as net
from credits c
join reports r on r.id = c.report_id
where r.status in ('published','locked')
group by c.artist_id, c.period_id;

-- Sanatçı × dönem ödeme durumu: ne kadar hakediş, ne kadarı ödendi, kalan
create or replace view v_artist_period_status as
select
  n.artist_id,
  n.period_id,
  n.gross,
  n.net,
  coalesce(p.paid, 0)          as paid,
  n.net - coalesce(p.paid, 0)  as remaining
from v_artist_period_net n
left join (
  select pay.artist_id, pp.period_id, sum(pp.amount_usd) as paid
  from payment_periods pp
  join payments pay on pay.id = pp.payment_id
  group by pay.artist_id, pp.period_id
) p on p.artist_id = n.artist_id and p.period_id = n.period_id;

-- Sanatçı bakiyesi — ana ödeme ekranının kaynağı
create or replace view v_artist_balance as
select
  a.id                                        as artist_id,
  a.display_name                              as artist_name,
  coalesce(e.earned, 0)                       as earned,
  coalesce(pd.paid, 0)                        as paid,
  coalesce(e.earned, 0) - coalesce(pd.paid, 0) as balance,
  coalesce(e.period_count, 0)                 as period_count,
  coalesce(u.unpaid_periods, 0)               as unpaid_periods,
  u.oldest_unpaid_sort,
  pd.last_paid_at,
  r.open_request_id,
  r.open_request_at
from artists a
left join (
  select artist_id, sum(net) earned, count(*) period_count
  from v_artist_period_net group by artist_id
) e on e.artist_id = a.id
left join (
  select artist_id, sum(amount_usd) paid, max(paid_at) last_paid_at
  from payments group by artist_id
) pd on pd.artist_id = a.id
left join (
  select s.artist_id, count(*) unpaid_periods, min(p.sort) oldest_unpaid_sort
  from v_artist_period_status s
  join periods p on p.id = s.period_id
  where s.remaining > 0.005
  group by s.artist_id
) u on u.artist_id = a.id
left join (
  select distinct on (artist_id) artist_id, id open_request_id, created_at open_request_at
  from payment_requests where status = 'pending'
  order by artist_id, created_at desc
) r on r.artist_id = a.id;
