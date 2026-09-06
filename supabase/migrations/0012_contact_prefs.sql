-- İletişim tercihleri: hangi olaylarda e-posta bildirimi istendiği.
-- Varsayılan FALSE — bu e-postalar yeni bir davranış; mevcut kullanıcılara
-- kendileri açana kadar hiçbir ek e-posta gitmez (uygulama içi bildirimler
-- zaten değişmeden devam ediyor).
alter table users add column if not exists notify_email_support boolean not null default false;
alter table users add column if not exists notify_email_payout boolean not null default false;
alter table users add column if not exists notify_email_announcement boolean not null default false;
