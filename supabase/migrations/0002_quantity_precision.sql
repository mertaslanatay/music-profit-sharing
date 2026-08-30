-- =====================================================================
-- 0002 — quantity hassasiyeti
--
-- Sorun: credits.quantity = satır adedi × bölüşüm payı. 1/3 gibi paylarda
-- 6 ondalık yeterli değil; 20 bin satır toplanınca 1.286.190 stream
-- 1.286.189,999671 çıkıyordu.
--
-- Çözüm: para alanlarıyla aynı hassasiyet (12 ondalık). Sapma 1e-9 altına iner.
-- =====================================================================

-- Postgres, görünümün bağımlı olduğu bir kolonun tipini değiştirmeye izin
-- vermiyor. Önce görünümleri düşürüp sonra aynen geri kuruyoruz.
drop view if exists v_artist_period_label;
drop view if exists v_period_totals;
drop view if exists v_year_totals;
drop view if exists v_artist_alltime;
drop view if exists v_label_alltime;

alter table credits      alter column quantity type numeric(24,12);
alter table report_rows  alter column quantity type numeric(24,12);

-- Görünümler aynen geri (tanım değişmedi).
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
