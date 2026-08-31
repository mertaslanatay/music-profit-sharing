import { redirect } from "next/navigation";
import { listReports, type ReportRow } from "@/lib/queries";
import { listBalances, type BalanceRow } from "@/lib/payments";
import { AdminTabs } from "@/components/AdminTabs";
import type { UserListRow } from "@/app/api/admin/users/route";
import { Icon } from "@/components/ui";
import type { ViewerBadge } from "@/components/Sidebar";
import { getSession, requestMeta } from "@/lib/session";
import { authConfigured } from "@/lib/supabase/server";
import { audit, isAdmin, needsMfaSetup, type Viewer } from "@/lib/access";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Yönetim ekranı tüm sanatçıların rakamlarını gösterir — yönetici dışında
  // kimse giremez. Bağlantıyı elle yazan da giremez.
  let viewer: Viewer | null = null;
  if (authConfigured()) {
    const s = await getSession();
    viewer = s.viewer;
    if (!viewer) redirect(s.reason === "no-session" ? "/giris?devam=/admin" : "/beklemede");
    if (needsMfaSetup(viewer)) redirect("/guvenlik");
    if (!isAdmin(viewer)) {
      const m = await requestMeta();
      await audit({
        userId: viewer.userId, action: "admin_page_denied", resource: viewer.email,
        ip: m.ip, userAgent: m.userAgent, meta: { role: viewer.role },
      });
      redirect("/");
    }
  }

  const viewerBadge: ViewerBadge | null = viewer
    ? {
        fullName: viewer.fullName,
        email: viewer.email,
        role: viewer.role,
        isAdmin: isAdmin(viewer),
      }
    : null;

  let reports: ReportRow[] = [];
  let balances: BalanceRow[] = [];
  let users: UserListRow[] = [];
  let labels: { id: string; name: string }[] = [];
  let artists: { id: string; name: string }[] = [];
  let error: string | null = null;

  try {
    const [rep, bal, userRows, labelRows, artistRows] = await Promise.all([
      listReports(),
      listBalances(),
      query<{
        id: string; email: string; first_name: string; last_name: string;
        artist_name: string | null; role: string; status: string; status_note: string | null;
        can_see_label_totals: boolean; can_see_other_artists: boolean;
        created_at: string; approved_at: string | null; last_seen_at: string | null;
        label_ids: string[]; artist_ids: string[];
      }>(`select * from v_user_access order by
            case status when 'pending' then 0 when 'active' then 1 else 2 end,
            created_at desc`),
      query<{ id: string; name: string }>(`select id, name from labels order by name`),
      query<{ id: string; display_name: string }>(`select id, display_name from artists order by display_name`),
    ]);

    reports = rep;
    balances = bal;
    users = userRows.map((r) => ({
      id: r.id,
      email: r.email,
      firstName: r.first_name,
      lastName: r.last_name,
      artistName: r.artist_name,
      role: r.role,
      status: r.status,
      statusNote: r.status_note,
      canSeeLabelTotals: r.can_see_label_totals,
      canSeeOtherArtists: r.can_see_other_artists,
      createdAt: r.created_at,
      approvedAt: r.approved_at,
      lastSeenAt: r.last_seen_at,
      labelIds: r.label_ids ?? [],
      artistIds: r.artist_ids ?? [],
    }));
    labels = labelRows;
    artists = artistRows.map((a) => ({ id: a.id, name: a.display_name }));
  } catch (e) {
    error = e instanceof Error ? e.message : "Veritabanına bağlanılamadı.";
  }

  if (error) {
    return (
      <main className="min-h-screen p-6 max-w-7xl mx-auto">
        <div className="rounded-xl2 bg-rose-50 border border-rose-200 p-5">
          <div className="flex items-start gap-3">
            <Icon name="alert" size={18} className="text-accent-rose mt-0.5 shrink-0" />
            <div>
              <p className="text-[14px] font-semibold text-accent-rose">Veritabanına bağlanılamadı</p>
              <p className="text-[13px] text-accent-rose/85 mt-1.5 leading-relaxed">{error}</p>
              <p className="text-[12.5px] text-ink-500 mt-3 leading-relaxed">
                <code className="bg-white px-1.5 py-0.5 rounded border border-line">.env.local</code>{" "}
                dosyasındaki <code className="bg-white px-1.5 py-0.5 rounded border border-line">DATABASE_URL</code>{" "}
                değerini kontrol et. Şifrede <code>@</code> gibi özel karakter varsa
                URL kodlaması gerekir (<code>@</code> → <code>%40</code>).
              </p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <AdminTabs
      reports={reports}
      balances={balances}
      users={users}
      labels={labels}
      artists={artists}
      viewer={viewerBadge}
    />
  );
}
