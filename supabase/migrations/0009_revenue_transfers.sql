-- 0009 — Şarkı bazlı dönemsel gelir hakkı devri (M4NM Pulse § 2, § 3)
--
-- KURAL: Bir şarkının kalıcı bölüşüm yapısı (credits) ASLA değişmez.
-- Devir ayrı bir tabloda "niyet" olarak durur ve okuma anında uygulanır.
-- Bunun üç sonucu var, üçü de şartnamenin kritik iş kurallarıyla birebir:
--
--   • Geçmiş dönemler etkilenmez — her devir kendi report_id + period_id'sini
--     taşır, başka döneme sızması yapısal olarak imkânsızdır.
--   • "Devir sonrası hakedişler yeniden hesaplanmalı" maddesi kendiliğinden
--     karşılanır: toplu bir yeniden-hesaplama işi YOKTUR, sayılar zaten
--     devirleri içeren görünümden okunur. Devir kaydedildiği anda panel,
--     ödeme bakiyesi ve sanatçı portalı aynı yeni rakamı gösterir.
--   • Devir geri alınabilir (status='reverted'), çünkü orijinal veri hiç
--     bozulmadı.

create table if not exists revenue_transfers (
  id              uuid primary key default gen_random_uuid(),

  -- Devir HANGİ ödeme partisi ve dönem için geçerli (ikisi birden tutulur:
  -- bir rapor birden çok dönem içerebiliyor).
  report_id       uuid not null references reports(id) on delete cascade,
  period_id       uuid not null references periods(id) on delete restrict,
  song_id         uuid not null references songs(id)   on delete cascade,

  from_artist_id  uuid not null references artists(id) on delete restrict,
  to_artist_id    uuid not null references artists(id) on delete restrict,

  -- Devreden sanatçının O ŞARKIDAKİ KENDİ PAYININ ne kadarı devrediliyor.
  -- 1 = payının tamamı. 0.5 = yarısı. Şarkının toplam bölüşümü değil,
  -- yalnızca devredenin kendi payı ölçü alınır — "kullanıcı yalnızca
  -- kendisine ait gelir payını devredebilir" kuralının doğrudan karşılığı.
  ratio           numeric(14,12) not null check (ratio > 0 and ratio <= 1),

  status          text not null default 'active' check (status in ('active','reverted')),
  note            text,

  created_by      uuid references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  reverted_by     uuid references users(id) on delete set null,
  reverted_at     timestamptz,

  -- Kendine devir anlamsız.
  constraint revenue_transfers_distinct check (from_artist_id <> to_artist_id)
);

create index if not exists revenue_transfers_lookup_idx
  on revenue_transfers (report_id, period_id, song_id, from_artist_id)
  where status = 'active';

create index if not exists revenue_transfers_song_idx
  on revenue_transfers (song_id, created_at desc);

create index if not exists revenue_transfers_artist_idx
  on revenue_transfers (from_artist_id, to_artist_id);

-- ---------------------------------------------------------------------------
-- Aşırı devir koruması
-- ---------------------------------------------------------------------------
--
-- Bir sanatçının aynı şarkı + dönemdeki aktif devir oranlarının toplamı 1'i
-- geçemez. Geçseydi payı negatife düşerdi (toplam yine korunur ama sanatçı
-- "eksi kazanmış" görünürdü).
--
-- Uygulama bunu zaten kontrol ediyor ve devir eklerken rapor satırını
-- kilitleyerek yarış durumunu engelliyor. Bu tetikleyici ikinci savunma
-- hattıdır: Supabase panelinden elle atılan bir INSERT de aynı kurala tabi.

create or replace function revenue_transfers_guard() returns trigger as $$
declare
  toplam numeric;
