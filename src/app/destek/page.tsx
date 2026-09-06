import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { authConfigured } from "@/lib/supabase/server";
import { SupportPanel } from "@/components/SupportPanel";
import { Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Sanatçı tarafı destek kutusu (M4NM Pulse § 9).
 *
 * Yetki burada sadece "giriş yapmış ve onaylanmış mı" seviyesindedir; hangi
 * konuşmaların görüneceğine sunucu tarafındaki API karar verir (kullanıcı
 * kimliği oturumdan alınır). Yönetici de bu sayfayı açabilir ama kendi
 * kutusunu görür — yönetim kutusu /admin altındaki "Mesajlar" sekmesidir.
 */
export default async function DestekPage() {
  if (!authConfigured()) redirect("/");

  const { viewer, reason } = await getSession();
  if (!viewer) redirect(reason === "no-session" ? "/giris?devam=/destek" : "/beklemede");

  return (
    <main className="min-h-screen bg-canvas">
      <header className="bg-card border-b border-line px-6 py-3.5 flex items-center gap-4">
        <div>
          <h1 className="text-[16px] font-semibold text-ink-900 leading-tight">İletişim</h1>
          <p className="text-[11.5px] text-ink-400 leading-tight">Label ekibiyle yazış</p>
        </div>
        <Link
          href="/"
          className="ml-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium bg-white border border-line text-ink-700 hover:bg-ink-900/[0.03] transition-colors"
        >
          <Icon name="back" size={15} /> Panele dön
        </Link>
      </header>

      <div className="p-6 max-w-6xl mx-auto">
        <SupportPanel mode="user" />
      </div>
    </main>
  );
}
