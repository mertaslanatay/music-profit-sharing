-- 0010 — Sanatçı ↔ Label iletişim merkezi (M4NM Pulse § 9)
--
-- Basit bir "iletişim formu" değil, hafif bir destek kutusu: her talep bir
-- KONUŞMA (thread) açar, iki taraf da aynı konuşma üzerinden yazışır, geçmiş
-- olduğu gibi kalır.
--
-- OKUNDU İZLERİ — kasıtlı basitlik: okundu bilgisi mesaj başına değil, konuşma
-- başına ve TARAF başına tutulur (user_read_at / admin_read_at). Bir konuşma,
-- ilgili tarafın okuma zamanı son mesajdan eskiyse "okunmamış" sayılır.
-- Yönetim tarafı ORTAK bir kutudur: bir yönetici okuduğunda diğerleri için de
-- okunmuş olur. M4NM'de yönetici sayısı bir elin parmağını geçmediği için bu
-- basitlik doğru dengedir; kişi başına okundu izi istenirse ayrı bir eşleme
-- tablosu gerekir.

create table if not exists support_threads (
  id              uuid primary key default gen_random_uuid(),
  -- Konuşmayı açan sanatçı/kullanıcı. Silinirse konuşma da gider.
  user_id         uuid not null references users(id) on delete cascade,
  subject         text not null,
  -- open     → cevap bekliyor
  -- answered → yönetici cevapladı, kullanıcıda
  -- closed   → kapatıldı (iki taraf da kapatabilir, yeniden açılabilir)
  status          text not null default 'open'
                    check (status in ('open', 'answered', 'closed')),
  -- Sıralama ve okunmamış hesabı bunun üzerinden yapılır.
  last_message_at timestamptz not null default now(),
  user_read_at    timestamptz,
  admin_read_at   timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists support_threads_user_idx
  on support_threads (user_id, last_message_at desc);

create index if not exists support_threads_recent_idx
  on support_threads (last_message_at desc);

create table if not exists support_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references support_threads(id) on delete cascade,
  -- Gönderen kullanıcı silinse bile mesaj geçmişi kalır (set null).
  sender_id   uuid references users(id) on delete set null,
  -- Mesajın hangi taraftan geldiği, gönderen silinse de kaybolmasın diye
  -- ayrıca saklanır — konuşma balonlarının yönü buna bakar.
  sender_role text not null check (sender_role in ('user', 'admin')),
  -- Gönderen adının o anki hâli; kullanıcı silinirse "eski üye" yerine
  -- gerçek isim görünsün diye anlık kopya.
  sender_name text not null default '',
  body        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists support_messages_thread_idx
  on support_messages (thread_id, created_at);
