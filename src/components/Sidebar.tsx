"use client";

import clsx from "clsx";
import Link from "next/link";
import { Icon } from "./ui";
import { NotificationBell } from "./NotificationBell";
import { LogoutButton } from "./auth/LogoutButton";

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

/** Kenar çubuğunda gösterilen kullanıcı özeti. */
export interface ViewerBadge {
  fullName: string;
  email: string;
  role: "admin" | "label_manager" | "artist" | "accountant";
  isAdmin: boolean;
}

const ROLE_TR: Record<ViewerBadge["role"], string> = {
  admin: "Yönetici",
  label_manager: "Label yöneticisi",
  artist: "Sanatçı",
  accountant: "Muhasebe",
};

export function Sidebar({
  view,
  onView,
  onReset,
  hideRules,
  viewer,
}: {
  view: ViewKey;
  onView: (v: ViewKey) => void;
  /** Yönetim ekranına git */
  onReset: () => void;
  /** Kurallar sekmesi v2'de yönetim tarafına taşındı */
  hideRules?: boolean;
  /** Oturum açık kullanıcı — auth kurulmadan önce null */
  viewer?: ViewerBadge | null;
}) {
  const items = hideRules ? NAV.filter((i) => i.key !== "rules") : NAV;
  let lastGroup = "";
  return (
    <aside className="w-[232px] shrink-0 bg-card border-r border-line flex flex-col h-full no-print">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0 p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="M4NM" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-ink-900 leading-tight tracking-tight">M4NM</p>
            <p className="text-[11px] text-ink-400 leading-tight">Pulse</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 overflow-y-auto scroll-thin">
        {items.map((item) => {
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
              </button>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-line space-y-0.5">
        {viewer && <NotificationBell />}

        {/* Yönetim yalnızca yöneticide görünür. Bu bir kolaylık; asıl engel
            sunucu tarafındaki yetki denetimidir. */}
        {(!viewer || viewer.isAdmin) && (
          <button
            type="button"
            onClick={onReset}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-ink-500 hover:bg-ink-900/[0.04] hover:text-ink-900 transition-all"
          >
            <Icon name="sliders" size={16} />
            <span className="flex-1 text-left">Yönetim</span>
            <Icon name="back" size={13} className="rotate-180 opacity-50" />
          </button>
        )}

        {viewer?.role === "artist" && (
          <Link
            href="/hesabim"
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-ink-500 hover:bg-ink-900/[0.04] hover:text-ink-900 transition-all"
          >
            <Icon name="wallet" size={16} />
            <span className="flex-1 text-left">Hesabım</span>
          </Link>
        )}

        {viewer && (
          <div className="pt-1.5 mt-1.5 border-t border-line">
            <div className="px-3 py-2">
              <p className="text-[12.5px] font-medium text-ink-900 truncate" title={viewer.email}>
                {viewer.fullName}
              </p>
              <p className="text-[11px] text-ink-400 leading-tight mt-0.5">{ROLE_TR[viewer.role]}</p>
            </div>
            <LogoutButton />
          </div>
        )}
      </div>

    </aside>
  );
}
