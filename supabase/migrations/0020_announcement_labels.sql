-- 0020 — label'a özel duyurular (faz-z15: label yöneticisi yönetim paneli)
--
-- Duyurular herkese gidiyordu. Label yöneticisi yalnızca KENDİ label'ının
-- kullanıcılarına duyuru yayınlayabilsin diye hedef label listesi eklendi.
-- Boş dizi = herkes (mevcut duyuruların hepsi böyle kalır, hiçbir şey
-- değişmez). Dolu = yalnızca o label'lara atanmış ya da hesabına bağlı
-- sanatçısı o label'larda kredisi olan kullanıcılar görür.
--
-- Yalnızca ekleme; iki kez çalıştırılabilir.
alter table announcements add column if not exists label_ids uuid[] not null default '{}';