begin
  if new.status <> 'active' then
    return new;
  end if;
  select coalesce(sum(ratio), 0) into toplam
  from revenue_transfers
  where song_id = new.song_id
    and report_id = new.report_id
    and period_id = new.period_id
    and from_artist_id = new.from_artist_id
    and status = 'active'
    and id <> new.id;

  if toplam + new.ratio > 1 + 1e-9 then
    raise exception
      'Devredilebilecek paydan fazla: bu sarki+donemde zaten % oraninda aktif devir var (toplam en fazla 1 olabilir).',
      toplam
      using errcode = 'check_violation';
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists revenue_transfers_guard_trg on revenue_transfers;
create trigger revenue_transfers_guard_trg
  before insert or update on revenue_transfers
  for each row execute function revenue_transfers_guard();

-- ---------------------------------------------------------------------------
-- Etkin krediler: credits + aktif devirler
-- ---------------------------------------------------------------------------
--
-- İki koldan oluşur:
--   1. Orijinal krediler, devredilen oran kadar AZALTILMIŞ
--   2. Devralan sanatçı adına, devredilen oran kadar YENİ satırlar
--
-- Toplam korunur: azaltılan ne ise eklenen odur. Bu yüzden rapor toplamı,
-- kesinti oranı ve pro-rata dağıtımı devirden etkilenmez — para el değiştirir,
-- yaratılmaz veya yok olmaz.
--
-- quantity (dinlenme sayısı) BİLEREK devredilmez: gelir devri paranın
-- sahibini değiştirir, performansın sahibini değil. Devralan satırda 0'dır,
-- devredenin satırında olduğu gibi kalır.
--
-- is_transfer bayrağı, "kaç Excel satırı" gibi sayımların şişmemesi için var:
-- para toplamlarına devir satırları dahil edilir, satır sayımlarına edilmez.

create or replace view v_credits_effective as
with t as (
  select report_id, period_id, song_id, from_artist_id, sum(ratio) as ratio
  from revenue_transfers
  where status = 'active'
  group by report_id, period_id, song_id, from_artist_id
)
select
  c.id,
  c.report_id,
  c.period_id,
  c.artist_id,
  c.song_id,
  c.label_id,
  (c.share * (1 - coalesce(t.ratio, 0)))::numeric(14,12) as share,
  c.position,
  c.total_artists,
  (c.gross * (1 - coalesce(t.ratio, 0)))::numeric(24,12) as gross,
  c.quantity,
  c.territory,
  c.retailer,
  false as is_transfer
from credits c
left join t
  on  t.report_id      = c.report_id
  and t.period_id      = c.period_id
  and t.song_id        = c.song_id
  and t.from_artist_id = c.artist_id

union all

select
  c.id,
  c.report_id,
  c.period_id,
  rt.to_artist_id as artist_id,
  c.song_id,
  c.label_id,
  (c.share * rt.ratio)::numeric(14,12) as share,
  c.position,
  c.total_artists,
  (c.gross * rt.ratio)::numeric(24,12) as gross,
  0::numeric(24,12) as quantity,
  c.territory,
  c.retailer,
  true as is_transfer
from credits c
join revenue_transfers rt
  on  rt.status         = 'active'
  and rt.report_id      = c.report_id
  and rt.period_id      = c.period_id
  and rt.song_id        = c.song_id
  and rt.from_artist_id = c.artist_id;

-- ---------------------------------------------------------------------------
-- Ödeme zinciri artık etkin krediler üzerinden
-- ---------------------------------------------------------------------------
--
-- v_artist_period_net → v_artist_period_status → v_artist_balance zinciri
-- olduğu gibi duruyor; yalnızca en alttaki kaynak değişiyor. Böylece bakiye,
-- ödeme kaydı sırasındaki "fazla ödeme" kontrolü ve sanatçı portalı devirleri
-- otomatik olarak görüyor — tek bir yerde bile ayrık kalmıyor.

create or replace view v_artist_period_net as
select
  c.artist_id,
  c.period_id,
  sum(c.gross)                                     as gross,
  sum(c.gross * (r.received / nullif(r.gross, 0))) as net
from v_credits_effective c
join reports r on r.id = c.report_id
where r.status in ('published','locked')
group by c.artist_id, c.period_id;
