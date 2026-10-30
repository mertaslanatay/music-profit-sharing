import { isoFor } from "./flags";

/** ISO-3166 alpha-2 → bölge. Panelin "Bölgeler" kırılımı için; bilinmeyen = "Diğer". */
const REGION: Record<string, string> = {};
const put = (region: string, codes: string) => codes.split(" ").forEach((c) => (REGION[c] = region));

put("Türkiye", "TR");
put(
  "Avrupa",
  "AD AL AT AX BA BE BG BY CH CY CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SK SM UA VA XK"
);
put("Kuzey Amerika", "US CA MX GL BM PM");
put(
  "Latin Amerika",
  "AR BO BR CL CO CR CU DO EC SV GT HN HT JM NI PA PE PR PY UY VE TT BS BB BZ GY SR GF GP MQ AW CW KY AG DM GD KN LC VC AI VG VI TC MS BQ SX MF BL"
);
put("Orta Doğu", "AE BH IL IQ IR JO KW LB OM PS QA SA SY YE EG");
put("Kafkasya & Orta Asya", "AZ GE AM KZ KG TJ TM UZ AF");
put(
  "Asya-Pasifik",
  "AU NZ JP KR CN HK MO TW SG MY ID TH VN PH IN PK BD LK NP MM KH LA BN MN BT MV FJ PG NC PF GU WS TO"
);
put(
  "Afrika",
  "DZ AO BJ BW BF BI CV CM CF TD KM CG CD CI DJ GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW RE YT"
);

export function regionOf(territory: string): string {
  const iso = isoFor(territory);
  return (iso && REGION[iso]) || "Diğer";
}

export function isDomestic(territory: string): boolean {
  return isoFor(territory) === "TR";
}
