-- İletişim numarası: kayıt ekranına eklendi, ülke bazında saklanır.
-- phone_country: ISO-2 ülke kodu (ör. "TR"); phone: yalnızca rakamlar,
-- başındaki sıfır atılmış ulusal numara (dial kodu countries.ts'ten
-- ülkeye göre türetilir, ayrıca saklanmaz).
alter table users add column if not exists phone text;
alter table users add column if not exists phone_country text;
