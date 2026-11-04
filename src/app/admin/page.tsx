import { redirect, unstable_rethrow } from "next/navigation";
import { listReports, type ReportRow } from "@/lib/queries";
import { listBalances, listBalancesForLabels, type BalanceRow } from "@/lib/payments";
import { loadUsersFor } from "@/lib/staff";
import { AdminTabs } from "@/components/AdminTabs";
import type { UserListRow } from "@/app/api/admin/users/route";
import { Icon } from "@/components/ui";
import type { ViewerBadge } from "@/components/Sidebar";
import { getSession, requestMeta } from "@/lib/session";
import { authConfigured, supabaseServer } from "@/lib/supabase/server";
import { readMfaState, mfaOkFromState } from "@/lib/mfa";
import { audit, isAdmin, isLabelManager, isStaff, needsMfaVerification, type Viewer } from "@/lib/access";
import { listSeparators } from "@/lib/separators";
import type { Separator } from "@/lib/types";

export const dynamic = "force-dynamic";
// Vercel'in kendi zaman aşımı devreye girerse ekranda yalnızca opak bir
// digest kalır. Sınırı açıkça koyuyoruz; db.ts'teki kapı 20 sn'de anlaşılır
// bir hatayla vazgeçtiği için hata her zaman aşağıdaki kırmızı kutuya düşer.
export const maxDuration = 30;

/**
 * Ana sayfadakiyle (src/app/page.tsx) aynı koruma. Next.js üretimde sunucu
 * bileşeni hatalarının mesajını istemciye göndermez — yakalamazsak kullanıcı
 * yalnızca bir digest görür ya da "Yönetim"e tıklayınca hiçbir şey olmaz.
 * Önceden yalnızca veri sorguları try/catch içindeydi; getSession(), audit()
 * ve MFA okuması korumasızdı. Veritabanı uyurken (Supabase duraklatma)
 * tam olarak bunlar patlıyordu.
 *
 * redirect()/notFound() de hata fırlatarak çalışır; unstable_rethrow() onları
 * aynen geçirir, yalnızca gerçek hatalarda geri döner.
 */
export default async function AdminPage() {
  try {
    return await AdminInner();
  } catch (e) {
    unstable_rethrow(e);
    console.error("[pulse] yönetim sayfası sunucu hatası:", e);
    return <DbError message={e instanceof Error ? e.message : String(e)} />;
  }
}

async function AdminInner() {
  // Yönetim ekranına yönetici ve label yöneticisi girer. Label yöneticisi
  // yalnızca kendi label'larının verisini alır — süzme aşağıda, sunucuda.
  // Başkası (bağlantıyı elle yazan dahil) giremez.
  let viewer: Viewer | null = null;
  if (authConfigured()) {
    const s = await getSession();
    viewer = s.viewer;
    if (!viewer) redirect(s.reason === "no-session" ? "/giris?devam=/admin" : "/beklemede");
    if (needsMfaVerification(viewer)) redirect("/guvenlik");
    if (!isStaff(viewer)) {
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
        isStaff: true,
      }
    : null;
  // null = tüm label'lar (yönetici / auth kapalı)
  const labelScope: string[] | null = viewer && isLabelManager(viewer) && !isAdmin(viewer) ? viewer.labelIds : null;

  // İki adımlı doğrulama durumu — "Profilim" sekmesindeki Güvenlik bloğu için.
  // Sunucuda okunup prop olarak geçiliyor: yeni bir API ucu açmaya gerek yok
  // ve sayfa açılırken fazladan bir tur atılmıyor.
  //
  // Buraya gelebiliyorsak oturum zaten 2FA gereksinimini karşılıyor
  // (yukarıdaki needsMfaVerification kontrolü aksi hâlde /guvenlik'e
  // yönlendirir), yani panelde yalnızca "aktif" veya "kurulum" hâli görünür;
  // kod isteyen ara adım /guvenlik'te kalır.
  let mfa: { hasVerifiedFactor: boolean; isFullySatisfied: boolean; factorId: string | null } | null = null;
  if (authConfigured() && viewer) {
    const durum = await readMfaState(await supabaseServer());
    mfa = {
      hasVerifiedFactor: durum.hasVerifiedFactor,
      isFullySatisfied: mfaOkFromState(durum),
      factorId: durum.factorId,
    };
  }

  let reports: ReportRow[] = [];
  let balances: BalanceRow[] = [];
  let users: UserListRow[] = [];
  let labels: { id: string; name: string }[] = [];
  let artists: { id: string; name: string }[] = [];
  let separators: Separator[] = [];
  let error: string | null = null;

  try {
    const [rep, bal, u, sepRows] = await Promise.all([
      // Ödeme partileri: label yöneticisinde yalnızca kendi label'ının
      // kaydı olan partiler, rakamları da yalnızca o label'dan.
      labelScope ? listReports({ labelIds: labelScope, artistIds: null, denied: false }) : listReports(),
      labelScope ? listBalancesForLabels(labelScope) : listBalances(),
      loadUsersFor(labelScope),
      listSeparators(),
    ]);

    reports = rep;
    balances = bal;
    users = u.users;
    labels = u.labels;
    artists = u.artists;
    separators = sepRows;
  } catch (e) {
    error = e instanceof Error ? e.message : "Veritabanına bağlanılamadı.";
  }

  if (error) {
    console.error("[pulse] yönetim sayfası veri hatası:", error);
    return <DbError message={error} />;
  }

  return (
    <AdminTabs
      reports={reports}
      balances={balances}
      users={users}
      labels={labels}
      artists={artists}
      separators={separators}
      viewer={viewerBadge}
      mfa={mfa}
      staffRole={labelScope ? "label_manager" : "admin"}
    />
  );
}

function DbError({ message }: { message: string }) {
  return (
    <main className="min-h-screen p-6 max-w-7xl mx-auto">
      <div className="rounded-xl2 bg-rose-50 border border-rose-200 p-5">
        <div className="flex items-start gap-3">
          <Icon name="alert" size={18} className="text-accent-rose mt-0.5 shrink-0" />
          <div>
            <p className="text-[14px] font-semibold text-accent-rose">Yönetim ekranı yüklenemedi</p>
            <p className="text-[13px] text-accent-rose/85 mt-1.5 leading-relaxed">{message}</p>
            <p className="text-[12.5px] text-ink-500 mt-3 leading-relaxed">
              Sayfayı yenilemeyi dene. Supabase projesi duraklatılmışsa önce onu
              yeniden başlat. Sorun sürerse{" "}
              <code className="bg-card px-1.5 py-0.5 rounded border border-line">DATABASE_URL</code>{" "}
              ayarını kontrol et — şifrede özel karakter varsa URL kodlaması gerekir
              (<code>@</code> → <code>%40</code>).
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
