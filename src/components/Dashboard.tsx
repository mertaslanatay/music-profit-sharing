"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Result } from "@/lib/types";
import type { PeriodRow, ReportRow, SongGeo } from "@/lib/queries";
import { NotificationBell } from "./NotificationBell";
import { MenuButton, NavShell } from "./MobileNav";
import { exportWorkbook } from "@/lib/export";
import { scopeArtistToLabel } from "@/lib/calc";
import { money, num, pct } from "@/lib/format";

import { Sidebar, type ViewKey, type ViewerBadge } from "./Sidebar";
import { AnalysisPicker, PayoutPicker } from "./PeriodPicker";
import { Button, Icon, InfoTip } from "./ui";
import { Overview } from "./views/Overview";
import { Payouts } from "./views/Payouts";
import { Songs } from "./views/Songs";
import { Labels } from "./views/Labels";
import { Breakdown } from "./views/Breakdown";
import { ArtistPanel } from "./views/ArtistPanel";
import { Artists } from "./views/Artists";
import { Albums } from "./views/Albums";
import { PreviewBanner, startPreview, type PreviewInfo } from "./PreviewBanner";
import { buildAlbums } from "@/lib/catalog";
import { ThemeToggle } from "./theme";
import type { ArtistAgg } from "@/lib/types";

/**
 * Excel indir yalnızca rapor niteliğindeki ekranda: Ödeme Listesi. İndirilen
 * dosya zaten tüm kırılımları (sanatçı, şarkı, label, ülke, platform) ayrı
 * sayfalarda içeriyor; her ekranda ayrı düğme gereksiz tekrar.
 */
const EXPORT_VIEWS: ViewKey[] = ["payouts"];

/** Üstteki arama kutusunun gerçekten süzdüğü ekranlar. */
const SEARCHABLE: ViewKey[] = ["payouts", "songs", "geo", "platforms"];

const TITLES: Record<ViewKey, { title: string; sub: string }> = {
  overview: { title: "Panel", sub: "Genel görünüm ve hakediş özeti" },
  payouts: { title: "Ödeme Listesi", sub: "Sanatçı bazında net hakedişler" },
  artists: { title: "Sanatçılar", sub: "Kapsamdaki tüm sanatçılar" },
  songs: { title: "Şarkılar", sub: "Şarkı ve albüm bazında gelir" },
  albums: { title: "Albümler", sub: "Albüm bazında gelir ve şarkılar" },
  labels: { title: "Label", sub: "Label bazında gelir kırılımı" },
  geo: { title: "Coğrafya", sub: "Gelirin geldiği ülkeler" },
  platforms: { title: "Platformlar", sub: "Streaming servisi kırılımı" },
  rules: { title: "Kurallar", sub: "Bölüşüm ayarları" },
};

