-- 0014 — v_credits_split performans düzeltmesi (üretimdeki bağlantı zaman aşımının kök nedeni)
--
-- SORUN
-- -----
-- 0013 ile v_credits_effective'in altına v_credits_split katmanı girdi. Katman
-- MANTIKSAL olarak doğruydu ama MALİYETİ, song_splits tablosu tamamen BOŞ olsa
-- bile ödeniyordu:
--
--   from credits c
--   left join active  a on a.song_id = c.song_id
--   left join reports r on r.id      = c.report_id     <-- 390.000 satırın
--   where a.song_id is null or r.status = 'locked'         HEPSİ için hash join
--
-- reports'a yapılan bu LEFT JOIN, hiç özel bölüşüm olmasa bile her satır için
-- çalışıyordu; üstelik v_credits_effective, v_credits_split'i İKİ kez
-- (UNION ALL'ın iki dalında) okuduğu için maliyet ikiye katlanıyordu.
--
-- Gerçek Postgres 16 üzerinde 390.000 satırlık gerçekçi bir veri setiyle
-- ölçüldü: aynı gösterge paneli sorguları 0009 sürümünde 1131 ms, 0013
-- sürümünde 1877 ms sürüyordu — song_splits BOŞKEN %66 fazla.
--
-- Bu, tek başına sayfayı düşürmezdi; ama src/lib/db.ts'teki havuz sunucusuz
-- ortamda yalnızca 3 bağlantı açıyor ve tek bir gösterge paneli yüklemesi
-- ~23 sorguyu paralel atıyor. Sorgular %66 yavaşlayınca kuyrukta bekleme
-- süresi pg havuzunun 10 saniyelik sınırını aştı ve istekler
-- "timeout exceeded when trying to connect" ile düştü — ki bu mesaj
-- yanıltıcıdır: node-postgres, "sunucuya ulaşılamadı" ile "havuzdan sıra
-- gelmedi" durumlarının İKİSİ için de aynı metni verir.
--
-- ÇÖZÜM
-- -----
-- Aynı mantık, aynı sonuç — ama maliyet yalnızca gerçekten özel bölüşümü olan
-- şarkılar için ödeniyor:
--
--   * reports'a yapılan zorunlu LEFT JOIN kaldırıldı. Yerine EXISTS geldi;
--     Postgres OR koşullarını kısa devre değerlendirdiği için, şarkının özel
--     bölüşümü yoksa (üretimde şu an TÜM satırlar böyle) "kilitli mi" alt
--     sorgusu HİÇ çalıştırılmıyor.
--   * "bu şarkının geçerli bir bölüşümü var mı" kontrolü anti-join'e döndü;
--     song_splits boşken bu, satır başına boş bir hash aramasıdır.
--
-- Davranış BİREBİR aynı kalır (aşağıdaki dört kural değişmedi):
--   1. Geçerli (toplamı 1) bölüşümü olmayan şarkı  -> ham credits aynen geçer.
--   2. Kilitli rapor                                -> ham credits aynen geçer.
--   3. Geçerli bölüşüm + kilitsiz rapor             -> gross/quantity yeniden dağıtılır.
--   4. territory/retailer kırılımı korunur.

-- Bu migration 0013'ün ÜZERİNE gider. 0013 çalıştırılmadıysa net bir mesajla
-- durur — yarım uygulanmış bir şema bırakmaz.
do $$
begin
  if to_regclass('public.song_splits') is null then
    raise exception
      'Önce 0013_song_splits.sql çalıştırılmalı (song_splits tablosu bulunamadı).';
  end if;
end $$;

create or replace view v_credits_split as
with active as (
  select song_id
  from song_splits
  group by song_id
  having abs(sum(share) - 1) <= 1e-6
),
grp as (
  select
    c.report_id, c.period_id, c.song_id, c.label_id, c.territory, c.retailer,
    min(c.id)                       as ref_id,
    sum(c.gross)::numeric(24,12)    as row_net,
    sum(c.quantity)::numeric(24,12) as row_qty
  from credits c
  join active a  on a.song_id = c.song_id
  join reports r on r.id = c.report_id
  where r.status <> 'locked'
  group by c.report_id, c.period_id, c.song_id, c.label_id, c.territory, c.retailer
),
cnt as (
  select song_id, count(*)::smallint n from song_splits group by song_id
)
-- 1. dal: şarkının GEÇERLİ bir özel bölüşümü YOK -> ham satır aynen geçer.
-- Üretimdeki bugünkü durum budur (song_splits boş): reports'a hiç dokunulmaz,
-- yalnızca boş bir hash tablosuna karşı anti-join yapılır.
select
  c.id, c.report_id, c.period_id, c.artist_id, c.song_id, c.label_id,
  c.share, c.position, c.total_artists, c.gross, c.quantity, c.territory, c.retailer
from credits c
left join active a on a.song_id = c.song_id
where a.song_id is null

union all

-- 2. dal: şarkının bölüşümü VAR ama rapor KİLİTLİ -> yine ham satır aynen geçer
-- ("zaten ödenmiş dönem asla değişmez"). Bu dal active'ten sürüldüğü için
-- yalnızca gerçekten bölüşümü olan şarkılara dokunur; song_splits boşken
-- hiç satır üretmez ve maliyeti sıfırdır.
select
  c.id, c.report_id, c.period_id, c.artist_id, c.song_id, c.label_id,
  c.share, c.position, c.total_artists, c.gross, c.quantity, c.territory, c.retailer
from active a
join credits c  on c.song_id  = a.song_id
join reports r  on r.id       = c.report_id and r.status = 'locked'

union all

select
  g.ref_id                                as id,
  g.report_id, g.period_id,
  ss.artist_id,
  g.song_id, g.label_id,
  ss.share,
  ss.position,
  cnt.n                                   as total_artists,
  (g.row_net * ss.share)::numeric(24,12)  as gross,
  (g.row_qty * ss.share)::numeric(24,12)  as quantity,
  g.territory, g.retailer
from grp g
join song_splits ss on ss.song_id = g.song_id
join cnt on cnt.song_id = g.song_id;

-- v_credits_effective 0013'teki hâliyle aynı tanıma sahip; yalnızca altındaki
-- v_credits_split değiştiği için burada yeniden oluşturmaya gerek yok.
-- (create or replace view, bağımlı görünümleri otomatik olarak yeni tanımla
-- kullanmaya devam ettirir.)

-- Kilitli rapor kontrolü artık EXISTS ile satır bazında yapılabildiği için
-- reports üzerinde status'a göre kısmi bir indeks işi hızlandırır: yalnızca
-- kilitli raporları içerir, dolayısıyla çok küçüktür.
create index if not exists reports_locked_idx on reports (id) where status = 'locked';
