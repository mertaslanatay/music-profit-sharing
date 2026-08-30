import Link from "next/link";
import { listPeriods, loadResult, type Scope } from "@/lib/queries";
import { Dashboard } from "@/components/Dashboard";
import { Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const raw = typeof sp.d === "string" ? sp.d : "all";

  let periods;
  try {
    periods = await listPeriods();
  } catch (e) {
    return <Fail message={e instanceof Error ? e.message : "Veritabanına bağlanılamadı."} />;
  }

  if (periods.length === 0) {
    return <NoData />;
  }

  // Kapsamı çöz: "all" | "y:2026" | dönem id
  let selected = "all";
  let scope: Scope = {};
  if (raw.startsWith("y:")) {
    const year = Number(raw.slice(2));
    const ids = periods.filter((p) => p.year === year).map((p) => p.id);
    if (ids.length > 0) {
      selected = raw;
      scope = { periodIds: ids };
    }
  } else if (raw !== "all" && periods.some((p) => p.id === raw)) {
    selected = raw;
    scope = { periodIds: [raw] };
  }

  const result = await loadResult(scope);
  return <Dashboard result={result} periods={periods} selected={selected} />;
}

function NoData() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center rise">
        <div className="inline-flex w-16 h-16 rounded-2xl bg-brand-50 items-center justify-center mb-4 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="M4NM" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-[24px] font-semibold text-ink-900 tracking-tight">M4NM Music Profit</h1>
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
            <h1 className="text-[16px] font-semibold text-ink-900">Veritabanına bağlanılamadı</h1>
            <p className="text-[13px] text-ink-600 mt-2 leading-relaxed">{message}</p>
            <p className="text-[12.5px] text-ink-500 mt-3 leading-relaxed">
              <code className="bg-canvas px-1.5 py-0.5 rounded border border-line">.env.local</code>{" "}
              içindeki{" "}
              <code className="bg-canvas px-1.5 py-0.5 rounded border border-line">DATABASE_URL</code>{" "}
              değerini kontrol et. Şifrede özel karakter varsa URL kodlaması gerekir
              (<code>@</code> → <code>%40</code>).
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
