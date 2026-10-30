/**
 * Yönetim ekranı açılırken gösterilen iskelet.
 *
 * Sayfa sunucuda 7 sorgu çalıştırıyor; bu dosya olmadan "Yönetim"e tıklayınca
 * cevap gelene kadar ekranda hiçbir şey değişmiyor ve tıklama çalışmıyor gibi
 * görünüyordu. Next.js bu bileşeni tıklama anında gösterir, veri gelince
 * gerçek sayfayla değiştirir. Yerleşim AdminTabs + AdminSidebar ile aynı,
 * böylece geçişte zıplama olmaz.
 */
export default function AdminLoading() {
  return (
    <main className="flex h-screen overflow-hidden" aria-busy="true" aria-label="Yönetim yükleniyor">
      <aside className="w-[232px] shrink-0 bg-card border-r border-line flex flex-col h-full">
        <div className="px-5 pt-5 pb-4 flex items-center gap-2.5">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 animate-pulse" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-14 rounded bg-ink-900/[0.06] animate-pulse" />
            <div className="h-3 w-16 rounded bg-ink-900/[0.06] animate-pulse" />
          </div>
        </div>
        <div className="px-3 pt-4 space-y-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-9 rounded-xl bg-ink-900/[0.04] animate-pulse" />
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-[57px] shrink-0 border-b border-line bg-card px-6 flex items-center">
          <div className="space-y-1.5">
            <div className="h-4 w-28 rounded bg-ink-900/[0.07] animate-pulse" />
            <div className="h-3 w-48 rounded bg-ink-900/[0.05] animate-pulse" />
          </div>
        </div>
        <div className="flex-1 p-6 space-y-5">
          <div className="h-40 rounded-xl2 bg-card border border-line animate-pulse" />
          <div className="rounded-xl2 bg-card border border-line p-5 space-y-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="h-8 rounded-lg bg-ink-900/[0.04] animate-pulse" />
            ))}
          </div>
          <p className="text-[12.5px] text-ink-400">Yönetim ekranı yükleniyor…</p>
        </div>
      </div>
    </main>
  );
}
