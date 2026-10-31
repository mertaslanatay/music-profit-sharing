-- 0017 — report_rows için ISRC indeksi (faz-z5: kısıtlı kullanıcıda "Gelir türleri")
--
-- Sanatçı panelindeki Gelir türleri kartı, sanatçının şarkılarını ham
-- satırlarla ISRC üzerinden eşliyor (songs.song_key = 'isrc:' || upper(isrc)).
-- İndeks yokken her sorgu ~200 bin satırı baştan sona tarıyordu (canlıda
-- 3,9 sn). Yalnızca ekleme — hiçbir veri değişmez; iki kez çalıştırılabilir.
create index if not exists report_rows_isrc_upper_idx
  on report_rows (upper(isrc))
  where isrc is not null and isrc <> '';
