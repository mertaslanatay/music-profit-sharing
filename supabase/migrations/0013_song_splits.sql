-- 0013 — Şarkı bazlı KALICI bölüşüm düzenleme (M4NM Pulse, şartname sonrası madde 5)
--
-- KURAL: credits tablosu (orijinal ingest verisi) ASLA değişmez — 0009'daki
-- gelir devriyle aynı felsefe. Kalıcı düzeltme ayrı bir tabloda ("niyet"
-- olarak) durur ve okuma anında credits'in ÜZERİNE uygulanır.
--
-- FARK (revenue_transfers'tan): gelir devri GEÇİCİ ve DÖNEM BAZLIDIR (tek
-- bir rapor+dönem için "payımın şu kadarını devret"). song_splits ise
-- KALICI ve ŞARKI BAZLIDIR — "bu şarkının doğru sahiplik yapısı budur, ileri
-- geri her rapor ve dönemde böyle olsun" der. İkisi birlikte, katman katman
-- çalışır:
--
--   credits (ham, değişmez)
--     -> v_credits_split   (song_splits varsa payları yeniden dağıtır)
--     -> v_credits_effective (revenue_transfers varsa üzerine devirleri uygular)
--
-- Üç sonucu var:
--   • Kilitli (locked) rapor/dönemler HİÇ etkilenmez — v_credits_split
--     kilitli raporlarda ham credits'i aynen döndürür. "Zaten ödenmiş dönem
--     asla değişmez" kuralı böylece yapısal.
--   • Yayındaki (draft + published, yani kilitsiz) dönemler ANINDA yeniden
--     hesaplanır — ayrı bir "yeniden hesaplama" işi yok, sayı zaten bu
--     görünümden okunuyor.
--   • quantity (dinlenme) da gross gibi yeni paya göre dağılır — ingest.ts'te
--     ilk hesaplamayla AYNI mantık (bkz. flattenCredits: gross = net*share,
--     quantity = qty*share). Bu revenue_transfers'tan BİLİNÇLİ bir farktır:
--     orada quantity devredilmez (geçici bir para devri, performans devri
--     değil), burada devredilir (kalıcı bir roster düzeltmesi — sanki ingest
--     en başından bu roster ile yapılmış gibi davranmalı).

create table if not exists song_splits (
  id          uuid primary key default gen_random_uuid(),
  song_id     uuid not null references songs(id) on delete cascade,
  artist_id   uuid not null references artists(id) on delete restrict,
  share       numeric(14,12) not null check (share > 0 and share <= 1),
  position    smallint not null default 0,
  created_at  timestamptz not null default now(),
  updated_by  uuid references users(id) on delete set null,
  unique (song_id, artist_id)
);
create index if not exists song_splits_song_idx on song_splits (song_id);

-- ---------------------------------------------------------------------------
-- Toplam-1 koruması
-- ---------------------------------------------------------------------------
--
-- Uygulama zaten sum(share)==1 olduğunu kontrol edip tek transaction'da
-- "hepsini sil, hepsini yeniden yaz" yapıyor — ama bu ikinci savunma hattı:
-- Supabase panelinden elle yapılan bir INSERT/UPDATE/DELETE de aynı kurala
-- tabi. DEFERRED CONSTRAINT TRIGGER kullanıyoruz çünkü kontrol satır bazında
-- değil "bu şarkının TÜM satırları" bazında yapılmalı — transaction ortasında
-- (sil+ekle arasında) toplam geçici olarak 1'den farklı görünür, bu normaldir
-- ve COMMIT anına kadar ertelenir.
--
-- NOT: PostgreSQL'de CONSTRAINT TRIGGER, transition table'ları (REFERENCING
-- NEW/OLD TABLE) DESTEKLEMEZ — bu yüzden FOR EACH ROW kullanılıyor (transition
-- table olmadan). Aynı şarkı için birden fazla satır değiştiğinde kontrol
-- birkaç kez tekrarlanır ama COMMIT anında hep GÜNCEL toplamı okuduğu için
-- sonuç aynı ve doğrudur — sadece hafifçe fazladan iş, zararsız.

create or replace function song_splits_sum_guard() returns trigger as $$
declare
  sid uuid;
  toplam numeric;
