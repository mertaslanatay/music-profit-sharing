-- =====================================================================
-- M4NM Music Profit — v2 şema (Faz 1: veri katmanı)
--
-- Tasarım kararları:
--  * report_rows  = ham Excel satırları, DEĞİŞMEZ kaynak
--  * credits      = türetilmiş bölüşüm payları; kurallar değişince yeniden üretilir
--  * Tüm para alanları numeric(24,12) — kuruş altı payları kayıpsız tutar
--  * Faz 2'de eklenecek kimlik tabloları burada iskelet olarak hazır
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- label
create table if not exists labels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  slug        text not null unique,
  created_at  timestamptz not null default now()
);

-- -------------------------------------------------------------- sanatçı
-- fold_key: Türkçe-duyarlı normalizasyon anahtarı (AĞAÇKAKAN = Ağaçkakan)
create table if not exists artists (
  id           uuid primary key default gen_random_uuid(),
  fold_key     text not null unique,
  display_name text not null,
  spellings    text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists artists_display_name_idx on artists (lower(display_name));

-- --------------------------------------------------------------- şarkı
create table if not exists songs (
  id            uuid primary key default gen_random_uuid(),
  song_key      text not null unique,          -- isrc:XXX veya t:<artist>|<title>
  title         text not null,
  album         text not null default '',
  isrc          text not null default '',
  artist_string text not null default '',      -- ham "Ağaçkakan, Oldeaf"
  created_at    timestamptz not null default now()
);
create index if not exists songs_isrc_idx on songs (isrc) where isrc <> '';

-- --------------------------------------------------------------- dönem
-- ÖNEMLİ: Bir Excel dosyası birden fazla dönem içerebilir (örn. Q2 dosyasında
-- hem "P03 26(Mar 26)" hem "P04 26(Apr 26)" var). Bu yüzden dönem, yüklenen
-- dosyadan ayrı bir boyut. Yıl/ay analizi buradan beslenir.
create table if not exists periods (
  id      uuid primary key default gen_random_uuid(),
  label   text not null unique,            -- ham etiket: "P03 26(Mar 26)"
  sort    integer not null,                -- sıralanabilir: 202603
  year    integer not null,
  month   integer,                         -- 1..12, çözülebildiyse
  quarter integer                          -- 1..4, aydan türetilir
);
create index if not exists periods_sort_idx on periods (sort desc);

-- ------------------------------------------------- rapor (yükleme partisi)
create type report_status as enum ('draft', 'published', 'locked');

create table if not exists reports (
  id             uuid primary key default gen_random_uuid(),
  title          text not null default '',          -- "M4NM Q2 2026 Ödeme"
  file_name      text not null default '',
  file_hash      text,                              -- aynı dosyayı iki kez yüklemeyi yakalar
  storage_path   text,                              -- Supabase Storage yolu
  gross          numeric(24,12) not null default 0,
  deduction      numeric(24,12) not null default 0,  -- SWIFT / banka masrafı
  received       numeric(24,12) not null default 0,  -- brüt − kesinti
  row_count      integer not null default 0,
  status         report_status not null default 'draft',
  rules_version  integer,
  uploaded_by    uuid,                              -- Faz 2: users(id)
  notes          text,
  created_at     timestamptz not null default now(),
  published_at   timestamptz,
  locked_at      timestamptz
);
create index if not exists reports_created_idx on reports (created_at desc);
create index if not exists reports_hash_idx on reports (file_hash) where file_hash is not null;

-- Bir raporun hangi dönemleri kapsadığı ve dönem başına brüt
create table if not exists report_periods (
  report_id uuid not null references reports(id) on delete cascade,
  period_id uuid not null references periods(id) on delete restrict,
  gross     numeric(24,12) not null default 0,
  row_count integer not null default 0,
  primary key (report_id, period_id)
);

-- ------------------------------------------------- ham satırlar (değişmez)
create table if not exists report_rows (
  id            bigserial primary key,
  report_id     uuid not null references reports(id) on delete cascade,
  period_id     uuid references periods(id) on delete restrict,
  period        text not null default '',
  retailer      text not null default '',
  label_name    text not null default '',
  artist_string text not null default '',
  album         text not null default '',
  song_title    text not null default '',
  isrc          text not null default '',
  territory     text not null default '',
  country_iso   text not null default '',
  asset_type    text not null default '',
  sales_class   text not null default '',
  quantity      numeric(18,6) not null default 0,
  revenue       numeric(24,12) not null default 0,
  net           numeric(24,12) not null default 0   -- Net Dollars after Fees
);
create index if not exists report_rows_report_idx on report_rows (report_id);

-- --------------------------------------------- türetilmiş bölüşüm payları
-- Bir satırın bir sanatçıya düşen payı. Sorgular buradan beslenir.
create table if not exists credits (
  id            bigserial primary key,
  report_id     uuid not null references reports(id) on delete cascade,
  period_id     uuid not null references periods(id) on delete restrict,
  artist_id     uuid not null references artists(id) on delete cascade,
  song_id       uuid not null references songs(id) on delete cascade,
  label_id      uuid not null references labels(id) on delete cascade,
  share         numeric(14,12) not null,       -- 0..1 arası pay (1/3 = 0.333333333333)
  position      smallint not null,             -- 0 = ana sanatçı
  total_artists smallint not null,
  gross         numeric(24,12) not null,        -- satır net'i × pay
  quantity      numeric(18,6) not null default 0,
  territory     text not null default '',
  retailer      text not null default ''
);
create index if not exists credits_report_idx  on credits (report_id);
create index if not exists credits_artist_idx  on credits (artist_id, report_id);
create index if not exists credits_label_idx   on credits (label_id, report_id);
create index if not exists credits_song_idx    on credits (song_id);
-- Ekranların en sık sorgusu: dönem + label + sanatçı toplamı
create index if not exists credits_rollup_idx  on credits (report_id, label_id, artist_id);
create index if not exists credits_period_idx  on credits (period_id, label_id, artist_id);

-- ---------------------------------------------------- hesaplama kuralları
-- Tek satırlık aktif kural seti (versiyonlanır)
create table if not exists engine_rules (
  id          uuid primary key default gen_random_uuid(),
  version     integer not null,
  split       jsonb not null default '{}'::jsonb,   -- ayırıcı açık/kapalı
  aliases     jsonb not null default '{}'::jsonb,   -- foldKey -> hedef foldKey
  overrides   jsonb not null default '{}'::jsonb,   -- artistString -> ağırlıklar
  is_active   boolean not null default false,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create unique index if not exists engine_rules_active_uq
  on engine_rules (is_active) where is_active;

-- yeniden hesaplama geçmişi
create table if not exists recalc_log (
  id           bigserial primary key,
  report_id    uuid references reports(id) on delete cascade,
  from_version integer,
  to_version   integer,
  changed_by   uuid,
  diff         jsonb not null default '{}'::jsonb,  -- kimin hakedişi ne kadar değişti
  created_at   timestamptz not null default now()
);

-- =====================================================================
-- Faz 2 iskeleti — kimlik ve erişim (tablolar şimdi kurulur, Faz 2'de kullanılır)
-- =====================================================================

create type user_status as enum ('pending', 'active', 'suspended');
create type app_role    as enum ('admin', 'label_manager', 'artist', 'accountant');

create table if not exists users (
  id                uuid primary key default gen_random_uuid(),
  email             text not null unique,
  first_name        text not null default '',
  last_name         text not null default '',
  artist_name       text,
  role              app_role not null default 'artist',
  status            user_status not null default 'pending',
  email_verified_at timestamptz,
  kvkk_consent_at   timestamptz,
  -- sanatçı görünürlük bayrakları (varsayılan ikisi de kapalı)
  can_see_label_totals   boolean not null default false,
  can_see_other_artists  boolean not null default false,
  created_at        timestamptz not null default now(),
  approved_at       timestamptz,
  approved_by       uuid references users(id)
);

-- bir kullanıcı hesabı hangi sanatçıyı temsil ediyor
create table if not exists artist_user_link (
  artist_id uuid not null references artists(id) on delete cascade,
  user_id   uuid not null references users(id)   on delete cascade,
  primary key (artist_id, user_id)
);

create table if not exists user_label_access (
  user_id  uuid not null references users(id)  on delete cascade,
  label_id uuid not null references labels(id) on delete cascade,
  role     app_role not null default 'label_manager',
  primary key (user_id, label_id)
);

create table if not exists user_artist_access (
  user_id   uuid not null references users(id)   on delete cascade,
  artist_id uuid not null references artists(id) on delete cascade,
  primary key (user_id, artist_id)
);

create table if not exists audit_log (
  id          bigserial primary key,
  user_id     uuid references users(id) on delete set null,
  action      text not null,            -- view_payouts, export_xlsx, login_failed...
  resource    text,                     -- label:M4NM, artist:<id>, report:<id>
  ip          inet,
  user_agent  text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_user_idx on audit_log (user_id, created_at desc);
create index if not exists audit_time_idx on audit_log (created_at desc);

-- =====================================================================
-- Yardımcı görünümler — tüm zamanlar ve dönem bazlı toplamlar
-- =====================================================================

-- Sanatçı × dönem × label kırılımı (ekranların ana kaynağı)
create or replace view v_artist_period_label as
select
  c.period_id,
  p.label as period_label,
  p.sort  as period_sort,
  p.year,
  p.month,
  p.quarter,
  c.artist_id,
  a.display_name as artist_name,
  c.label_id,
  l.name as label_name,
  sum(c.gross)                                   as gross,
  sum(c.quantity)                                as quantity,
  count(distinct c.song_id)                      as song_count,
  sum(case when c.total_artists = 1 then c.gross else 0 end) as solo_gross,
  sum(case when c.total_artists > 1 and c.position = 0 then c.gross else 0 end) as primary_gross,
  sum(case when c.position > 0 then c.gross else 0 end)      as feature_gross
from credits c
join periods p on p.id = c.period_id
join artists a on a.id = c.artist_id
join labels  l on l.id = c.label_id
group by c.period_id, p.label, p.sort, p.year, p.month, p.quarter,
         c.artist_id, a.display_name, c.label_id, l.name;

-- Tüm zamanlar: sanatçı toplamları
create or replace view v_artist_alltime as
select
  c.artist_id,
  a.display_name as artist_name,
  sum(c.gross)                as gross,
  sum(c.quantity)             as quantity,
  count(distinct c.song_id)   as song_count,
  count(distinct c.period_id) as period_count
from credits c
join artists a on a.id = c.artist_id
group by c.artist_id, a.display_name;

-- Tüm zamanlar: label toplamları
create or replace view v_label_alltime as
select
  c.label_id,
  l.name as label_name,
  sum(c.gross)                as gross,
  sum(c.quantity)             as quantity,
  count(distinct c.artist_id) as artist_count,
  count(distinct c.song_id)   as song_count,
  count(distinct c.period_id) as period_count
from credits c
join labels l on l.id = c.label_id
group by c.label_id, l.name;

-- Dönem bazında genel toplam (zaman serisi grafikleri)
create or replace view v_period_totals as
select
  p.id as period_id,
  p.label as period_label,
  p.sort  as period_sort,
  p.year,
  p.month,
  p.quarter,
  sum(c.gross)                as gross,
  sum(c.quantity)             as quantity,
  count(distinct c.artist_id) as artist_count,
  count(distinct c.song_id)   as song_count
from credits c
join periods p on p.id = c.period_id
group by p.id, p.label, p.sort, p.year, p.month, p.quarter;

-- Yıl bazında toplam
create or replace view v_year_totals as
select
  p.year,
  sum(c.gross)                as gross,
  sum(c.quantity)             as quantity,
  count(distinct c.artist_id) as artist_count,
  count(distinct c.period_id) as period_count
from credits c
join periods p on p.id = c.period_id
group by p.year;
