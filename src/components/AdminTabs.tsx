"use client";

import { useEffect, useState } from "react";
import type { ReportRow } from "@/lib/queries";
import type { BalanceRow } from "@/lib/payments";
import type { UserListRow } from "@/app/api/admin/users/route";
import { AdminPanel } from "./AdminPanel";
import { PaymentsPanel, BankRequestsPanel } from "./PaymentsPanel";
import { UsersPanel } from "./UsersPanel";
import { AuditPanel } from "./AuditPanel";
import { SeparatorsPanel } from "./SeparatorsPanel";
import { AdminSidebar, type AdminTabDef } from "./AdminSidebar";
import type { ViewerBadge } from "./Sidebar";
import type { Separator } from "@/lib/types";

type Tab = "reports" | "payments" | "bank-requests" | "users" | "separators" | "audit";

const TITLES: Record<Tab, { title: string; sub: string }> = {
  reports: { title: "Raporlar", sub: "Excel yükle, kontrol et, yayınla" },
  payments: { title: "Ödemeler", sub: "Sanatçı bakiyeleri ve ödeme kaydı" },
  "bank-requests": { title: "Banka Talepleri", sub: "IBAN değişiklik istekleri" },
  users: { title: "Kullanıcılar", sub: "Kayıt onayı ve yetkilendirme" },
  separators: { title: "Ayrıştırma", sub: "Sanatçı ayırma belirteçleri" },
  audit: { title: "Denetim", sub: "İşlem kaydı ve şüpheli aktivite" },
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
}: {
  reports: ReportRow[];
  balances: BalanceRow[];
  users: UserListRow[];
  labels: LabelOption[];
  artists: ArtistOption[];
  separators: Separator[];
  viewer?: ViewerBadge | null;
}) {
  const [tab, setTab] = useState<Tab>("reports");
  const [pendingBankRequests, setPendingBankRequests] = useState(0);
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

  const tabs: AdminTabDef[] = [
    { key: "reports", label: "Raporlar", icon: "file" },
    { key: "payments", label: "Ödemeler", icon: "wallet", badge: openRequests },
    { key: "bank-requests", label: "Banka Talepleri", icon: "bank", badge: pendingBankRequests },
    { key: "users", label: "Kullanıcılar", icon: "users", badge: pendingUsers },
    { key: "separators", label: "Ayrıştırma", icon: "split" },
    { key: "audit", label: "Denetim", icon: "clock" },
  ];

  const meta = TITLES[tab];

  return (
    <main className="flex h-screen overflow-hidden">
      <AdminSidebar tabs={tabs} active={tab} onTab={(k) => setTab(k as Tab)} viewer={viewer} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-card border-b border-line px-6 py-3.5 shrink-0 no-print">
          <h1 className="text-[17px] font-semibold text-ink-900 leading-tight">{meta.title}</h1>
          <p className="text-[12px] text-ink-400 leading-tight mt-0.5">{meta.sub}</p>
        </header>

        <div className="flex-1 overflow-y-auto scroll-thin p-6">
          {tab === "reports" && <AdminPanel initialReports={reports} />}
          {tab === "payments" && <PaymentsPanel initial={balances} />}
          {tab === "bank-requests" && <BankRequestsPanel />}
          {tab === "users" && <UsersPanel initial={users} labels={labels} artists={artists} />}
          {tab === "separators" && <SeparatorsPanel initial={separators} />}
          {tab === "audit" && <AuditPanel />}
        </div>
      </div>
    </main>
  );
}