begin
  sid := coalesce(new.song_id, old.song_id);
  select coalesce(sum(share), 0) into toplam from song_splits where song_id = sid;
  -- toplam = 0: şarkının artık özel bir bölüşümü kalmadı (hepsi silindi) —
  -- geçerli bir durum, view otomatik olarak ham credits'e döner.
  if toplam <> 0 and abs(toplam - 1) > 1e-6 then
    raise exception
      'Şarkı bölüşüm toplamı 1 olmalı (şarkı: %, toplam: %)', sid, toplam
      using errcode = 'check_violation';
  end if;
  return null;
end $$ language plpgsql;

drop trigger if exists song_splits_sum_guard_trg on song_splits;
create constraint trigger song_splits_sum_guard_trg
  after insert or update or delete on song_splits
  deferrable initially deferred
  for each row execute function song_splits_sum_guard();

-- ---------------------------------------------------------------------------
-- v_credits_split — credits + song_splits
-- ---------------------------------------------------------------------------
--
-- Bir şarkı için song_splits'te geçerli (toplamı 1 olan) satır YOKSA, ya da
-- rapor 'locked' İSE: ham credits satırı AYNEN geçer (no-op).
--
-- Geçerliyse VE rapor 'locked' DEĞİLSE: aynı (rapor, dönem, şarkı, label,
-- ülke, satıcı) grubundaki TÜM orijinal satırların gross/quantity toplamı
-- alınır (bu, o "ham satırın" toplam net'ini/adedini geri verir — çünkü
-- orijinal share'ler zaten 1'e tamamlanıyordu) ve YENİ paylara göre yeniden
-- dağıtılır. territory/retailer kırılımı böylece bozulmadan korunur.

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
select
  c.id, c.report_id, c.period_id, c.artist_id, c.song_id, c.label_id,
  c.share, c.position, c.total_artists, c.gross, c.quantity, c.territory, c.retailer
from credits c
left join active  a on a.song_id  = c.song_id
left join reports r on r.id       = c.report_id
where a.song_id is null   -- şarkının geçerli bir özel bölüşümü yok → aynen geç
   or r.status = 'locked' -- kilitli rapor → aynen geç, song_splits yok sayılır

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

-- ---------------------------------------------------------------------------
-- v_credits_effective — artık credits DEĞİL, v_credits_split üzerine kurulu
-- ---------------------------------------------------------------------------
--
-- Sütun listesi ve ifadeler 0009 ile BİREBİR AYNI — tek fark kaynak tablo.
-- Böylece revenue_transfers, v_artist_period_net ve bunlara bağlı her şey
-- (songPeriodDetail, ödeme zinciri, sanatçı portalı) değişmeden çalışmaya
-- devam eder; yalnızca altlarındaki veri artık song_splits'i de hesaba katar.

create or replace view v_credits_effective as
with t as (
  select report_id, period_id, song_id, from_artist_id, sum(ratio) as ratio
  from revenue_transfers
  where status = 'active'
  group by report_id, period_id, song_id, from_artist_id
)
select
  c.id, c.report_id, c.period_id, c.artist_id, c.song_id, c.label_id,
  (c.share * (1 - coalesce(t.ratio, 0)))::numeric(14,12) as share,
  c.position, c.total_artists,
  (c.gross * (1 - coalesce(t.ratio, 0)))::numeric(24,12) as gross,
  c.quantity,
  c.territory, c.retailer,
  false as is_transfer
from v_credits_split c
left join t
  on  t.report_id      = c.report_id
  and t.period_id      = c.period_id
  and t.song_id        = c.song_id
  and t.from_artist_id = c.artist_id

union all

select
  c.id, c.report_id, c.period_id, rt.to_artist_id as artist_id, c.song_id, c.label_id,
  (c.share * rt.ratio)::numeric(14,12) as share,
  c.position, c.total_artists,
  (c.gross * rt.ratio)::numeric(24,12) as gross,
  0::numeric(24,12) as quantity,
  c.territory, c.retailer,
  true as is_transfer
from v_credits_split c
join revenue_transfers rt
  on  rt.status         = 'active'
  and rt.report_id      = c.report_id
  and rt.period_id      = c.period_id
  and rt.song_id        = c.song_id
  and rt.from_artist_id = c.artist_id;
