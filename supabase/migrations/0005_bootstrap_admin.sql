-- =====================================================================
-- 0005 — İlk yönetici
--
-- Tavuk-yumurta sorunu: kayıtları yönetici onaylar, ama ilk yönetici
-- kimi bekleyecek? Bu yüzden profil önceden, ONAYLI olarak yazılır.
-- auth_id boş bırakılır; Supabase Auth'ta aynı e-postayla kayıt olup
-- e-postanı doğrulayınca sistem iki kaydı ilk girişte kendisi bağlar
-- (session.ts içindeki bağlama adımı).
--
-- BAŞKA BİR E-POSTA KULLANACAKSAN aşağıdaki adresi değiştir.
-- =====================================================================

insert into users (email, first_name, last_name, role, status,
                   kvkk_consent_at, approved_at)
values ('mertaslanatay@gmail.com', 'Mert', 'Aslanatay',
        'admin', 'active', now(), now())
on conflict do nothing;

-- E-posta zaten varsa yönetici yap (tekrar çalıştırmak güvenli olsun).
update users
   set role = 'admin', status = 'active', approved_at = coalesce(approved_at, now())
 where lower(email) = 'mertaslanatay@gmail.com';
