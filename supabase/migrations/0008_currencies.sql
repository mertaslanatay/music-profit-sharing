-- 0008 — Para birimi listesini genişlet (M4NM Pulse § 10)
--
-- Şu ana kadar yalnızca USD ve TRY kabul ediliyordu. Şartname IBAN'a bağlı
-- para biriminin TRY / USD / EUR / GBP olabilmesini istiyor.
--
-- Sadece CHECK kısıtları değişiyor; veri tipi ve mevcut satırlar aynı kalıyor.
--
-- Kısıt adları sütun içinde tanımlandığı için PostgreSQL tarafından otomatik
-- üretilmişti. Ada güvenmek yerine, ilgili sütuna ait ESKİ para birimi
-- kısıtını tanımından bularak düşürüyoruz — böylece kurulumda ad farklıysa
-- da migration doğru çalışır (yoksa eski kısıt sessizce kalır ve EUR/GBP
-- kaydı reddedilirdi).

do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass::text as tbl, c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'c'
      and n.nspname = 'public'
      and t.relname in ('artist_bank_accounts', 'bank_change_requests', 'payments')
      and pg_get_constraintdef(c.oid) like '%''TRY''%'
      -- payments_rate_required kur zorunluluğu kısıtıdır, korunmalı.
      and pg_get_constraintdef(c.oid) not like '%exchange_rate%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table artist_bank_accounts
  add constraint artist_bank_accounts_currency_check
  check (currency in ('USD', 'TRY', 'EUR', 'GBP'));

alter table bank_change_requests
  add constraint bank_change_requests_currency_check
  check (currency in ('USD', 'TRY', 'EUR', 'GBP'));

-- payments_rate_required olduğu gibi kalır: USD dışındaki her para biriminde
-- kur (exchange_rate) zorunludur — yani EUR/GBP ödemede de kur girilmeden
-- kayıt açılamaz.
alter table payments
  add constraint payments_paid_currency_check
  check (paid_currency in ('USD', 'TRY', 'EUR', 'GBP'));
