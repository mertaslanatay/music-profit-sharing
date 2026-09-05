-- 0007 — Bildirim merkezi ve duyurular (M4NM Pulse § 1)
--
-- İki ayrı kavram var ve kasıtlı olarak iki ayrı tabloda tutuluyorlar:
--
--  • notifications  → KİŞİYE ÖZEL olay ("ödemen kaydedildi", "hesabın
--    onaylandı"). Her satır bir kullanıcıya aittir.
--
--  • announcements  → HERKESE açık ürün duyurusu (What's New). Tek satır
--    yazılır, tüm kullanıcılar görür. Kullanıcı başına satır çoğaltmıyoruz:
--    öyle yapsaydık sonradan katılan kullanıcı eski duyuruları hiç görmezdi
--    ve her duyuru N satır yazardı. Okundu bilgisi ayrı bir eşleme
--    tablosunda (announcement_reads) tutulur.

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  -- Bildirim tipi — arayüzde ikon/renk ve filtre için.
  -- payment_batch | payment | bank | request | account | revenue_transfer
  -- | message | system
  type        text not null default 'system',
  title       text not null,
  body        text not null default '',
  -- İlgili kayıt: "report:<uuid>", "payment:<uuid>", "song:<uuid>"…
  resource    text,
  -- Tıklayınca gidilecek uygulama içi adres ("/?v=payouts").
  action_url  text,
  meta        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid references users(id) on delete set null
);

create index if not exists notifications_user_idx
  on notifications (user_id, created_at desc);

-- Okunmamış sayacı her sayfa yüklemesinde sorulacak — kısmi indeks bu
-- sorguyu tablo büyüse de ucuz tutar.
create index if not exists notifications_unread_idx
  on notifications (user_id) where read_at is null;

create table if not exists announcements (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  body          text not null default '',
  -- null ise taslak; yalnızca published_at dolu olanlar kullanıcılara görünür.
  published_at  timestamptz,
  created_by    uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists announcements_published_idx
  on announcements (published_at desc) where published_at is not null;

create table if not exists announcement_reads (
  announcement_id uuid not null references announcements(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

create index if not exists announcement_reads_user_idx
  on announcement_reads (user_id);
