-- 0019 — toplu kapatma işlemleri (faz-z14: toplu işlemi geri alma)
--
-- Toplu kapatma her sanatçı için ayrı bir payments satırı üretiyor. Hangi
-- satırların AYNI işlemden geldiği kayıtlı değildi; yanlış bir toplu
-- kapatma ancak sanatçı sanatçı cari hesaptan geri alınabiliyordu.
--
-- payment_batches: bir toplu kapatma = bir satır (kapsam, not, kim, ne zaman,
-- geri alındı mı). payments.batch_id: o ödemenin geldiği işlem (tekil
-- ödemelerde boş). Geri alma işlemin ödemelerini deletePayment ile siler;
-- kilitli partiye dokunan ödemeler korunur.
--
-- Yalnızca ekleme — mevcut ödemeler ve para matematiği değişmez. İki kez
-- çalıştırılabilir. İşlem satırı silinse bile ödemeler kalır (set null).

create table if not exists payment_batches (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  created_by   uuid,
  label_ids    uuid[] not null default '{}',
  report_ids   uuid[] not null default '{}',
  scope_text   text not null default '',
  note         text,
  paid_at      timestamptz,
  reverted_at  timestamptz,
  reverted_by  uuid,
  -- işlem anındaki toplam (geri alındıktan sonra da listede görünsün)
  payment_count int not null default 0,
  amount_usd    numeric(24,12) not null default 0
);
create index if not exists payment_batches_created_idx on payment_batches (created_at desc);

alter table payments add column if not exists batch_id uuid
  references payment_batches(id) on delete set null;
create index if not exists payments_batch_idx on payments (batch_id) where batch_id is not null;

alter table payment_batches enable row level security;
