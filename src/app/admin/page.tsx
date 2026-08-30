import Link from "next/link";
import { redirect } from "next/navigation";
import { listReports, type ReportRow } from "@/lib/queries";
import { listBalances, type BalanceRow } from "@/lib/payments";
import { AdminTabs } from "@/components/AdminTabs";
import { Icon } from "@/components/ui";
import { getSession, requestMeta } from "@/lib/session";
import { authConfigured } from "@/lib/supabase/server";
import { audit, isAdmin } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Yönetim ekranı tüm sanatçıların rakamlarını gösterir — yönetici dışında
  // kimse giremez. Bağlantıyı elle yazan da giremez.
  if (authConfigured()) {
    const { viewer, reason } = await getSession();
    if (!viewer) redirect(reason === "no-session" ? "/giris?devam=/admin" : "/beklemede");
    if (!isAdmin(viewer)) {
      const m = await requestMeta();
      await audit({
        userId: viewer.userId, action: "admin_page_denied", resource: viewer.email,
        ip: m.ip, userAgent: m.userAgent, meta: { role: viewer.role },
      });
      redirect("/");
    }
  }

  let reports: ReportRow[] = [];
  let balances: BalanceRow[] = [];
  let error: string | null = null;
  try {
    [reports, balances] = await Promise.all([listReports(), listBalances()]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Veritabanına bağlanılamadı.";
  }

  return (
    <main className="min-h-screen">
      <header className="bg-card border-b border-line px-6 py-3.5 flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center shrink-0 p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="M4NM" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-[16px] font-semibold text-ink-900 leading-tight">Yönetim</h1>
            <p className="text-[11.5px] text-ink-400 leading-tight">Rapor, ödeme ve banka yönetimi</p>
          </div>
        </div>
        <Link
          href="/"
          className="ml-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium bg-white border border-line text-ink-700 hover:bg-ink-900/[0.03] transition-colors"
        >
          <Icon name="back" size={15} /> Panele dön
        </Link>
      </header>

      <div className="p-6 max-w-7xl mx-auto">
        {error ? (
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
        ) : (
          <AdminTabs reports={reports} balances={balances} />
        )}
      </div>
    </main>
  );
}
