export type FieldKey =
  | "period"
  | "retailer"
  | "label"
  | "artist"
  | "album"
  | "song"
  | "isrc"
  | "territory"
  | "countryIso"
  | "assetType"
  | "salesClass"
  | "quantity"
  | "revenue"
  | "net";

export interface RawRow {
  period: string;
  retailer: string;
  label: string;
  artist: string;
  album: string;
  song: string;
  isrc: string;
  territory: string;
  countryIso: string;
  assetType: string;
  salesClass: string;
  quantity: number;
  revenue: number;
  /** Net Dollars after Fees — hesaplamanın tabanı */
  net: number;
}

export interface SplitOptions {
  comma: boolean;
  feat: boolean;
  x: boolean;
  amp: boolean;
  vs: boolean;
  slash: boolean;
}

export const DEFAULT_SPLIT: SplitOptions = {
  comma: true,
  feat: true,
  x: true,
  amp: false,
  vs: false,
  slash: false,
};

/** Bir sanatçı dizisi için özel pay dağılımı (toplamı 1 olacak şekilde normalize edilir) */
export type OverrideMap = Record<string, number[]>;

/** foldKey -> birleştirilecek hedef foldKey */
export type AliasMap = Record<string, string>;

export interface EngineConfig {
  split: SplitOptions;
  aliases: AliasMap;
  overrides: OverrideMap;
  /** Bankaya fiilen yatan tutar. null ise kesinti yok. */
  received: number | null;
}

export const DEFAULT_CONFIG: EngineConfig = {
  split: DEFAULT_SPLIT,
  aliases: {},
  overrides: {},
  received: null,
};

export interface Tally {
  [key: string]: number;
}

export interface ArtistCredit {
  /** kaynak sanatçı dizisi, örn. "Ağaçkakan, Emiladil feat. Barış Demirel" */
  artistString: string;
  songKey: string;
  song: string;
  album: string;
  label: string;
  share: number;
  position: number;
  totalArtists: number;
  gross: number;
  quantity: number;
}

export interface ArtistAgg {
  key: string;
  name: string;
  /** bu kanonik sanatçı için görülen tüm orijinal yazımlar */
  spellings: string[];
  gross: number;
  net: number;
  deduction: number;
  primaryGross: number;
  featureGross: number;
  soloGross: number;
  quantity: number;
  rowCount: number;
  songCount: number;
  territories: Tally;
  retailers: Tally;
  labels: Tally;
  /** her label için sanatçının o labeldan gelen kırılımı (ödeme listesi label filtresi) */
  labelBreakdown: Record<string, ArtistLabelSlice>;
  periods: Tally;
  songs: SongCredit[];
  collaborators: Tally;
}

/** Bir sanatçının tek bir label altındaki kırılımı. net = gross × netRate ile türetilir. */
export interface ArtistLabelSlice {
  gross: number;
  quantity: number;
  songCount: number;
  soloGross: number;
  primaryGross: number;
  featureGross: number;
  territories: Tally;
  retailers: Tally;
  /** Bu sanatçının bu labeldaki şarkılarında birlikte çalıştığı diğer sanatçılar. */
  collaborators: Tally;
}

export interface SongCredit {
  songKey: string;
  song: string;
  album: string;
  artistString: string;
  label: string;
  share: number;
  position: number;
  totalArtists: number;
  gross: number;
  quantity: number;
}

export interface SongAgg {
  key: string;
  song: string;
  album: string;
  isrc: string;
  label: string;
  artistString: string;
  primaryArtist: string;
  artists: string[];
  gross: number;
  quantity: number;
  territories: Tally;
  retailers: Tally;
}

export interface LabelAgg {
  label: string;
  gross: number;
  net: number;
  quantity: number;
  artistCount: number;
  songCount: number;
  topArtists: { name: string; gross: number }[];
}

export interface ComboAgg {
  artistString: string;
  parts: string[];
  gross: number;
  rowCount: number;
  songCount: number;
  weights: number[];
  isOverridden: boolean;
}

export interface AliasSuggestion {
  from: string;
  to: string;
  fromName: string;
  toName: string;
  fromGross: number;
  toGross: number;
  reason: string;
  score: number;
}

export interface Result {
  artists: ArtistAgg[];
  songs: SongAgg[];
  labels: LabelAgg[];
  combos: ComboAgg[];
  territories: Tally;
  retailers: Tally;
  periods: Tally;
  salesClasses: Tally;
  aliasSuggestions: AliasSuggestion[];
  totals: {
    gross: number;
    received: number;
    deduction: number;
    deductionRate: number;
    netRate: number;
    quantity: number;
    rowCount: number;
    artistCount: number;
    songCount: number;
    labelCount: number;
    territoryCount: number;
    retailerCount: number;
    negativeRows: number;
  };
}
