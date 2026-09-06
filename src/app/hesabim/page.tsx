import Link from "next/link";
import { redirect } from "next/navigation";
import { getArtistLedger, getBankAccount, getOpenBankChangeRequest } from "@/lib/payments";
import { MyAccountPanel } from "@/components/MyAccountPanel";
import { Icon } from "@/components/ui";
import { getSession, requestMeta } from "@/lib/session";
import { authConfigured } from "@/lib/supabase/server";
import { audit } from "@/lib/access";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Sanatçı portalı — kendi kazancı, bakiyesi, ödeme geçmişi, ödeme talebi
 * ve banka bilgisi değişiklik isteği. Süzme burada da SQL'de: getArtistLedger
 * ve getBankAccount doğrudan artistId ile çağrılır ama önce requireArtistAccess
 * eşdeğeri kontrol (bu sanatçı gerçekten bu kullanıcıya mı ait) burada,
 * sayfa seviyesinde yapılır; API tarafında da ayrıca requireArtistAccess var.
 */
export default async function AccountPage() {
  if (!authConfigured()) {
    return (
      <Empty
        title="Giriş sistemi henüz kurulmadı"
        sub="Bu ekran yalnızca kimlik doğrulama etkinleştirildiğinde çalışır."
      />
    );
  }

  const { viewer, reason } = await getSession();
  if (!viewer) redirect(reason === "no-session" ? "/giris?devam=/hesabim" : "/beklemede");

  if (viewer.artistIds.length === 0) {
    return (
      <Empty
        title="Bağlı bir sanatçı kaydın yok"
        sub="Bu hesaba henüz bir sanatçı profili bağlanmamış. Yöneticinle iletişime geç."
      />
    );
  }

  // Bir hesap birden fazla sanatçıya bağlıysa (nadiren), ilkini gösteriyoruz.
  // "diğer_sanatçıları_görsün" açıksa zaten bu liste label geneline genişler —
  // o durumda kişisel bakiye ekranı yerine ana panele yönlendirmek daha doğru.
  if (viewer.canSeeOtherArtists) redirect("/");

  const artistId = viewer.artistIds[0];

  let data;
  try {
    const [ledger, bank, openBankRequest, artistRow] = await Promise.all([
      getArtistLedger(artistId),
      getBankAccount(artistId),
      getOpenBankChangeRequest(artistId),
      query<{ display_name: string }>(`select display_name from artists where id = $1`, [artistId]),
    ]);
    if (!ledger) {
      return <Empty title="Sanatçı kaydı bulunamadı" sub="Bağlı sanatçı profili silinmiş olabilir." />;
    }
    data = { ledger, bank, openBankRequest, artistName: artistRow[0]?.display_name ?? viewer.fullName };
  } catch (e) {
    return (
      <Empty
        title="Veritabanına bağlanılamadı"
        sub={e instanceof Error ? e.message : "Bilinmeyen hata"}
      />
    );
  }

  const meta = await requestMeta();
  void audit({
    userId: viewer.userId, action: "view_account", resource: `artist:${artistId}`,
    ip: meta.ip, userAgent: meta.userAgent,
  });

  return (
    <MyAccountPanel
      artistId={artistId}
      artistName={data.artistName}
      fullName={viewer.fullName}
      summary={data.ledger.summary}
      periods={data.ledger.periods}
      payments={data.ledger.payments}
      bank={data.bank}
      openBankRequest={data.openBankRequest}
    />
  );
}

function Empty({ title, sub }: { title: string; sub: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center rise">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-ink-900/[0.04] items-center justify-center mb-4">
          <Icon name="alert" size={22} className="text-ink-400" />
        </div>
        <h1 className="text-[18px] font-semibold text-ink-900">{title}</h1>
        <p className="text-[13.5px] text-ink-500 mt-2 leading-relaxed">{sub}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 mt-6 px-4 py-2.5 rounded-xl text-[13.5px] font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          <Icon name="back" size={16} /> Panele dön
        </Link>
      </div>
    </main>
  );
}
