"use client";

import clsx from "clsx";
import Link from "next/link";
import { Icon } from "./ui";
import { LogoutButton } from "./auth/LogoutButton";

export interface AccountTabDef {
  key: string;
  label: string;
  icon: string;
  badge?: number;
}

/** Sanatçı hesap panelinin kenar çubuğu — AdminSidebar ile aynı görsel dil,
 * ama yönetim sekmeleri yerine kendi hesap sekmelerini (Genel Bakış, Ödemeler,
 * Banka, İletişim Tercihleri) listeler. */
export function AccountSidebar({
  tabs,
  active,
  onTab,
  artistName,
  fullName,
}: {
  tabs: AccountTabDef[];
  active: string;
  onTab: (key: string) => void;
  artistName: string;
  fullName: string;
}) {
  return (
    <aside className="w-[232px] shrink-0 bg-card border-r border-line flex flex-col h-full no-print">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center shrink-0 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="M4NM" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <p className="text-[16px] font-bold text-ink-900 leading-tight tracking-tight">M4NM</p>
            <p className="text-[11px] text-ink-400 leading-tight truncate" title={artistName}>
              {artistName}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 overflow-y-auto scroll-thin">
        <p className="px-3 pt-1 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-300">
          Hesabım
        </p>
        {tabs.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onTab(t.key)}
              className={clsx(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13.5px] font-medium transition-all mb-0.5",
                isActive
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-ink-500 hover:bg-ink-900/[0.04] hover:text-ink-900"
              )}
            >
              <Icon name={t.icon} size={17} strokeWidth={isActive ? 2 : 1.8} />
              <span className="flex-1 text-left">{t.label}</span>
              {!!t.badge && (
                <span className={clsx(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                  isActive ? "bg-white/25" : "bg-accent-rose/15 text-accent-rose"
                )}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-line space-y-0.5">
        <Link
          href="/"
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium text-ink-500 hover:bg-ink-900/[0.04] hover:text-ink-900 transition-all"
        >
          <Icon name="back" size={16} />
          <span className="flex-1 text-left">Panele dön</span>
        </Link>

        <div className="pt-1.5 mt-1.5 border-t border-line">
          <div className="px-3 py-2">
            <p className="text-[12.5px] font-medium text-ink-900 truncate">{fullName}</p>
            <p className="text-[11px] text-ink-400 leading-tight mt-0.5">Sanatçı</p>
          </div>
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
