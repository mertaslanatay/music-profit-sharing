"use client";

import { useEffect, useState } from "react";
import type { ReportRow } from "@/lib/queries";
import type { BalanceRow } from "@/lib/payments";
import type { UserListRow } from "@/app/api/admin/users/route";
import { AdminPanel } from "./AdminPanel";
import { MenuButton, NavShell } from "./MobileNav";
import { PaymentsPanel, BankRequestsPanel } from "./PaymentsPanel";
import { UsersPanel } from "./UsersPanel";
import { AuditPanel } from "./AuditPanel";
import { SeparatorsPanel } from "./SeparatorsPanel";
import { AnnouncementsPanel } from "./AnnouncementsPanel";
import { SupportPanel } from "./SupportPanel";
import { AdminMailPanel } from "./AdminMailPanel";
import { AdminProfilePanel } from "./AdminProfilePanel";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./theme";
import { AdminSidebar, type AdminTabDef } from "./AdminSidebar";
import type { ViewerBadge } from "./Sidebar";
import type { Separator } from "@/lib/types";

type Tab = "reports" | "payments" | "bank-requests" | "users" | "messages" | "mail" | "separators" | "announcements" | "audit" | "profile";

const TITLES: Record<Tab, { title: string; sub: string }> = {
  reports: { title: "Raporlar", sub: "Excel yükle, kontrol et, yayınla" },
  payments: { title: "Ödemeler", sub: "Sanatçı bakiyeleri ve ödeme kaydı" },
  "bank-requests": { title: "Banka Talepleri", sub: "IBAN değişiklik istekleri" },
  users: { title: "Kullanıcılar", sub: "Kayıt onayı ve yetkilendirme" },
  messages: { title: "Mesajlar", sub: "Sanatçılardan gelen talepler" },
  mail: { title: "E-posta", sub: "Kayıtlı kullanıcıya veya serbest adrese e-posta gönder" },
  separators: { title: "Ayrıştırma", sub: "Sanatçı ayırma belirteçleri" },
  announcements: { title: "Duyurular", sub: "Kullanıcılara yayınlanan güncellemeler" },
  audit: { title: "Denetim", sub: "İşlem kaydı ve şüpheli aktivite" },
  profile: { title: "Profilim", sub: "Kendi kişisel bilgilerin, iletişim tercihlerin ve güvenlik ayarların" },
};

interface LabelOption { id: string; name: string }
interface ArtistOption { id: string; name: string }

export function AdminTabs({
  reports,
  balances,
  users,
  labels,
  artists,
  separators,
  viewer,
  mfa,
}: {
  reports: ReportRow[];
  balances: BalanceRow[];
  users: UserListRow[];
  labels: LabelOption[];
  artists: ArtistOption[];
  separators: Separator[];
  viewer?: ViewerBadge | null;
  /** İki adımlı doğrulama durumu; kimlik doğrulama kapalıysa null. */
  mfa?: { hasVerifiedFactor: boolean; isFullySatisfied: boolean; factorId: string | null } | null;
}) {
  const [tab, setTab] = useState<Tab>("reports");
  const [navOpen, setNavOpen] = useState(false);
  const [pendingBankRequests, setPendingBankRequests] = useState(0);
  const [unreadThreads, setUnreadThreads] = useState(0);
  const openRequests = balances.filter((b) => b.hasOpenRequest).length;
  const pendingUsers = users.filter((u) => u.status === "pending").length;

  // Banka talepleri artık ayrı bir sekme (eskiden Ödemeler'in üstünde gömülüydü) —
  // kenar çubuğundaki rozet için bekleyen sayıyı ayrıca çekiyoruz.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/bank-requests?status=pending")
      .then((r) => r.json())
      .then((j) => { if (!cancelled && j.requests) setPendingBankRequests(j.requests.length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tab]);

  // Mesaj sekmesinin rozeti — okunmamış konuşma sayısı.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/support")
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && Array.isArray(j.threads)) {
          setUnreadThreads(j.threads.filter((x: { unread: boolean }) => x.unread).length);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [tab]);

  const tabs: AdminTabDef[] = [
    { key: "reports", label: "Raporlar", icon: "file" },
    { key: "payments", label: "Ödemeler", icon: "wallet", badge: openRequests },
    { key: "bank-requests", label: "Banka Talepleri", icon: "bank", badge: pendingBankRequests },
    { key: "users", label: "Kullanıcılar", icon: "users", badge: pendingUsers },
    { key: "messages", label: "Mesajlar", icon: "message", badge: unreadThreads },
    { key: "mail", label: "E-posta", icon: "mail" },
    { key: "separators", label: "Ayrıştırma", icon: "split" },
    { key: "announcements", label: "Duyurular", icon: "bell" },
    { key: "audit", label: "Denetim", icon: "clock" },
    // Yöneticinin KENDİ bilgileri — listenin sonunda, diğer yönetim
    // işlerinden ayrı dursun diye.
    { key: "profile", label: "Profilim", icon: "user" },
  ];

  const meta = TITLES[tab];

  return (
    <main className="flex h-screen overflow-hidden">
      <NavShell open={navOpen} onClose={() => setNavOpen(false)}>
        <AdminSidebar tabs={tabs} active={tab} onTab={(k) => { setNavOpen(false); setTab(k as Tab); }} viewer={viewer} />
      </NavShell>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="relative z-30 bg-canvas/85 backdrop-blur border-b border-line px-4 sm:px-8 py-3 sm:py-3.5 shrink-0 no-print flex items-center gap-3 sm:gap-4">
          <MenuButton open={navOpen} onClick={() => setNavOpen(true)} />
          <div className="min-w-0">
            <h1 className="font-display text-[20px] font-bold tracking-[-0.025em] text-ink-900 leading-tight">{meta.title}</h1>
            <p className="text-[12.5px] text-ink-400 leading-tight mt-0.5 hidden sm:block truncate">{meta.sub}</p>
          </div>
          {/* Zil artık kenar çubuğunda değil, sağ üstte — ana paneldeki
              yerleşimle aynı olsun diye. */}
          <div className="ml-auto shrink-0 flex items-center gap-2 sm:gap-2.5">
            <ThemeToggle size="sm" />
            {viewer && <NotificationBell compact />}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto scroll-thin px-4 sm:px-8 py-5 sm:py-6">
          {tab === "reports" && <AdminPanel initialReports={reports} />}
          {tab === "payments" && <PaymentsPanel initial={balances} />}
          {tab === "bank-requests" && <BankRequestsPanel />}
          {tab === "users" && <UsersPanel initial={users} labels={labels} artists={artists} />}
          {tab === "messages" && <SupportPanel mode="admin" />}
          {tab === "mail" && <AdminMailPanel users={users} />}
          {tab === "profile" && <AdminProfilePanel mfa={mfa} />}
          {tab === "separators" && <SeparatorsPanel initial={separators} />}
          {tab === "announcements" && <AnnouncementsPanel />}
          {tab === "audit" && <AuditPanel />}
        </div>
      </div>
    </main>
  );
}
