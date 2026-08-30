"use client";

import clsx from "clsx";
import { Icon } from "./ui";

export type ViewKey =
  | "overview"
  | "payouts"
  | "songs"
  | "labels"
  | "geo"
  | "platforms"
  | "rules";

export const NAV: { key: ViewKey; label: string; icon: string; group: string }[] = [
  { key: "overview", label: "Panel", icon: "dashboard", group: "Analiz" },
  { key: "payouts", label: "Ödeme Listesi", icon: "wallet", group: "Analiz" },
  { key: "songs", label: "Şarkılar", icon: "music", group: "Analiz" },
  { key: "labels", label: "Label", icon: "tag", group: "Analiz" },
  { key: "geo", label: "Coğrafya", icon: "globe", group: "Analiz" },
  { key: "platforms", label: "Platformlar", icon: "play", group: "Analiz" },
  { key: "rules", label: "Kurallar", icon: "sliders", group: "Ayarlar" },
];

export function Sidebar({
  view,
  onView,
  fileName,
  artistCount,
  onReset,
  ruleBadge,
}: {
  view: ViewKey;
  onView: (v: ViewKey) => void;
  fileName?: string;
  artistCount?: number;
  onReset: () => void;
  ruleBadge?: number;
}) {
  let lastGroup = "";
  return (
    <aside className="w-[232px] shrink-0 bg-card border-r border-line flex flex-col h-full no-print">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-brand-500 flex items-center justify-center shrink-0">
            <Icon name="music" size={18} className="text-white" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-ink-900 leading-tight">Hakediş</p>
            <p className="text-[11px] text-ink-400 leading-tight">Gelir dağılımı</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 overflow-y-auto scroll-thin">
        {NAV.map((item) => {
          const showGroup = item.group !== lastGroup;
          lastGroup = item.group;
          const active = view === item.key;
          return (
            <div key={item.key}>
              {showGroup && (
                <p className="px-3 pt-4 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-300">
                  {item.group}
                </p>
              )}
              <button
                type="button"
                onClick={() => onView(item.key)}
                className={clsx(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all mb-0.5",
                  active
                    ? "bg-brand-500 text-white shadow-sm"
                    : "text-ink-500 hover:bg-ink-900/[0.04] hover:text-ink-900"
                )}
              >
                <Icon name={item.icon} size={17} strokeWidth={active ? 2 : 1.8} />
                <span className="flex-1 text-left">{item.label}</span>
                {item.key === "rules" && ruleBadge ? (
                  <span
                    className={clsx(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                      active ? "bg-white/25 text-white" : "bg-accent-amber/15 text-accent-amber"
                    )}
                  >
                    {ruleBadge}
                  </span>
                ) : null}
              </button>
            </div>
          );
        })}
      </nav>

      {fileName && (
        <div className="p-3 border-t border-line">
          <div className="rounded-xl bg-ink-900/[0.03] p-3">
            <div className="flex items-start gap-2">
              <Icon name="file" size={15} className="text-ink-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-medium text-ink-700 truncate" title={fileName}>
                  {fileName}
                </p>
                <p className="text-[11px] text-ink-400 mt-0.5">{artistCount ?? 0} sanatçı</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onReset}
              className="mt-2.5 w-full text-[11.5px] font-medium text-ink-500 hover:text-accent-rose transition-colors text-left"
            >
              Yeni dosya yükle →
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
