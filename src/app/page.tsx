import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import { resolveViewAs } from "@/lib/viewAs";
import { pendingTotal } from "@/lib/payments";
import { redactOtherArtists } from "@/lib/redact";
import { PreviewBanner } from "@/components/PreviewBanner";
import { listPeriodsCached, listReportsCached, loadResult, topSongsGeo, type Scope, type SongGeo } from "@/lib/queries";
import type { ViewKey } from "@/components/Sidebar";
import { Dashboard } from "@/components/Dashboard";
import { Icon } from "@/components/ui";
import { getSession, requestMeta } from "@/lib/session";
import { authConfigured } from "@/lib/supabase/server";
import { scopeFor, isAdmin, needsMfaVerification, audit } from "@/lib/access";

export const dynamic = "force-dynamic";

// Vercel'in varsayılan fonksiyon bütçesi (Hobby'de 10 sn) bu sayfa için
// yetersiz kalabiliyordu: süre dolunca istek PLATFORM tarafından öldürülüyor
// ve kullanıcı okunabilir bir mesaj yerine opak bir "Application error ...
// Digest" ekranı görüyordu. Bütçeyi açıkça yükseltiyoruz; kendi kapımız
// (src/lib/db.ts, GATE_WAIT_MS = 20 sn) bunun ALTINDA vazgeçtiği için hata
// bize düşüyor ve ekranda gerçek sebep yazıyor.
export const maxDuration = 30;

