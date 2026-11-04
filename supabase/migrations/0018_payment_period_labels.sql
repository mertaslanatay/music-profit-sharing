-- 0018 — ödemelerde label izi (faz-z13: Yönetim › Ödemeler › toplu kapatma)
--
-- SORUN
-- -----
-- Ödemeler sanatçı + döneme kaydediliyor (payment_periods); label bilgisi
-- yok. Bir sanatçının aynı ayda birden fazla label'dan geliri varsa
-- (canlıda 3.690 sanatçı-dönemin 84'ü, ~$277) "M4NM payını ödedim" bilgisi
-- kayboluyor: label kırılımı ödemeyi label'lara gelir oranında bölmek
-- zorunda kalıyor.
--
-- ÇÖZÜM
-- -----
-- payment_periods satırının label'lara dağılımı için İSTEĞE BAĞLI bir ek
-- tablo. Toplu kapatma her zaman yazar; tekil ödeme (cari hesap) yazmaz.
-- Kırılım: önce etiketli tutar kendi label'ına, kalan (etiketsiz) tutar
-- label'ların kalan neti oranında.
--
-- Para matematiği DEĞİŞMEDİ: bakiye, fazla ödeme kontrolü ve sanatçı
-- portalı yine payment_periods.amount_usd üzerinden çalışır; bu tablo
-- yalnızca label kırılımını keskinleştirir. Yalnızca ekleme — iki kez
-- çalıştırılabilir. Ödeme silinince satırları da silinir (cascade).

create table if not exists payment_period_labels (
  payment_id uuid not null references payments(id) on delete cascade,
  period_id  uuid not null references periods(id)  on delete restrict,
  label_id   uuid not null references labels(id)   on delete restrict,
  amount_usd numeric(24,12) not null check (amount_usd >= 0),
  primary key (payment_id, period_id, label_id)
);
create index if not exists payment_period_labels_period_idx on payment_period_labels (period_id);

alter table payment_period_labels enable row level security;
