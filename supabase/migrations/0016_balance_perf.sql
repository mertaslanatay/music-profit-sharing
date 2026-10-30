-- 0016 — v_artist_balance performans düzeltmesi (Yönetim > Ödemeler)
--
-- SORUN
-- -----
-- v_artist_balance, sanatçı-dönem net tutarlarını (v_artist_period_net) İKİ
-- kez hesaplıyordu: bir kez "kazanılan" toplamı için doğrudan, bir kez de
-- "ödenmemiş dönem" sayımı için v_artist_period_status üzerinden. Her
-- hesaplama tüm credits tablosunu (~260 bin satır) baştan sona tarıyor ve
-- sıralamayı belleğe sığdıramayıp diske taşıyordu (~17 MB).
--
-- Canlıda ölçüldü (30 Eki 2026): 2416 ms. Yönetim sayfası her açılışta bunu
-- çalıştırıyor; soğuk veritabanında bu süre katlanıyor ve tıklama "hiçbir
-- şey olmuyor" gibi görünüyordu.
--
-- ÇÖZÜM
-- -----
-- v_artist_period_status (net + kalan) TEK BİR alt sorguda okunuyor;
-- kazanılan toplam, dönem sayısı, ödenmemiş dönem sayısı ve en eski ödenmemiş
-- dönem aynı ara sonuçtan FILTER ile türetiliyor.
--
-- BİLİNÇLİ OLARAK "MATERIALIZED" KULLANILMADI: tek sanatçı için yapılan
-- sorgularda (where artist_id = $1 — sanatçı portalı, ödeme kaydı kontrolü)
-- materialized CTE filtrenin içeri itilmesini engelliyor ve önce HERKESİ
-- hesaplıyor. Ölçüldü: materialized 717 ms, düz alt sorgu 27 ms.
--
-- Ölçülen sonuç (canlı veri, ~260 bin kredi satırı):
--   tam liste (Yönetim > Ödemeler)   2416 ms → ~650 ms
--   tek sanatçı                        81 ms →   27 ms
-- Sütunlar, tipler ve sıra aynı.
-- Doğrulama: eski ve yeni görünüm canlı veride iki yönlü EXCEPT ile
-- karşılaştırıldı — 101/101 satır, fark 0.
--
-- Para matematiği DEĞİŞMEDİ: aynı v_artist_period_status'tan, aynı
-- 0.005 eşiğiyle okunuyor. İki kez çalıştırılabilir (create or replace).

create or replace view v_artist_balance as
select a.id as artist_id,
       a.display_name as artist_name,
       coalesce(e.earned, 0::numeric) as earned,
       coalesce(pd.paid, 0::numeric) as paid,
       coalesce(e.earned, 0::numeric) - coalesce(pd.paid, 0::numeric) as balance,
       coalesce(e.period_count, 0::bigint) as period_count,
       coalesce(e.unpaid_periods, 0::bigint) as unpaid_periods,
       e.oldest_unpaid_sort,
       pd.last_paid_at,
       r.open_request_id,
       r.open_request_at
from artists a
left join (
  select s.artist_id,
         sum(s.net) as earned,
         count(*) as period_count,
         count(*) filter (where s.remaining > 0.005) as unpaid_periods,
         min(p.sort) filter (where s.remaining > 0.005) as oldest_unpaid_sort
  from (select artist_id, period_id, net, remaining from v_artist_period_status) s
  left join periods p on p.id = s.period_id
  group by s.artist_id
) e on e.artist_id = a.id
left join (
  select artist_id, sum(amount_usd) as paid, max(paid_at) as last_paid_at
  from payments
  group by artist_id
) pd on pd.artist_id = a.id
left join (
  select distinct on (artist_id) artist_id,
         id as open_request_id,
         created_at as open_request_at
  from payment_requests
  where status = 'pending'
  order by artist_id, created_at desc
) r on r.artist_id = a.id;
