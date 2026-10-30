"use client";

import clsx from "clsx";
import Link from "next/link";
import { Icon } from "./ui";
import { LogoutButton } from "./auth/LogoutButton";
import type { ViewerBadge } from "./Sidebar";
import { Logo, ThemeToggle } from "./theme";

const ROLE_TR: Record<ViewerBadge["role"], string> = {
  admin: "Yönetici",
  label_manager: "Label yöneticisi",
  artist: "Sanatçı",
  accountant: "Muhasebe",
};

export interface AdminTabDef {
  key: string;
  label: string;
  icon: string;
  badge?: number;
}

/** Yönetim ekranının kenar çubuğu — ana panelin Sidebar'ıyla aynı görsel dil,
 * ama yönetim sekmelerini (Raporlar, Ödemeler, Banka Talepleri, Kullanıcılar,
 * Denetim) listeler. "Panele dön" ile ana analiz ekranına geri döner. */
export function AdminSidebar({
  tabs,
  active,
  onTab,
  viewer,
}: {
  tabs: AdminTabDef[];
  active: string;
  onTab: (key: string) => void;
  viewer?: ViewerBadge | null;
}) {
  return (
    <aside className="w-[240px] shrink-0 bg-side border-r border-line flex flex-col h-full no-print">
      <div className="px-5 pt-6 pb-3">
        <Link href="/" aria-label="M4NM Pulse — Panele dön" className="inline-block rounded-2xl p-2 -m-2 hover:bg-ink-900/[0.04] transition-colors">
          <Logo size="md" />
        </Link>
          <p className="eyebrow mt-3 truncate">Yönetim</p>
      </div>

      <nav className="flex-1 px-3 overflow-y-auto scroll-thin">
        {tabs.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTab(t.key)}
              className={clsx(
                "w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-[14px] font-medium transition-colors duration-300 ease-out mb-0.5",
                isActive
                  ? "bg-brand-500/[0.16] text-ink-900"
                  : "text-ink-500 hover:bg-ink-900/[0.04] hover:text-ink-900"
              )}
            >
              <Icon name={t.icon} size={17} strokeWidth={isActive ? 2 : 1.8} />
              <span className="flex-1 text-left">{t.label}</span>
              {!!t.badge && (
                <span className={clsx(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                  "bg-accent-orange text-white"
                )}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-line space-y-0.5">
        <div className="px-1 pb-2 flex items-center justify-between">
          <span className="eyebrow pl-2">Tema</span>
          <ThemeToggle />
        </div>
        <Link
          href="/"
          className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-[14px] font-medium text-ink-500 hover:bg-ink-900/[0.05] hover:text-ink-900 transition-colors"
        >
          <Icon name="back" size={16} />
          <span className="flex-1 text-left">Panele dön</span>
        </Link>

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
