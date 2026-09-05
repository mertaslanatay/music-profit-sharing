-- 0006 — Sanatçı ayrıştırma belirteçleri (M4NM Pulse § 4)
--
-- Belirteçler ("feat.", ",", "x", "&"…) bugüne kadar koda gömülü regex'lerdi;
-- yalnızca AÇIK/KAPALI durumları engine_rules.split jsonb'sinde tutuluyordu.
-- Yönetici yeni bir belirteç ekleyemiyor, mevcut olanı düzenleyemiyordu.
-- Bu migration belirteçlerin kendisini veriye taşır.
--
-- ÖNEMLİ: Tohum verisi, koddaki eski davranışla BİREBİR aynı sonucu üretecek
-- şekilde seçilmiştir (comma/feat/x açık; &, /, vs kapalı). Yani bu migration
-- tek başına hiçbir raporun ayrıştırmasını değiştirmez.

create table if not exists artist_separators (
  id          uuid primary key default gen_random_uuid(),
  -- Belirtecin kendisi: "feat", "x", ",", "&"
  token       text not null,
  -- word   → yalnızca boşlukla çevriliyse ayırır ("Cxngxvxr" bölünmez),
  --          sondaki nokta isteğe bağlıdır ("feat" → "feat." de yakalanır)
  -- symbol  → çevresinde boşluk olmasa da ayırır
  kind        text not null default 'word' check (kind in ('word', 'symbol')),
  is_active   boolean not null default true,
  -- Uygulanma sırası; küçük olan önce. Çok kelimeli belirteçler virgülden önce.
  sort        integer not null default 100,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references users(id) on delete set null
);

-- Aynı belirteç iki kez tanımlanamaz (büyük/küçük harf farkı da sayılmaz).
create unique index if not exists artist_separators_token_uq
  on artist_separators (lower(token));

create index if not exists artist_separators_active_idx
  on artist_separators (is_active, sort);

-- Tohum: koddaki DEFAULT_SEPARATORS ile birebir aynı.
insert into artist_separators (token, kind, is_active, sort) values
  ('feat',      'word',   true,  10),
  ('featuring', 'word',   true,  11),
  ('ft',        'word',   true,  12),
  ('with',      'word',   true,  13),
  ('vs',        'word',   false, 20),
  ('versus',    'word',   false, 21),
  ('x',         'word',   true,  30),
  ('&',         'symbol', false, 40),
  ('/',         'symbol', false, 50),
  (',',         'symbol', true,  60)
on conflict do nothing;

-- Eğer bu kurulumda engine_rules'ta AKTİF bir kural seti varsa ve oradaki
-- bayraklar varsayılandan farklıysa, tohumun aktiflik durumunu ona uydur —
-- böylece daha önce "&" açılmış bir kurulum migration'dan sonra da aynı
-- şekilde ayrıştırmaya devam eder.
do $$
declare
  s jsonb;
begin
  select split into s from engine_rules where is_active limit 1;
  if s is null then
    return;
  end if;

  if s ? 'feat' then
    update artist_separators set is_active = (s->>'feat')::boolean
     where token in ('feat', 'featuring', 'ft', 'with');
  end if;
  if s ? 'vs' then
    update artist_separators set is_active = (s->>'vs')::boolean
     where token in ('vs', 'versus');
  end if;
  if s ? 'x' then
    update artist_separators set is_active = (s->>'x')::boolean where token = 'x';
  end if;
  if s ? 'amp' then
    update artist_separators set is_active = (s->>'amp')::boolean where token = '&';
  end if;
  if s ? 'slash' then
    update artist_separators set is_active = (s->>'slash')::boolean where token = '/';
  end if;
  if s ? 'comma' then
    update artist_separators set is_active = (s->>'comma')::boolean where token = ',';
  end if;
end $$;