export function Dashboard({
  result,
  periods,
  reports,
  view,
  reportId,
  transferReportId,
  periodIds,
  viewer = null,
  preview = null,
  pendingPay = null,
  songsGeo = null,
}: {
  result: Result;
  periods: PeriodRow[];
  reports: ReportRow[];
  view: ViewKey;
  /** Ödeme Listesi kapsamı: rapor id veya "all" */
  reportId: string;
  /**
   * Şarkılar ekranındaki "gelir devri kapsamı" — reportId'den KASITLI olarak
   * ayrı bir durum. Aynı param olsaydı Şarkılar'da devir için seçilen rapor,
   * sekme değiştirince Ödeme Listesi'nin seçimini sessizce değiştirirdi.
   */
  transferReportId: string;
  /** Diğer ekranların kapsamı: seçili dönem id'leri (boş = tüm zamanlar) */
  periodIds: string[];
  /** Oturum açık kullanıcı — auth kurulmadan önce null */
  viewer?: ViewerBadge | null;
  /** Yönetici bir sanatçının gözünden bakıyorsa dolu (bkz. lib/viewAs.ts). */
  preview?: PreviewInfo | null;
  /** Panel'deki "Bekleyen ödeme" — henüz ödenmemiş net hakediş, tüm dönemler. */
  pendingPay?: { amount: number; who: "all" | "artist" } | null;
  /** Coğrafya ekranındaki "en çok dinlenen 10 şarkı" kartı. */
  songsGeo?: SongGeo[] | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [precise, setPrecise] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [artistKey, setArtistKey] = useState<string | null>(null);
  const [artistLabel, setArtistLabel] = useState<string | null>(null);
  const onArtist = (key: string, label?: string) => {
    setArtistKey(key);
    setArtistLabel(label ?? null);
  };

  const nav = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => router.push(qs ? `/?${qs}` : "/"));
  };

  const setView = (v: ViewKey) => {
    setQuery("");
    nav({ v: v === "overview" ? null : v });
  };

  const artist = useMemo(() => {
    if (!artistKey) return null;
    const base = result.artists.find((a) => a.key === artistKey) ?? null;
    if (!base) return null;
    return artistLabel ? scopeArtistToLabel(base, artistLabel, result.totals.netRate) : base;
  }, [result.artists, result.totals.netRate, artistKey, artistLabel]);

  const isPayouts = view === "payouts";
  const scopeLabel = isPayouts
    ? (reportId === "all"
        ? "Tüm zamanlar"
        : (() => {
            const r = reports.find((x) => x.id === reportId);
            return r ? `${r.periodRange}${r.periodDisplay ? ` (${r.periodDisplay})` : ""}` : "Ödeme partisi";
          })())
    : periodIds.length === 0
      ? "Tüm zamanlar"
      : periodIds.length === 1
        ? (periods.find((p) => p.id === periodIds[0])?.display ?? "1 dönem")
        : `${periodIds.length} dönem`;

  const meta = view === "artists" && viewer?.role === "artist"
    ? { title: "Sanatçı profillerim", sub: "Hesabına bağlı sanatçı adların ve hakedişleri" }
    : TITLES[view];
  const t = result.totals;

  // Sanatçılar ekranı tek sanatçılık bir hesapta anlamsız (yalnızca kendini
  // görür) — gizlenir. Sayaçlar dönem seçimine göre değişir.
  const albumCount = useMemo(() => buildAlbums(result).length, [result]);

  // Sanatçı hesabında "Sanatçılar" bölümü yalnızca HESABA BAĞLI sanatçı
  // kimliklerini gösterir (ör. bir kişinin iki ayrı sahne adı). Label geneli
  // görme yetkisi olsa bile burada diğer sanatçıların net hakedişi listelenmez.
  const artistMode = viewer?.role === "artist";
  const ownIds = useMemo(() => new Set(viewer?.artistIds ?? []), [viewer?.artistIds]);
  const catalogRes = useMemo(
    () => (artistMode ? { ...result, artists: result.artists.filter((a) => a.id && ownIds.has(a.id)) } : result),
    [artistMode, result, ownIds]
  );
  // Sunucu, yönetici olmayana yalnızca kendi sanatçı satırlarını gönderiyor
  // (lib/redact.ts). Kendi sanatçısı olmayan bir label yöneticisinde Ödeme
  // Listesi ve Sanatçılar boş kalacağı için menüden kalkar.
  const nonAdmin = !!viewer && !viewer.isAdmin;
  const hidden: ViewKey[] = artistMode
    ? (catalogRes.artists.length > 0 ? [] : ["artists"])
    : nonAdmin
      ? (result.artists.length > 0 ? ["artists"] : ["artists", "payouts"])
      : (result.artists.length > 1 ? [] : ["artists"]);
  const navLabels: Partial<Record<ViewKey, string>> = artistMode ? { artists: "Profillerim" } : {};
  const counts: Partial<Record<ViewKey, number>> = {
    artists: catalogRes.artists.length,
    songs: result.songs.length,
    albums: albumCount,
  };
  const [previewBusy, setPreviewBusy] = useState(false);
  const onViewAs = viewer?.isAdmin && !preview
    ? async (a: ArtistAgg) => {
        if (!a.id || previewBusy) return;
        setPreviewBusy(true);
        const err = await startPreview(a.id);
        if (err) { setPreviewBusy(false); window.alert(err); }
      }
    : undefined;

  return (
    <main className="flex h-screen overflow-hidden">
      <NavShell open={navOpen} onClose={() => setNavOpen(false)}>
      <Sidebar
        view={view}
        onView={(v) => { setNavOpen(false); setView(v); }}
        onReset={() => router.push("/admin")}
        hideRules
        viewer={viewer}
        counts={counts}
        hidden={hidden}
        labels={navLabels}
        preview={!!preview}
      />
      </NavShell>

      <div className="flex-1 flex flex-col min-w-0">
        {preview && <PreviewBanner info={preview} />}
        <header className="relative z-30 bg-canvas/85 backdrop-blur border-b border-line px-4 sm:px-8 py-3 sm:py-3.5 flex items-center gap-3 sm:gap-4 shrink-0 no-print">
          <MenuButton open={navOpen} onClick={() => setNavOpen(true)} />
          <div className="min-w-0">
            <h1 className="font-display text-[20px] font-bold tracking-[-0.025em] text-ink-900 leading-tight">{meta.title}</h1>
            <p className="text-[12.5px] text-ink-400 leading-tight mt-0.5 hidden sm:block truncate">{meta.sub}</p>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
            {SEARCHABLE.includes(view) && (
            <div className="relative hidden md:block">
              <Icon name="search" size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Sanatçı, şarkı, ülke ara…"
                className="w-64 h-10 rounded-xl border border-line bg-card pl-9 pr-3 text-[13.5px] text-ink-900 placeholder:text-ink-400 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 transition-all"
              />
              {query && (
                <button onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-300 hover:text-ink-700">
                  <Icon name="close" size={14} />
                </button>
              )}
            </div>
            )}

            <button
              type="button"
              role="switch"
              aria-checked={precise}
              onClick={() => setPrecise(!precise)}
              title="Mikro tutarları 4 ondalıkla göster"
              className="hidden sm:inline-flex h-10 items-center gap-2.5 px-3 rounded-xl text-[12.5px] font-medium border border-line bg-card text-ink-600 hover:text-ink-900 transition-colors"
            >
              <span className={`relative w-8 h-[18px] rounded-full transition-colors ${precise ? "bg-brand-500" : "bg-ink-900/15"}`}>
                <span className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform duration-300 ease-out ${precise ? "translate-x-[14px]" : ""}`} />
              </span>
              Kuruş hassasiyeti
            </button>

            {/* Bildirim zili artık kenar çubuğunda değil, birincil eylemin
                (Excel indir) hemen solunda — kullanıcı bakışının zaten
                düştüğü yer burası. Birincil eylem en sağda kalıyor. */}
            <ThemeToggle size="sm" />

            {viewer && !preview && <NotificationBell compact />}

            {EXPORT_VIEWS.includes(view) && viewer?.role !== "artist" && (
            <Button
              onClick={() => {
                // Denetim kaydı: indirmeyi engellemesin diye sonucu beklemiyoruz.
                void fetch("/api/audit/export", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ scope: scopeLabel, rowCount: t.rowCount, gross: t.gross }),
                });
                exportWorkbook(result, scopeLabel);
              }}
              variant="primary"
            >
              <Icon name="download" size={15} />
              <span className="hidden sm:inline">Excel indir</span>
            </Button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto scroll-thin px-4 sm:px-8 lg:px-10 py-5 sm:py-6 space-y-5">
          {/* ------------------------------------------------ dönem seçici */}
          <div className={`rounded-[22px] bg-card border border-line p-4 flex flex-wrap items-center gap-x-6 gap-y-3 transition-opacity ${pending ? "opacity-60" : ""}`}>
            {isPayouts ? (
              <PayoutPicker
                reports={reports}
                value={reportId}
                onChange={(v) => nav({ r: v === "all" ? null : v })}
                pending={pending}
              />
            ) : (
              <AnalysisPicker
                periods={periods}
                selected={periodIds}
                onChange={(ids) => nav({ p: ids.length ? ids.join(",") : null })}
                pending={pending}
              />
            )}

            {isPayouts && (
              <InfoTip label="Ödeme partisi nedir?">
                Bir ödeme partisi = bankana yatan tek bir transfer. Excel&apos;deki birden fazla dönemi
                birlikte kapsayabilir. Ödeme listesi bu yüzden dönemle değil partiyle süzülür.
              </InfoTip>
            )}

            {/* Şarkı ekranındaki liste dönem bazlı süzülür (yukarıdaki seçici);
                gelir devri ise HER ZAMAN tek bir ödeme partisine bağlıdır — bu
                yüzden ayrı bir seçici gerekiyor. Kapalıyken satırlar tıklanmaz.
                KASITLI OLARAK reportId DEĞİL transferReportId kullanılıyor —
                aksi hâlde Ödeme Listesi'nin kendi seçimi sessizce değişirdi. */}
            {view === "songs" && (
              <PayoutPicker
                reports={reports}
                value={transferReportId}
                onChange={(v) => nav({ tr: v === "all" ? null : v })}
                pending={pending}
                label="Gelir devri kapsamı"
                offLabel="Kapalı"
                icon="split"
              />
            )}
            {view === "songs" && (
              <InfoTip label="Gelir devri kapsamı nedir?">
                Liste soldaki dönem seçicisiyle süzülür. Gelir hakkı devri ise her zaman tek bir ödeme
                partisine yazılır: bir parti seçince o partideki şarkılarda devir simgesi çıkar.
              </InfoTip>
            )}

            {/* Kapsamın para özeti — seçicinin hemen yanında, çünkü bu rakamlar
                seçilen yıl/dönemle birlikte değişir. Panel'de net büyük rakam
                olarak aşağıda durduğu için burada tekrar edilmez. */}
            <div className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-3">
              <Field label="Brüt gelir" value={money(t.gross, precise)} />
              <Field
                label="Banka kesintisi"
                value={t.deduction ? `−${money(t.deduction)}` : "Yok"}
                sub={t.deduction ? `${pct(t.deductionRate, 2)} · SWIFT` : undefined}
                tone={t.deduction ? "rose" : "muted"}
                title="Ödeme bankaya gelirken SWIFT transferinde kesilen tutar. Sanatçılara gelirleri oranında yansıtılır."
              />
              {view !== "overview" && (
                <div className="rounded-xl bg-brand-50 px-3.5 py-2 relative">
                  {pending && (
                    <span className="absolute inset-0 rounded-xl bg-brand-50 flex items-center justify-center">
                      <span className="text-[11px] text-brand-700/60">hesaplanıyor…</span>
                    </span>
                  )}
                  {/* "Dağıtılacak" yalnızca TEK bir ödeme partisi seçiliyken
                      doğru: o partinin sanatçılara dağıtılacak tutarı. Diğer
                      her kapsamda bu rakam ödenmişleri de içeren net hakediştir. */}
                  <p className="text-[10.5px] font-medium text-brand-700/70 leading-tight uppercase tracking-wide">
                    {isPayouts && reportId !== "all" ? "Dağıtılacak net" : "Net hakediş"}
                  </p>
                  <p className="font-display text-[18px] font-bold text-brand-700 tabular leading-tight mt-0.5">
                    {money(t.received)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {t.negativeRows > 0 && view === "overview" && (
            <div className="rounded-xl2 bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2.5">
              <Icon name="alert" size={16} className="text-accent-amber mt-0.5 shrink-0" />
              <p className="text-[12.5px] text-amber-900">
                Bu kapsamda <b>{num(t.negativeRows)}</b> negatif satır var (iade / düzeltme).
                Toplamdan düşüldüler — gizlenmediler.
              </p>
            </div>
          )}

          <div className="rise" key={`${view}-${reportId}-${transferReportId}-${periodIds.join(",")}`}>
            {view === "overview" && (
              <Overview res={result} precise={precise} onArtist={onArtist}
                scopeLabel={scopeLabel} pending={pendingPay} />
            )}
            {view === "payouts" && <Payouts res={result} precise={precise} query={query} onArtist={onArtist} />}
            {view === "songs" && (
              <Songs
                res={result}
                precise={precise}
                query={query}
                reportId={transferReportId}
                reportLabel={
                  transferReportId === "all"
                    ? null
                    : (() => {
                        const r = reports.find((x) => x.id === transferReportId);
                        return r ? `${r.periodRange}${r.periodDisplay ? ` — ${r.periodDisplay}` : ""}` : null;
                      })()
                }
                onClearReport={() => nav({ tr: null })}
                onChanged={() => router.refresh()}
              />
            )}
            {view === "artists" && (
              <Artists res={catalogRes} periods={periods} precise={precise}
                onArtist={(k) => onArtist(k)} onViewAs={onViewAs} />
            )}
            {view === "albums" && (
              <Albums res={result} periods={periods} precise={precise} onArtist={(k) => onArtist(k)}
                openableArtistKeys={artistMode ? new Set(catalogRes.artists.map((a) => a.key)) : undefined} />
            )}
            {view === "labels" && <Labels res={result} precise={precise} onArtist={onArtist} />}
            {view === "geo" && (
              <Breakdown res={result} precise={precise} query={query} mode="geo"
                songsGeo={songsGeo} ownSongs={viewer?.role === "artist"} />
            )}
            {view === "platforms" && <Breakdown res={result} precise={precise} query={query} mode="platform" />}
          </div>

          <footer className="pt-2 pb-1 flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-ink-300">
            <span>
              {scopeLabel} · {num(t.rowCount)} satır · {num(t.artistCount)} sanatçı ·{" "}
              {num(t.songCount)} şarkı · brüt {money(t.gross, precise)}
            </span>
          </footer>
        </div>
      </div>

      {artist && (
        <ArtistPanel
          artist={artist}
          res={result}
          precise={precise}
          labelScope={artistLabel}
          onViewAs={onViewAs && artist.id ? () => onViewAs(artist) : undefined}
          onClose={() => {
            setArtistKey(null);
            setArtistLabel(null);
          }}
        />
      )}
    </main>
  );
}

function Field({ label, value, sub, tone = "default", title }: {
  label: string; value: string; sub?: string; tone?: "default" | "rose" | "muted"; title?: string;
}) {
  const color = { default: "text-ink-900", rose: "text-accent-rose", muted: "text-ink-300" }[tone];
  return (
    <div className="hidden sm:block" title={title}>
      <p className="text-[11px] font-medium text-ink-400 mb-1">{label}</p>
      <p className={`text-[14px] font-semibold tabular leading-tight ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink-400 tabular mt-0.5">{sub}</p>}
    </div>
  );
}
