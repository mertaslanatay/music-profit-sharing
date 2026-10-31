"use client";

import clsx from "clsx";
import Link from "next/link";
import { Icon } from "./ui";
import { LogoutButton } from "./auth/LogoutButton";
import { Logo } from "./theme";

export type ViewKey =
  | "overview"
  | "payouts"
  | "artists"
  | "songs"
  | "albums"
  | "labels"
  | "geo"
  | "platforms"
  | "rules";

export const NAV: { key: ViewKey; label: string; icon: string; group: string }[] = [
  { key: "overview", label: "Panel", icon: "dashboard", group: "Analiz" },
  { key: "payouts", label: "Ödeme Listesi", icon: "wallet", group: "Analiz" },
  { key: "artists", label: "Sanatçılar", icon: "users", group: "Katalog" },
  { key: "songs", label: "Şarkılar", icon: "music", group: "Katalog" },
  { key: "albums", label: "Albümler", icon: "album", group: "Katalog" },
  { key: "labels", label: "Label", icon: "disc", group: "Katalog" },
  { key: "geo", label: "Coğrafya", icon: "globe", group: "Dağılım" },
  { key: "platforms", label: "Platformlar", icon: "radio", group: "Dağılım" },
  { key: "rules", label: "Kurallar", icon: "sliders", group: "Ayarlar" },
];

/** Kenar çubuğunda gösterilen kullanıcı özeti. */
export interface ViewerBadge {
  fullName: string;
  email: string;
  role: "admin" | "label_manager" | "artist" | "accountant";
  isAdmin: boolean;
  /** Sanatçı rolünde hesaba bağlı sanatçı kimlikleri (artists.id). */
  artistIds?: string[];
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
  counts,
  hidden,
  labels,
  preview = false,
}: {
  view: ViewKey;
  onView: (v: ViewKey) => void;
  /** Yönetim ekranına git */
  onReset: () => void;
  /** Kurallar sekmesi v2'de yönetim tarafına taşındı */
  hideRules?: boolean;
  /** Oturum açık kullanıcı — auth kurulmadan önce null */
  viewer?: ViewerBadge | null;
  /** Menü öğesinin yanında gösterilen toplam (ör. Sanatçılar 101). */
  counts?: Partial<Record<ViewKey, number>>;
  /** Bu kullanıcıya anlamsız olan ekranlar (ör. tek sanatçılık hesapta Sanatçılar). */
  hidden?: ViewKey[];
  /** Rol bazlı menü adı (ör. sanatçıda "Sanatçılar" → "Sanatçı profillerim"). */
  labels?: Partial<Record<ViewKey, string>>;
  /**
   * Yönetici bir sanatçının gözünden bakıyor. Bildirim/İletişim gibi GERÇEK
   * oturuma ait (yöneticinin kendi) verileri gösteren bağlantılar gizlenir.
   */
  preview?: boolean;
}) {
  const items = NAV.filter((i) => !(hideRules && i.key === "rules") && !hidden?.includes(i.key));
  let lastGroup = "";
  return (
    <aside className="w-[240px] shrink-0 bg-side border-r border-line flex flex-col h-full no-print">
      <div className="px-5 pt-6 pb-3">
        <button
          type="button"
          onClick={() => onView("overview")}
          title="Panel'e git"
          aria-label="M4NM Pulse — Panel'e git"
          className="rounded-2xl p-2 -m-2 hover:bg-ink-900/[0.04] transition-colors"
        >
          <Logo size="md" />
        </button>
      </div>

      <nav className="flex-1 px-3 overflow-y-auto scroll-thin">
        {items.map((item) => {
          const showGroup = item.group !== lastGroup;
          lastGroup = item.group;
          const active = view === item.key;
          return (
            <div key={item.key}>
              {showGroup && (
                <p className="eyebrow px-3 pt-5 pb-2">
                  {item.group}
                </p>
              )}
              <button
                type="button"
                onClick={() => onView(item.key)}
                className={clsx(
                  "w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-[14px] font-medium transition-colors duration-300 ease-out mb-0.5",
                  active
                    ? "bg-brand-500/[0.16] text-ink-900"
                    : "text-ink-500 hover:bg-ink-900/[0.05] hover:text-ink-900"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon name={item.icon} size={18} strokeWidth={1.75} className={active ? "text-brand-700" : undefined} />
                <span className="flex-1 text-left">{labels?.[item.key] ?? item.label}</span>
                {counts?.[item.key] != null && (
                  <span
                    className={clsx(
                      "min-w-[28px] h-[22px] px-1.5 rounded-full text-[11.5px] font-semibold tabular grid place-items-center",
                      active ? "bg-brand-500 text-white" : "bg-ink-900/[0.06] text-ink-500"
                    )}
                    aria-label={`toplam ${counts[item.key]}`}
                  >
                    {counts[item.key]!.toLocaleString("tr-TR")}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </nav>

      <div className="p-3 border-t border-line space-y-0.5">
        {/* Yönetim yalnızca yöneticide görünür. Bu bir kolaylık; asıl engel
            sunucu tarafındaki yetki denetimidir. */}
        {(!viewer || viewer.isAdmin) && (
          <button
            type="button"
            onClick={onReset}
            className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-[14px] font-medium text-ink-500 hover:bg-ink-900/[0.05] hover:text-ink-900 transition-colors"
          >
            <Icon name="shield" size={17} />
            <span className="flex-1 text-left">Yönetim</span>
            <Icon name="back" size={13} className="rotate-180 opacity-50" />
          </button>
        )}

        {/* Adminlerde bu link gösterilmez — yönetim panelinde zaten aynı
            konuşmalara "Mesajlar" sekmesinden, üstelik hepsine birden,
            ulaşılıyor. Burada tekrar göstermek kafa karıştırır. */}
        {viewer && !viewer.isAdmin && !preview && (
          <Link
            href="/destek"
            className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-[14px] font-medium text-ink-500 hover:bg-ink-900/[0.05] hover:text-ink-900 transition-colors"
          >
            <Icon name="message" size={17} />
            <span className="flex-1 text-left">İletişim</span>
          </Link>
        )}

        {viewer?.role === "artist" && (
          <Link
            href="/hesabim"
            className="w-full flex items-center gap-3 px-3 min-h-[44px] rounded-xl text-[14px] font-medium text-ink-500 hover:bg-ink-900/[0.05] hover:text-ink-900 transition-colors"
          >
            <Icon name="wallet" size={16} />
            <span className="flex-1 text-left">Hesabım</span>
          </Link>
        )}

        {viewer && (
          <div className="pt-2 mt-2 border-t border-line">
            <div className="px-3 py-2 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-brand-500 text-white grid place-items-center text-[12px] font-bold shrink-0" aria-hidden>
                {viewer.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toLocaleUpperCase("tr-TR")}
              </span>
              <span className="min-w-0">
                <span className="block text-[13.5px] font-semibold text-ink-900 truncate" title={viewer.email}>
                  {viewer.fullName}
                </span>
                <span className="block text-[12px] text-ink-400 leading-tight mt-0.5">{ROLE_TR[viewer.role]}</span>
              </span>
            </div>
            <LogoutButton />
          </div>
        )}
      </div>

    </aside>
  );
}
