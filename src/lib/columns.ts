import type { FieldKey } from "./types";

export interface FieldSpec {
  key: FieldKey;
  label: string;
  hint: string;
  required: boolean;
  numeric?: boolean;
  synonyms: string[];
}

const norm = (s: string) =>
  (s ?? "")
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/**
 * Beklenen alanlar. `synonyms` normalize edilmiş (harf+rakam) biçimde karşılaştırılır,
 * böylece "Net Dollars after Fees" ile "net_dollars_after_fees" aynı sayılır.
 */
export const FIELDS: FieldSpec[] = [
  {
    key: "net",
    label: "Net Tutar",
    hint: "Hesaplamanın tabanı — Net Dollars after Fees",
    required: true,
    numeric: true,
    synonyms: [
      "netdollarsafterfees",
      "netdollars",
      "netafterfees",
      "netreceipts",
      "netrevenue",
      "netamount",
      "netpayable",
      "royaltynet",
      "nettutar",
    ],
  },
  {
    key: "artist",
    label: "Sanatçı",
    hint: "Ana sanatçı her zaman ilk sıradadır",
    required: true,
    synonyms: ["artist", "artists", "artistname", "mainartist", "performer", "sanatci", "sanatçı"],
  },
  {
    key: "song",
    label: "Şarkı",
    hint: "Parça adı",
    required: false,
    synonyms: ["song", "songtitle", "track", "tracktitle", "title", "trackname", "sarki"],
  },
  {
    key: "album",
    label: "Albüm",
    hint: "Albüm / release adı",
    required: false,
    synonyms: ["albumtitle", "album", "release", "releasetitle", "productname", "albüm"],
  },
  {
    key: "label",
    label: "Label",
    hint: "Plak şirketi — label bazlı kırılım için",
    required: false,
    synonyms: ["label", "labelname", "imprint", "recordlabel"],
  },
  {
    key: "retailer",
    label: "Platform",
    hint: "Spotify, YouTube, Apple Music…",
    required: false,
    synonyms: ["retailer", "store", "dsp", "platform", "storename", "retailername", "shop", "partner"],
  },
  {
    key: "territory",
    label: "Ülke",
    hint: "Gelirin geldiği ülke",
    required: false,
    synonyms: ["territory", "country", "countryname", "salesterritory", "region", "ulke"],
  },
  {
    key: "countryIso",
    label: "Ülke Kodu",
    hint: "ISO 2 harfli kod (bayrak için)",
    required: false,
    synonyms: [
      "retailerstmtcountryiso",
      "countryiso",
      "isocountrycode",
      "countrycode",
      "iso",
      "iso2",
      "territorycode",
    ],
  },
  {
    key: "period",
    label: "Dönem",
    hint: "Rapor dönemi",
    required: false,
    synonyms: ["period", "saleperiod", "salesperiod", "reportingperiod", "statementperiod", "month", "donem"],
  },
  {
    key: "isrc",
    label: "ISRC",
    hint: "Parça kimliği — şarkıları güvenilir eşlemek için",
    required: false,
    synonyms: ["isrc", "isrccode"],
  },
  {
    key: "quantity",
    label: "Adet",
    hint: "Stream / satış adedi",
    required: false,
    numeric: true,
    synonyms: ["quantitynet", "quantity", "netquantity", "units", "streams", "unitssold", "qty", "playcount"],
  },
  {
    key: "revenue",
    label: "Brüt Gelir",
    hint: "Kesinti öncesi tutar (bilgi amaçlı)",
    required: false,
    numeric: true,
    synonyms: ["revenueamount", "revenue", "grossrevenue", "grossamount", "receipts", "grossreceipts"],
  },
  {
    key: "assetType",
    label: "Tür",
    hint: "Track / Video / Album",
    required: false,
    synonyms: ["assettype", "type", "contenttype", "producttype"],
  },
  {
    key: "salesClass",
    label: "Gelir Tipi",
    hint: "Interactive Streaming, Download…",
    required: false,
    synonyms: ["salesclassification", "salesdescription", "salestype", "incometype", "usagetype", "revenuetype"],
  },
];

export type ColumnMap = Partial<Record<FieldKey, number>>;

/**
 * Başlık satırından otomatik kolon eşlemesi kurar.
 * Tam eşleşme önce; bulunamazsa "içerir" mantığıyla ikinci tur.
 */
export function autoMap(headers: string[]): ColumnMap {
  const normed = headers.map(norm);
  const map: ColumnMap = {};
  const taken = new Set<number>();

  for (const field of FIELDS) {
    let idx = -1;
    for (const syn of field.synonyms) {
      const i = normed.indexOf(syn);
      if (i !== -1 && !taken.has(i)) {
        idx = i;
        break;
      }
    }
    if (idx !== -1) {
      map[field.key] = idx;
      taken.add(idx);
    }
  }

  for (const field of FIELDS) {
    if (map[field.key] !== undefined) continue;
    let best = -1;
    for (let i = 0; i < normed.length; i++) {
      if (taken.has(i) || !normed[i]) continue;
      if (field.synonyms.some((syn) => normed[i].includes(syn) || syn.includes(normed[i]))) {
        best = i;
        break;
      }
    }
    if (best !== -1) {
      map[field.key] = best;
      taken.add(best);
    }
  }

  return map;
}

export function missingRequired(map: ColumnMap): FieldSpec[] {
  return FIELDS.filter((f) => f.required && map[f.key] === undefined);
}
