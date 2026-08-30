-- =====================================================================
-- 0004 — Kimlik bağlantısı, banka değişiklik onayı, denetim
--
-- Kimlik Supabase Auth'ta (şifre, oturum, e-posta doğrulama orada).
-- Profil, rol, onay durumu ve yetkiler bizim users tablomuzda; ikisi
-- auth_id ile bağlanıyor.
-- =====================================================================

-- Supabase Auth kullanıcısına bağlantı
alter table users add column if not exists auth_id uuid;
create unique index if not exists users_auth_id_uq on users (auth_id) where auth_id is not null;

-- E-posta büyük/küçük harften bağımsız benzersiz olmalı
create unique index if not exists users_email_lower_uq on users (lower(email));

-- Askıya alma / reddetme gerekçesi
alter table users add column if not exists status_note text;
alter table users add column if not exists last_seen_at timestamptz;

-- ------------------------------------------------- banka değişiklik onayı
-- Sanatçı kendi IBAN'ını girer ama hemen geçerli olmaz: admin onaylayana
-- kadar eski bilgi geçerli kalır. Hesap ele geçirilse bile para başka
-- yere gitmez.
create table if not exists bank_change_requests (
  id             uuid primary key default gen_random_uuid(),
  artist_id      uuid not null references artists(id) on delete cascade,
  requested_by   uuid references users(id) on delete set null,
  account_holder text not null default '',
  bank_name      text not null default '',
  iban           text not null default '',
  currency       text not null default 'USD' check (currency in ('USD','TRY')),
  note           text,
  status         text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  admin_note     text,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    uuid references users(id) on delete set null
);
create index if not exists bank_change_open_idx on bank_change_requests (status)
  where status = 'pending';
create index if not exists bank_change_artist_idx on bank_change_requests (artist_id, created_at desc);

-- --------------------------------------------------------- denetim kaydı
-- audit_log 0001'de kuruldu; kaynak bazlı sorgu için ek indeks
create index if not exists audit_resource_idx on audit_log (resource, created_at desc);
create index if not exists audit_action_idx   on audit_log (action, created_at desc);

-- ------------------------------------------------------- hız sınırı sayacı
-- Giriş/kayıt/şifre denemelerini IP ve e-posta bazında sayar.
create table if not exists rate_limits (
  bucket     text not null,          -- "login:mert@x.com" veya "login:1.2.3.4"
  window_at  timestamptz not null,   -- pencere başlangıcı (dakikaya yuvarlı)
  count      integer not null default 0,
  primary key (bucket, window_at)
);
create index if not exists rate_limits_window_idx on rate_limits (window_at);

-- ------------------------------------------------------------- görünümler

-- Kullanıcı + etkin yetkileri tek satırda
create or replace view v_user_access as
select
  u.id,
  u.auth_id,
  u.email,
  u.first_name,
  u.last_name,
  u.artist_name,
  u.role,
  u.status,
  u.email_verified_at,
  u.kvkk_consent_at,
  u.can_see_label_totals,
  u.can_see_other_artists,
  u.created_at,
  u.approved_at,
  u.last_seen_at,
  coalesce(l.label_ids,  '{}') as label_ids,
  coalesce(a.artist_ids, '{}') as artist_ids
from users u
left join (
  select user_id, array_agg(label_id) label_ids
  from user_label_access group by user_id
) l on l.user_id = u.id
left join (
  select user_id, array_agg(artist_id) artist_ids
  from user_artist_access group by user_id
) a on a.user_id = u.id;
