import * as XLSX from "@e965/xlsx";
import { autoMap, FIELDS, type ColumnMap } from "./columns";
import type { RawRow } from "./types";

export interface ParsedFile {
  headers: string[];
  matrix: unknown[][];
  map: ColumnMap;
  fileName: string;
  sheetName: string;
  sheetNames: string[];
  rowCount: number;
}

/** Sayısal alanları güvenle çözer: "1.234,56", "$12.30", "(4.50)" gibi biçimleri de anlar. */
export function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim();
  if (!s) return 0;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^0-9.,\-]/g, "");
  if (!s) return 0;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // Avrupa biçimi: 1.234,56
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // ABD biçimi: 1,234.56
    s = s.replace(/,/g, "");
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}

const str = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  return String(v).replace(/\s+/g, " ").trim();
};

/** Workbook'tan başlık + veri matrisi çıkarır; başlık satırını otomatik bulur. */
export function readWorkbook(wb: XLSX.WorkBook, fileName: string, sheetName?: string): ParsedFile {
  const sheet = sheetName ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheet];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    raw: true,
    defval: "",
  });

  // Başlık satırı: ilk 20 satır içinde en çok dolu metin hücresi olanı seç.
  let headerIdx = 0;
  let bestScore = -1;
  const limit = Math.min(20, grid.length);
  for (let i = 0; i < limit; i++) {
    const row = grid[i] ?? [];
    const filled = row.filter((c) => typeof c === "string" && c.trim().length > 0).length;
    const score = filled - (row.length - filled) * 0.1;
    if (score > bestScore) {
      bestScore = score;
      headerIdx = i;
    }
  }

  const headers = (grid[headerIdx] ?? []).map((c) => str(c));
  const matrix = grid.slice(headerIdx + 1).filter((r) => r.some((c) => str(c) !== ""));

  return {
    headers,
    matrix,
    map: autoMap(headers),
    fileName,
    sheetName: sheet,
    sheetNames: wb.SheetNames,
    rowCount: matrix.length,
  };
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  return readWorkbook(wb, file.name);
}

/** Eşlenmiş kolonlara göre matrisi tip güvenli satırlara çevirir. */
export function toRows(parsed: ParsedFile, map: ColumnMap): RawRow[] {
  const pick = (row: unknown[], key: keyof ColumnMap): unknown => {
    const idx = map[key];
    return idx === undefined ? "" : row[idx];
  };

  const out: RawRow[] = [];
  for (const row of parsed.matrix) {
    const artist = str(pick(row, "artist"));
    if (!artist) continue;
    out.push({
      period: str(pick(row, "period")),
      retailer: str(pick(row, "retailer")),
      label: str(pick(row, "label")),
      artist,
      album: str(pick(row, "album")),
      song: str(pick(row, "song")),
      isrc: str(pick(row, "isrc")),
      territory: str(pick(row, "territory")),
      countryIso: str(pick(row, "countryIso")).toUpperCase().slice(0, 2),
      assetType: str(pick(row, "assetType")),
      salesClass: str(pick(row, "salesClass")),
      quantity: toNumber(pick(row, "quantity")),
      revenue: toNumber(pick(row, "revenue")),
      net: toNumber(pick(row, "net")),
    });
  }
  return out;
}

export const FIELD_SPECS = FIELDS;
