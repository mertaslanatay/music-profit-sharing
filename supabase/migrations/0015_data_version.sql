-- 0015 — Gösterge paneli için sürüm sayacı (data_version)
--
-- SORUN
-- -----
-- Ana sayfa her yüklemede ~23 ağır sorgu atıyor ve bunların çoğu credits
-- tablosunu baştan sona tarıyor. Mert'in üretim ölçeğinin birebir aynısı
-- (242.424 satır / 58 MB) kurulup ölçüldü:
--
--     tek gösterge paneli yüklemesi = 4171 ms
--     (ağ gecikmesi OLMAYAN yerel makinede; Supabase'de 2-4 katı)
--
-- En pahalı sorgular: şarkı dökümü 2806 ms, toplamlar 2050 ms, sanatçı-şarkı
-- dökümü 1901 ms, sanatçı dökümü 1695 ms... Tek bir suçlu yok; maliyet 23
-- sorguya yayılmış durumda. Dolayısıyla tek tek sorgu iyileştirmesi değil,
-- YAPISAL bir çözüm gerekiyor.
--
-- ÇÖZÜM
-- -----
-- Bu veri NADİREN değişiyor: 14 rapor, ayda bir yeni yükleme. Buna karşılık
-- panel sürekli okunuyor. Yani aynı sonuç defalarca yeniden hesaplanıyor.
--
-- Bu tablo tek satırlık bir SÜRÜM SAYACI tutar. Panelin sonucunu etkileyen
-- tablolardan herhangi birine yazıldığında sayaç artar. Uygulama tarafı
-- (src/lib/dashboardCache.ts) sonucu bu sayaçla birlikte saklar; bir sonraki
-- istekte önce sayacı okur (tek satır, birincil anahtar araması — mikrosaniye
-- mertebesinde) ve DEĞİŞMEMİŞSE 23 sorguyu hiç çalıştırmadan saklı sonucu
-- döndürür.
--
-- NEDEN BAYAT VERİ RİSKİ YOK: klasik önbellekler "şu kadar saniye eski veri
-- göster" der. Burada öyle bir şey yok — veri değiştiği ANDA sayaç artar ve
-- saklı sonuç geçersiz olur. Yani hız kazanırken doğruluktan hiçbir şey
-- vermiyoruz. Bir rapor yayınlandığı anda panel yeni rakamları gösterir.
--
-- BİLİNÇLİ TAVİZ: sayaç tek bir satır olduğu için, uzun süren bir yükleme
-- işlemi (transaction) o satırın kilidini commit'e kadar tutar; bu sırada
-- AYNI dokuz tablodan birine yazmak isteyen BAŞKA bir işlem bekler. Bu
-- uygulamada yazma işlemleri seyrek ve tek yöneticili olduğu için kabul
-- edilebilir bir taviz. Eşzamanlı yükleme ihtiyacı doğarsa sayaç, tek satır
-- yerine ekleme-tabanlı bir yapıya çevrilmelidir.
--
-- TETİKLEYİCİLER SATIR BAZINDA DEĞİL DEYİM (STATEMENT) BAZINDA: 242 bin
-- satırlık bir yükleme yapıldığında tetikleyici 242 bin kez değil, BİR kez
-- çalışır. Yükleme hızına etkisi ölçülemeyecek kadar küçüktür.

create table if not exists data_version (
  id smallint primary key default 1,
  v  bigint   not null default 1,
  at timestamptz not null default now(),
  constraint data_version_tek_satir check (id = 1)
);

insert into data_version (id, v) values (1, 1) on conflict (id) do nothing;

create or replace function bump_data_version() returns trigger as $$
begin
  update data_version set v = v + 1, at = now() where id = 1;
  return null;
end $$ language plpgsql;

-- Panelin sonucunu etkileyen HER tablo. Biri unutulursa panel bayat veri
-- gösterirdi; bu yüzden liste loadResult'ın gerçekten okuduğu tablolardan
-- (artists, labels, periods, report_rows, reports, songs) ve
-- v_credits_effective'in altındaki kaynaklardan (credits, revenue_transfers,
-- song_splits) çıkarıldı.
do $$
declare
  t text;
  tablolar text[] := array[
    'credits', 'reports', 'report_rows', 'periods',
    'artists', 'labels', 'songs',
    'revenue_transfers', 'song_splits'
  ];
begin
  foreach t in array tablolar loop
    if to_regclass('public.' || t) is null then
      continue; -- tablo henüz yoksa (eski şema) sessizce atla
    end if;
    execute format('drop trigger if exists %I on %I', 'bump_dv_' || t, t);
    execute format(
      'create trigger %I after insert or update or delete on %I ' ||
      'for each statement execute function bump_data_version()',
      'bump_dv_' || t, t);
    execute format('drop trigger if exists %I on %I', 'bump_dv_trunc_' || t, t);
    execute format(
      'create trigger %I after truncate on %I ' ||
      'for each statement execute function bump_data_version()',
      'bump_dv_trunc_' || t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- dashboard_cache — PAYLAŞIMLI (sunucular arası) önbellek
-- ---------------------------------------------------------------------------
--
-- Bellek içi önbellek tek başına yetmez: Vercel'de her sunucusuz örneğin kendi
-- belleği vardır ve düşük trafikte çoğu istek "soğuk" bir örneğe düşer — yani
-- kullanıcı 4 saniyelik hesaplamayı yine bekler. Bu tablo sonucu VERİTABANINDA
-- tutar, böylece hangi örneğe düşerse düşsün hazır sonucu bulur.
--
-- Anahtar, kullanıcının yetki kapsamını da içerir (bkz. dashboardCache.ts:
-- scopeKey) — farklı yetkideki kullanıcılar asla aynı satırı paylaşmaz.
--
-- payload gzip'li tutulur: ham JSON 809 KB, gzip'li 208 KB. Bu, Supabase ile
-- uygulama arasındaki aktarımı dörtte bire indirir.
--
-- DİKKAT: bu tabloya data_version tetikleyicisi KURULMAZ. Kurulsaydı önbelleğe
-- her yazma sürümü artırır ve önbelleği anında kendi kendine geçersiz kılardı.
create table if not exists dashboard_cache (
  key     text   primary key,
  v       bigint not null,
  payload bytea  not null,
  at      timestamptz not null default now()
);
