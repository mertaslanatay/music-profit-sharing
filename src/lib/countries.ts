/**
 * Kayıt ve iletişim tercihleri ekranlarında kullanılan ülke/telefon kodu
 * listesi. Sunucu tarafında da doğrulama için kullanılır (register API),
 * bu yüzden "use client" YOK — hem client hem server bileşenlerinden
 * import edilebilir olmalı.
 */
export type Country = { code: string; name: string; dial: string };

export const COUNTRIES: Country[] = [
  { code: "TR", name: "Türkiye", dial: "+90" },
  { code: "US", name: "Amerika Birleşik Devletleri", dial: "+1" },
  { code: "GB", name: "Birleşik Krallık", dial: "+44" },
  { code: "DE", name: "Almanya", dial: "+49" },
  { code: "NL", name: "Hollanda", dial: "+31" },
  { code: "FR", name: "Fransa", dial: "+33" },
  { code: "BE", name: "Belçika", dial: "+32" },
  { code: "AT", name: "Avusturya", dial: "+43" },
  { code: "CH", name: "İsviçre", dial: "+41" },
  { code: "SE", name: "İsveç", dial: "+46" },
  { code: "NO", name: "Norveç", dial: "+47" },
  { code: "DK", name: "Danimarka", dial: "+45" },
  { code: "FI", name: "Finlandiya", dial: "+358" },
  { code: "IE", name: "İrlanda", dial: "+353" },
  { code: "ES", name: "İspanya", dial: "+34" },
  { code: "PT", name: "Portekiz", dial: "+351" },
  { code: "IT", name: "İtalya", dial: "+39" },
  { code: "GR", name: "Yunanistan", dial: "+30" },
  { code: "PL", name: "Polonya", dial: "+48" },
  { code: "CZ", name: "Çekya", dial: "+420" },
  { code: "RO", name: "Romanya", dial: "+40" },
  { code: "BG", name: "Bulgaristan", dial: "+359" },
  { code: "HU", name: "Macaristan", dial: "+36" },
  { code: "RU", name: "Rusya", dial: "+7" },
  { code: "UA", name: "Ukrayna", dial: "+380" },
  { code: "AZ", name: "Azerbaycan", dial: "+994" },
  { code: "GE", name: "Gürcistan", dial: "+995" },
  { code: "AM", name: "Ermenistan", dial: "+374" },
  { code: "CY", name: "Kıbrıs", dial: "+357" },
  { code: "AE", name: "Birleşik Arap Emirlikleri", dial: "+971" },
  { code: "SA", name: "Suudi Arabistan", dial: "+966" },
  { code: "QA", name: "Katar", dial: "+974" },
  { code: "KW", name: "Kuveyt", dial: "+965" },
  { code: "IL", name: "İsrail", dial: "+972" },
  { code: "EG", name: "Mısır", dial: "+20" },
  { code: "MA", name: "Fas", dial: "+212" },
  { code: "ZA", name: "Güney Afrika", dial: "+27" },
  { code: "NG", name: "Nijerya", dial: "+234" },
  { code: "IN", name: "Hindistan", dial: "+91" },
  { code: "PK", name: "Pakistan", dial: "+92" },
  { code: "CN", name: "Çin", dial: "+86" },
  { code: "JP", name: "Japonya", dial: "+81" },
  { code: "KR", name: "Güney Kore", dial: "+82" },
  { code: "SG", name: "Singapur", dial: "+65" },
  { code: "AU", name: "Avustralya", dial: "+61" },
  { code: "NZ", name: "Yeni Zelanda", dial: "+64" },
  { code: "CA", name: "Kanada", dial: "+1" },
  { code: "MX", name: "Meksika", dial: "+52" },
  { code: "BR", name: "Brezilya", dial: "+55" },
  { code: "AR", name: "Arjantin", dial: "+54" },
];

export const DEFAULT_COUNTRY = "TR";

export function countryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

/** Serbest metni yalnızca rakamlara indirger, baştaki sıfırları atar. */
export function normalizePhoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.replace(/^0+/, "");
}

export function isValidPhoneDigits(digits: string): boolean {
  return digits.length >= 6 && digits.length <= 14;
}