/**
 * Next.js, sunucu bileşenlerinde OLUŞAN hataların mesajını üretimde
 * güvenlik gereği İSTEMCİYE HİÇ göndermez — geriye yalnızca bir digest
 * kalır. Yani bir hatayı ekranda görebilmemizin TEK yolu onu yakalayıp
 * kendimiz basmaktır. Bu sarmalayıcı tam olarak bunun içindir: sayfanın
 * herhangi bir yerinde (getSession dahil) patlayan her şey artık kırmızı
 * kutuda gerçek mesajıyla görünür.
 *
 * DİKKAT: redirect() ve notFound() de "hata fırlatarak" çalışır. Onları
 * yutarsak giriş yönlendirmesi bozulur. Elle digest kontrolü yazmak yerine
 * Next.js'in tam bu iş için sağladığı unstable_rethrow() kullanılıyor —
 * çerçeveye ait her iç sinyali (redirect, notFound, dinamik render
 * bailout'ları) aynen geçirir, yalnızca GERÇEK hatalarda geri döner.
 * (Elle yazsaydık eksik kalırdı: bu sürümde notFound() artık
 * "NEXT_NOT_FOUND" değil "NEXT_HTTP_ERROR_FALLBACK;404" digest'i atıyor.)
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    return await Dash(props);
  } catch (e) {
    unstable_rethrow(e);
    // Vercel loglarında aranabilir bir işaret bırak.
    console.error("[pulse] ana sayfa sunucu hatası:", e);
    return <Fail message={e instanceof Error ? e.message : String(e)} />;
  }
}

async function Dash({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  // --- kim bakıyor -------------------------------------------------------
  // Auth kurulmadan önce (yerel geliştirme) kısıt yoktur; kurulduğu anda
  // her sorgu kullanıcının kapsamıyla süzülür.
  const { viewer: realViewer, reason } = authConfigured()
    ? await getSession()
    : { viewer: null, reason: null as null };
  if (authConfigured()) {
    if (!realViewer && reason === "no-session") redirect("/giris");
    if (!realViewer) redirect("/beklemede");
    if (needsMfaVerification(realViewer)) redirect("/guvenlik");
  }

  // Yönetici "Gözünden gör" ile bir sanatçının ekranına bakıyorsa, kapsam ve
  // rozet o sanatçının yetkileriyle hesaplanır. Gerçek yönetici değilse
  // resolveViewAs her zaman null döner (çerez tek başına yetki vermez).
  const preview = await resolveViewAs(realViewer);
  const viewer = preview?.viewer ?? realViewer;
  const access = authConfigured() ? scopeFor(viewer) : undefined;

  const VIEWS: ViewKey[] = ["overview", "payouts", "artists", "songs", "albums", "labels", "geo", "platforms"];
  const rawView = str("v");
  const view: ViewKey = VIEWS.includes(rawView as ViewKey) ? (rawView as ViewKey) : "overview";

  let periods, reports;
  try {
    [periods, reports] = await Promise.all([listPeriodsCached(true, access), listReportsCached(access)]);
  } catch (e) {
    return <Fail message={e instanceof Error ? e.message : "Veritabanına bağlanılamadı."} />;
  }

  if (periods.length === 0) {
    // Önizlenen sanatçının hiç yayınlanmış verisi yoksa da çıkış yolu olmalı.
    if (preview) {
      return (
        <main className="min-h-screen flex flex-col">
          <PreviewBanner info={{ artistName: preview.artistName, hasAccount: preview.hasAccount, accountEmail: preview.accountEmail }} />
          <div className="flex-1 flex items-center justify-center p-6 text-center">
            <div className="max-w-md">
              <h1 className="text-[20px] font-semibold text-ink-900">Bu sanatçı henüz hiçbir şey görmüyor</h1>
              <p className="text-[13.5px] text-ink-500 mt-2 leading-relaxed">
                {preview.artistName} için yayınlanmış bir rapor satırı yok. Sanatçı giriş yaptığında
                &quot;Henüz yayınlanmış rapor yok&quot; ekranını görür.
              </p>
            </div>
          </div>
        </main>
      );
    }
    return <NoData />;
  }

  // Ödeme Listesi tek bir ödeme partisine (rapor) bakar; diğer ekranlar
  // serbest ay/yıl seçimine. İki kapsam URL'de ayrı taşınır ki ekran
  // değiştirince diğerinin seçimi bozulmasın.
  const publishedIds = new Set(reports.filter((r) => r.status !== "draft").map((r) => r.id));
  const rawReport = str("r");
  const reportId = publishedIds.has(rawReport) ? rawReport : "all";

  // Şarkı ekranındaki "gelir devri kapsamı" kasıtlı olarak AYRI bir parametre
  // (r değil, tr) — aksi hâlde Şarkılar'da devir için seçilen ödeme partisi,
  // sekme değiştirilince Ödeme Listesi'nin kendi seçimini sessizce değiştirirdi.
  const rawTransferReport = str("tr");
  const transferReportId = publishedIds.has(rawTransferReport) ? rawTransferReport : "all";

  const validPeriods = new Set(periods.map((p) => p.id));
  const periodIds = str("p").split(",").map((x) => x.trim()).filter((x) => validPeriods.has(x));

  const scope: Scope = {
    ...(view === "payouts"
      ? (reportId === "all" ? {} : { reportId })
      : (periodIds.length ? { periodIds } : {})),
    access,
  };

  // "Bekleyen ödeme" — yalnızca Panel'de gösterilir. Yönetici herkesin,
  // sanatçı (veya önizlenen sanatçı) yalnızca kendi bekleyen tutarını görür.
  // Label yöneticisi / muhasebe için anlamlı tek bir rakam yok (bakiye
  // sanatçı bazında, label bazında değil) — gösterilmez.
  // Sekme geçişleri artık sunucuya gitmiyor (faz-z10) — bu yüzden Panel'e ve
  // Coğrafya'ya özel ek veriler hangi ekrandan girilirse girilsin baştan yüklenir.
  const pendingWho: "all" | "artist" | null =
    !authConfigured() ? "all"
      : preview || viewer?.role === "artist" ? ((viewer?.artistIds.length ?? 0) > 0 ? "artist" : null)
      : isAdmin(viewer) ? "all"
      : null;

  let result;
  let pending: { amount: number; who: "all" | "artist" } | null = null;
  let songsGeo: SongGeo[] | null = null;
  try {
    const [r, p, g] = await Promise.all([
      loadResult(scope),
      pendingWho
        ? pendingTotal(pendingWho === "all" ? null : viewer!.artistIds).catch(() => null)
        : Promise.resolve(null),
      // Coğrafya: en çok dinlenen 10 şarkı. Sanatçı hesabında — label geneli
      // yetkisi olsa bile — yalnızca KENDİ şarkıları.
      topSongsGeo(
        scope,
        viewer?.role === "artist" ? viewer.artistIds : null,
        viewer?.role === "artist" ? 5 : 10, // sanatçıda 5 yeter (Mert)
      ).catch(() => null),
    ]);
    songsGeo = g;
    // Yönetici olmayan kimse başka bir sanatçının hakedişini görmez — label
    // toplamlarını görme yetkisi olsa bile. Süzme burada, istemciye
    // gönderilmeden önce (bkz. lib/redact.ts). Önizleme de aynı kuraldan geçer.
    result = viewer && !isAdmin(viewer) ? redactOtherArtists(r, viewer.artistIds) : r;
    if (pendingWho && p !== null) pending = { amount: p, who: pendingWho };
  } catch (e) {
    // listPeriods/listReports gibi burası da opak "Application error" yerine
    // gerçek hatayı gösterir — aksi hâlde tek belirti bir Vercel digest'i
    // oluyordu ve kök nedeni teşhis etmek imkansızlaşıyordu.
    return <Fail message={e instanceof Error ? e.message : "Veritabanına bağlanılamadı."} />;
  }

  // Mali veri görüntüleme her zaman kaydedilir — kimin neye ne zaman
  // baktığı sonradan sorulabilmeli.
  if (realViewer) {
    const meta = await requestMeta();
    void audit({
      userId: realViewer.userId,
      action: preview ? "view_dashboard_as" : "view_dashboard",
      resource: preview ? `${view} · artist:${preview.artistId}` : view,
      ip: meta.ip, userAgent: meta.userAgent,
      meta: { reportId, transferReportId, periodIds, gross: Math.round(result.totals.gross * 100) / 100 },
    });
  }

  return (
    <Dashboard
      result={result}
      periods={periods}
      reports={reports}
      view={view}
      reportId={reportId}
      transferReportId={transferReportId}
      periodIds={periodIds}
      pendingPay={pending}
      songsGeo={songsGeo}
      viewer={viewer ? {
        fullName: viewer.fullName,
        email: viewer.email,
        role: viewer.role,
        isAdmin: preview ? false : isAdmin(viewer),
        artistIds: viewer.role === "artist" ? viewer.artistIds : undefined,
      } : null}
      preview={preview ? {
        artistName: preview.artistName,
        hasAccount: preview.hasAccount,
        accountEmail: preview.accountEmail,
      } : null}
    />
  );
}

function NoData() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center rise">
        <div className="inline-flex w-16 h-16 rounded-2xl bg-brand-50 items-center justify-center mb-4 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="M4NM" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-[24px] font-semibold text-ink-900 tracking-tight">M4NM Pulse</h1>
        <p className="text-[14px] text-ink-500 mt-2.5 leading-relaxed">
          Henüz yayınlanmış bir rapor yok. Yönetim ekranından ilk Excel dosyanı yükleyip
          yayınladığında dönemler burada görünecek.
        </p>
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 mt-6 px-4 py-2.5 rounded-xl text-[13.5px] font-medium bg-brand-500 text-white hover:bg-brand-600 transition-colors"
        >
          <Icon name="upload" size={16} /> Yönetime git
        </Link>
      </div>
    </main>
  );
}

function Fail({ message }: { message: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-lg rounded-xl2 bg-card border border-rose-200 shadow-card p-6">
        <div className="flex items-start gap-3">
          <Icon name="alert" size={20} className="text-accent-rose mt-0.5 shrink-0" />
          <div>
            <h1 className="text-[16px] font-semibold text-ink-900">Veriler yüklenemedi</h1>
            <p className="text-[13px] text-ink-600 mt-2 leading-relaxed">{message}</p>
            <p className="text-[12.5px] text-ink-500 mt-3 leading-relaxed">
              Sayfayı yenilemeyi dene. Sorun sürerse{" "}
              <code className="bg-canvas px-1.5 py-0.5 rounded border border-line">DATABASE_URL</code>{" "}
              ayarını kontrol et — şifrede özel karakter varsa URL kodlaması gerekir
              (<code>@</code> → <code>%40</code>).
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
