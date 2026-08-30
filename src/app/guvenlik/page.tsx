import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { authConfigured, supabaseServer } from "@/lib/supabase/server";
import { readMfaState, mfaOkFromState } from "@/lib/mfa";
import { TwoFactorSetup } from "@/components/TwoFactorSetup";
import { Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * İki adımlı doğrulama kurulumu — yalnızca admin.
 *
 * Kasıtlı olarak isAdmin()/requireAdmin() KULLANMIYORUZ: bu ekranın var
 * olma sebebi tam olarak "admin ama mfaOk henüz false" durumundaki
 * kullanıcının buraya gelebilmesi. role === 'admin' kontrolü yeterli.
 */
export default async function SecurityPage() {
  if (!authConfigured()) redirect("/");

  const { viewer, reason } = await getSession();
  if (!viewer) redirect(reason === "no-session" ? "/giris?devam=/guvenlik" : "/beklemede");
  if (viewer.role !== "admin") redirect("/");

  const sb = await supabaseServer();
  const state = await readMfaState(sb);

  return (
    <main className="min-h-screen bg-canvas">
      <header className="bg-card border-b border-line px-6 py-3.5 flex items-center gap-4">
        <div>
          <h1 className="text-[16px] font-semibold text-ink-900 leading-tight">Güvenlik</h1>
          <p className="text-[11.5px] text-ink-400 leading-tight">İki adımlı doğrulama (2FA)</p>
        </div>
        {mfaOkFromState(state) && (
          <Link
            href="/admin"
            className="ml-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-medium bg-white border border-line text-ink-700 hover:bg-ink-900/[0.03] transition-colors"
          >
            <Icon name="back" size={15} /> Yönetime dön
          </Link>
        )}
      </header>

      <div className="p-6 max-w-lg mx-auto">
        <TwoFactorSetup
          hasVerifiedFactor={state.hasVerifiedFactor}
          isFullySatisfied={mfaOkFromState(state)}
          existingFactorId={state.factorId}
        />
      </div>
    </main>
  );
}
