/** Ülke adı → ISO-3166 alpha-2. Rapordaki Territory sütunu tam ad içerir. */
const MAP: Record<string, string> = {
  afghanistan: "AF", "aland islands": "AX", albania: "AL", algeria: "DZ", "american samoa": "AS",
  andorra: "AD", angola: "AO", anguilla: "AI", antarctica: "AQ", "antigua and barbuda": "AG",
  argentina: "AR", armenia: "AM", aruba: "AW", australia: "AU", austria: "AT", azerbaijan: "AZ",
  bahamas: "BS", bahrain: "BH", bangladesh: "BD", barbados: "BB", belarus: "BY", belgium: "BE",
  belize: "BZ", benin: "BJ", bermuda: "BM", bhutan: "BT", bolivia: "BO",
  "bosnia and herzegovina": "BA", botswana: "BW", brazil: "BR", "brunei darussalam": "BN",
  brunei: "BN", bulgaria: "BG", "burkina faso": "BF", burundi: "BI", "cabo verde": "CV",
  "cape verde": "CV", cambodia: "KH", cameroon: "CM", canada: "CA", "cayman islands": "KY",
  "central african republic": "CF", chad: "TD", chile: "CL", china: "CN", colombia: "CO",
  comoros: "KM", congo: "CG", "democratic republic of the congo": "CD", "congo, the democratic republic of the": "CD",
  "cook islands": "CK", "costa rica": "CR", "cote d'ivoire": "CI", "côte d'ivoire": "CI",
  "ivory coast": "CI", croatia: "HR", cuba: "CU", curacao: "CW", "curaçao": "CW", cyprus: "CY",
  "czech republic": "CZ", czechia: "CZ", denmark: "DK", djibouti: "DJ", dominica: "DM",
  "dominican republic": "DO", ecuador: "EC", egypt: "EG", "el salvador": "SV",
  "equatorial guinea": "GQ", eritrea: "ER", estonia: "EE", eswatini: "SZ", swaziland: "SZ",
  ethiopia: "ET", "faroe islands": "FO", fiji: "FJ", finland: "FI", france: "FR",
  "french guiana": "GF", "french polynesia": "PF", gabon: "GA", gambia: "GM", georgia: "GE",
  germany: "DE", ghana: "GH", gibraltar: "GI", greece: "GR", greenland: "GL", grenada: "GD",
  guadeloupe: "GP", guam: "GU", guatemala: "GT", guernsey: "GG", guinea: "GN",
  "guinea-bissau": "GW", guyana: "GY", haiti: "HT", honduras: "HN", "hong kong": "HK",
  hungary: "HU", iceland: "IS", india: "IN", indonesia: "ID", iran: "IR",
  "iran, islamic republic of": "IR", iraq: "IQ", ireland: "IE", "isle of man": "IM",
  israel: "IL", italy: "IT", jamaica: "JM", japan: "JP", jersey: "JE", jordan: "JO",
  kazakhstan: "KZ", kenya: "KE", kiribati: "KI", kosovo: "XK", kuwait: "KW", kyrgyzstan: "KG",
  laos: "LA", "lao people's democratic republic": "LA", latvia: "LV", lebanon: "LB",
  lesotho: "LS", liberia: "LR", libya: "LY", liechtenstein: "LI", lithuania: "LT",
  luxembourg: "LU", macao: "MO", macau: "MO", madagascar: "MG", malawi: "MW", malaysia: "MY",
  maldives: "MV", mali: "ML", malta: "MT", "marshall islands": "MH", martinique: "MQ",
  mauritania: "MR", mauritius: "MU", mayotte: "YT", mexico: "MX", micronesia: "FM",
  moldova: "MD", "moldova, republic of": "MD", monaco: "MC", mongolia: "MN", montenegro: "ME",
  montserrat: "MS", morocco: "MA", mozambique: "MZ", myanmar: "MM", burma: "MM", namibia: "NA",
  nauru: "NR", nepal: "NP", netherlands: "NL", "new caledonia": "NC", "new zealand": "NZ",
  nicaragua: "NI", niger: "NE", nigeria: "NG", niue: "NU", "north macedonia": "MK",
  macedonia: "MK", "northern mariana islands": "MP", norway: "NO", oman: "OM", pakistan: "PK",
  palau: "PW", palestine: "PS", "palestine, state of": "PS", panama: "PA",
  "papua new guinea": "PG", paraguay: "PY", peru: "PE", philippines: "PH", poland: "PL",
  portugal: "PT", "puerto rico": "PR", qatar: "QA", reunion: "RE", "réunion": "RE",
  romania: "RO", "russian federation": "RU", russia: "RU", rwanda: "RW",
  "saint kitts and nevis": "KN", "saint lucia": "LC", "saint martin": "MF",
  "saint vincent and the grenadines": "VC", samoa: "WS", "san marino": "SM",
  "sao tome and principe": "ST", "saudi arabia": "SA", senegal: "SN", serbia: "RS",
  seychelles: "SC", "sierra leone": "SL", singapore: "SG", "sint maarten": "SX",
  slovakia: "SK", slovenia: "SI", "solomon islands": "SB", somalia: "SO", "south africa": "ZA",
  "south korea": "KR", "korea, republic of": "KR", korea: "KR", "south sudan": "SS",
  spain: "ES", "sri lanka": "LK", sudan: "SD", suriname: "SR", sweden: "SE",
  switzerland: "CH", syria: "SY", "syrian arab republic": "SY", taiwan: "TW",
  "taiwan, province of china": "TW", tajikistan: "TJ", tanzania: "TZ",
  "tanzania, united republic of": "TZ", thailand: "TH", "timor-leste": "TL", "east timor": "TL",
  togo: "TG", tonga: "TO", "trinidad and tobago": "TT", tunisia: "TN", turkey: "TR",
  turkiye: "TR", "türkiye": "TR", turkmenistan: "TM", "turks and caicos islands": "TC",
  tuvalu: "TV", uganda: "UG", ukraine: "UA", "united arab emirates": "AE",
  "united kingdom": "GB", uk: "GB", "great britain": "GB", "united states": "US",
  "united states of america": "US", usa: "US", uruguay: "UY", uzbekistan: "UZ", vanuatu: "VU",
  "vatican city": "VA", venezuela: "VE", vietnam: "VN", "viet nam": "VN",
  "virgin islands, british": "VG", "british virgin islands": "VG", "virgin islands, u.s.": "VI",
  "u.s. virgin islands": "VI", yemen: "YE", zambia: "ZM", zimbabwe: "ZW",
};

export function isoFor(territory: string): string | null {
  if (!territory) return null;
  const k = territory.trim().toLowerCase();
  if (MAP[k]) return MAP[k];
  const stripped = k.replace(/^the\s+/, "").replace(/\s*\(.*\)\s*$/, "").trim();
  return MAP[stripped] ?? null;
}

/** ISO kodunu bayrak emojisine çevirir (regional indicator sembolleri). */
export function flagOf(territory: string): string {
  const iso = isoFor(territory);
  if (!iso || iso.length !== 2 || iso === "XK") return "\u{1F310}";
  const A = 0x1f1e6;
  return String.fromCodePoint(A + (iso.charCodeAt(0) - 65), A + (iso.charCodeAt(1) - 65));
}
