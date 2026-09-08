import Link from "next/link";
import { redirect } from "next/navigation";

import { NotificationsFull } from "@/components/NotificationsFull";
import { getSession } from "@/lib/session";
import { isAdmin } from "@/lib/access";
import { authConfigured } from "@/lib/supabase/server";
import { Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Bildirimlerin tam listesi.
 *
 * Zildeki modal son 10 kaydı gösterir; "Tümünü gör" buraya getirir. Yetki
 * /destek ile aynı seviyede: giriş yapmış olmak yeterli — kimin hangi
 * bildirimi göreceğine sunucudaki API karar verir (kullanıcı kimliği
 * oturumdan gelir, istekten değil).
 */
export default async function BildirimlerPage() {
  if (!authConfigured()) redirect("/");

  const { viewer, reason } = await getSession();
  if (!viewer) redirect(reason === "no-session" ? "/giris?devam=/bildirimler" : "/beklemede");

  // Zil hem ana panelde hem yönetim panelinde var; yönetici buraya /admin'den
  // geldiği için onu sanatçı paneline atmak yanlış olurdu.
  const geri = isAdmin(viewer) ? "/admin" : "/";

  return (
    <main className="min-h-screen bg-canvas">
      <header className="bg-card border-b border-line px-6 py-3.5 flex items-center gap-4">
        <div>
          <h1 className="text-[16px] font-semibold text-ink-900 leading-tight">Bildirimler</h1>
          <p className="text-[11.5px] text-ink-400 leading-tight">Tüm bildirimler ve güncellemeler</p>
        </div>
        <Link
          href={geri}
          className="ml-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium bg-white border border-line text-ink-700 hover:bg-ink-900/[0.03] transition-colors"
        >
          <Icon name="back" size={15} /> {isAdmin(viewer) ? "Yönetime dön" : "Panele dön"}
        </Link>
      </header>

      <div className="p-6 max-w-4xl mx-auto">
        <NotificationsFull />
      </div>
    </main>
  );
}
