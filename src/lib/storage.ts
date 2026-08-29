import type { EngineConfig, Result } from "./types";
import { DEFAULT_CONFIG } from "./types";

const CONFIG_KEY = "mgd:config:v1";
const SNAP_KEY = "mgd:snapshots:v1";

export interface Snapshot {
  id: string;
  name: string;
  savedAt: number;
  fileName: string;
  gross: number;
  received: number;
  deduction: number;
  rowCount: number;
  artists: { name: string; gross: number; net: number }[];
  labels: { label: string; gross: number }[];
  retailers: Record<string, number>;
  territories: Record<string, number>;
}

const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export function loadConfig(): EngineConfig {
  return safe(() => {
    if (typeof window === "undefined") return DEFAULT_CONFIG;
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw) as Partial<EngineConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      split: { ...DEFAULT_CONFIG.split, ...(parsed.split ?? {}) },
      aliases: parsed.aliases ?? {},
      overrides: parsed.overrides ?? {},
    };
  }, DEFAULT_CONFIG);
}

export function saveConfig(cfg: EngineConfig): void {
  safe(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  }, undefined);
}

export function listSnapshots(): Snapshot[] {
  return safe(() => {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(SNAP_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as Snapshot[];
    return Array.isArray(arr) ? arr.sort((a, b) => b.savedAt - a.savedAt) : [];
  }, []);
}

export function saveSnapshot(name: string, fileName: string, res: Result): Snapshot | null {
  return safe(() => {
    if (typeof window === "undefined") return null;
    const snap: Snapshot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      savedAt: Date.now(),
      fileName,
      gross: res.totals.gross,
      received: res.totals.received,
      deduction: res.totals.deduction,
      rowCount: res.totals.rowCount,
      artists: res.artists.map((a) => ({ name: a.name, gross: a.gross, net: a.net })),
      labels: res.labels.map((l) => ({ label: l.label, gross: l.gross })),
      retailers: res.retailers,
      territories: res.territories,
    };
    const all = [snap, ...listSnapshots()].slice(0, 24);
    window.localStorage.setItem(SNAP_KEY, JSON.stringify(all));
    return snap;
  }, null);
}

export function deleteSnapshot(id: string): void {
  safe(() => {
    if (typeof window === "undefined") return;
    const all = listSnapshots().filter((s) => s.id !== id);
    window.localStorage.setItem(SNAP_KEY, JSON.stringify(all));
  }, undefined);
}
