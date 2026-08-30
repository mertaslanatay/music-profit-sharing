"use client";

import { useState } from "react";
import clsx from "clsx";
import type { ReportRow } from "@/lib/queries";
import type { BalanceRow } from "@/lib/payments";
import type { UserListRow } from "@/app/api/admin/users/route";
import { AdminPanel } from "./AdminPanel";
import { PaymentsPanel } from "./PaymentsPanel";
import { UsersPanel } from "./UsersPanel";
import { AuditPanel } from "./AuditPanel";
import { Icon } from "./ui";

type Tab = "reports" | "payments" | "users" | "audit";

interface LabelOption { id: string; name: string }
interface ArtistOption { id: string; name: string }

export function AdminTabs({
  reports,
  balances,
  users,
  labels,
  artists,
}: {
  reports: ReportRow[];
  balances: BalanceRow[];
  users: UserListRow[];
  labels: LabelOption[];
  artists: ArtistOption[];
}) {
  const [tab, setTab] = useState<Tab>("reports");
  const openRequests = balances.filter((b) => b.hasOpenRequest).length;
  const pendingUsers = users.filter((u) => u.status === "pending").length;

  const tabs: { key: Tab; label: string; icon: string; badge?: number }[] = [
    { key: "reports", label: "Raporlar", icon: "file" },
    { key: "payments", label: "Ödemeler ve Banka", icon: "wallet", badge: openRequests },
    { key: "users", label: "Kullanıcılar", icon: "users", badge: pendingUsers },
    { key: "audit", label: "Denetim", icon: "clock" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={clsx(
              "px-4 py-2 rounded-xl text-[13px] font-medium transition-colors inline-flex items-center gap-2",
              tab === t.key
                ? "bg-ink-900 text-white"
                : "bg-card border border-line text-ink-700 hover:bg-ink-900/[0.03]"
            )}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
            {t.badge ? (
              <span className={clsx(
                "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                tab === t.key ? "bg-white/25" : "bg-accent-rose/15 text-accent-rose"
              )}>
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "reports" && <AdminPanel initialReports={reports} />}
      {tab === "payments" && <PaymentsPanel initial={balances} />}
      {tab === "users" && <UsersPanel initial={users} labels={labels} artists={artists} />}
      {tab === "audit" && <AuditPanel />}
    </div>
  );
}
