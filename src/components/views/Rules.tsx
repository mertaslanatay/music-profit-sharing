"use client";

import { useMemo, useState } from "react";
import type { EngineConfig, Result, SplitOptions } from "@/lib/types";
import { foldKey } from "@/lib/normalize";
import { splitArtists } from "@/lib/artists";
import { money, moneySmart, num, pct } from "@/lib/format";
import { Avatar, Button, Card, CardHead, Empty, Icon, Td, Th } from "../ui";

type Tab = "split" | "overrides" | "aliases";

export function Rules({
  res,
  cfg,
  onCfg,
  precise,
}: {
  res: Result;
  cfg: EngineConfig;
  onCfg: (c: EngineConfig) => void;
  precise: boolean;
}) {
  const [tab, setTab] = useState<Tab>("split");
  const overrideCount = Object.keys(cfg.overrides).length;
  const aliasCount = Object.keys(cfg.aliases).length;

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "split", label: "Ayırıcılar" },
    { key: "overrides", label: "Özel Oranlar", badge: overrideCount },
    { key: "aliases", label: "İsim Birleştirme", badge: aliasCount || res.aliasSuggestions.length },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-[13px] font-medium transition-colors inline-flex items-center gap-2 ${
              tab === t.key
                ? "bg-ink-900 text-white"
                : "bg-card border border-line text-ink-700 hover:bg-ink-900/[0.03]"
            }`}
          >
            {t.label}
            {t.badge ? (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  tab === t.key ? "bg-white/25" : "bg-accent-amber/15 text-accent-amber"
                }`}
              >
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "split" && <SplitTab cfg={cfg} onCfg={onCfg} res={res} />}
      {tab === "overrides" && <OverridesTab cfg={cfg} onCfg={onCfg} res={res} precise={precise} />}
      {tab === "aliases" && <AliasTab cfg={cfg} onCfg={onCfg} res={res} precise={precise} />}
    </div>
  );
}

/* ---------------------------------------------------------------- Ayırıcılar */

const SEP_INFO: { key: keyof SplitOptions; label: string; example: string; warn?: string }[] = [
  { key: "comma", label: "Virgül  ,", example: "Ağaçkakan, Oldeaf → 2 sanatçı" },
  { key: "feat", label: "feat. / ft. / featuring", example: "Cxngxvxr feat. Ağaçkakan → 2 sanatçı" },
  {
    key: "x",
    label: "Boşluklu  x",
    example: "Ağaçkakan x Savai x Emiladil → 3 sanatçı",
    warn: "Adında ayrı bir 'x' kelimesi geçen sanatçı varsa kapat",
  },
  { key: "amp", label: "Ampersan  &", example: "Slow Man & Sybra → 2 sanatçı", warn: "Grup adlarını bölebilir" },
  { key: "vs", label: "vs. / versus", example: "A vs. B → 2 sanatçı" },
  { key: "slash", label: "Bölü  /", example: "A / B → 2 sanatçı", warn: "AC/DC gibi adları böler" },
];

function SplitTab({
  cfg,
  onCfg,
  res,
}: {
  cfg: EngineConfig;
  onCfg: (c: EngineConfig) => void;
  res: Result;
}) {
  const [test, setTest] = useState("Ağaçkakan, Emiladil feat. Barış Demirel");
  // Motorun kendi fonksiyonunu kullaniyoruz - onizleme ile hesap birebir ayni.
  const parts = useMemo(() => splitArtists(test, cfg.split), [test, cfg.split]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHead
          title="Sanatçı ayırıcıları"
          sub="Bir sanatçı dizisinin hangi işaretlerde bölüneceğini belirler"
        />
        <div className="space-y-1">
          {SEP_INFO.map((s) => {
            const on = cfg.split[s.key];
            return (
              <button
                key={s.key}
                onClick={() =>
                  onCfg({ ...cfg, split: { ...cfg.split, [s.key]: !on } })
                }
                className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-ink-900/[0.03] transition-colors text-left"
              >
                <span
                  className={`w-9 h-5 rounded-full shrink-0 mt-0.5 transition-colors relative ${
                    on ? "bg-brand-500" : "bg-ink-900/15"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${
                      on ? "left-[18px]" : "left-0.5"
                    }`}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink-900">{s.label}</p>
                  <p className="text-[11.5px] text-ink-400 mt-0.5 font-mono">{s.example}</p>
                  {s.warn && on && (
                    <p className="text-[11px] text-accent-amber mt-1 flex items-start gap-1">
                      <Icon name="alert" size={12} className="mt-0.5 shrink-0" />
                      {s.warn}
                    </p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHead title="Canlı test" sub="Bir sanatçı dizisi yaz, nasıl bölündüğünü gör" />
          <input
            value={test}
            onChange={(e) => setTest(e.target.value)}
            className="w-full rounded-xl border border-line px-3.5 py-2.5 text-[13.5px] outline-none focus:border-brand-500 transition-colors"
            placeholder="Ağaçkakan, Oldeaf feat. Çiğ"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {parts.map((p, i) => (
              <span
                key={`${p}-${i}`}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12.5px] font-medium ${
                  i === 0 ? "bg-brand-50 text-brand-700" : "bg-ink-900/[0.05] text-ink-700"
                }`}
              >
                {i === 0 && <Icon name="check" size={13} strokeWidth={2.4} />}
                {p}
                <span className="text-[10.5px] opacity-60">
                  {parts.length > 0 ? `%${(100 / parts.length).toFixed(1).replace(".", ",")}` : ""}
                </span>
              </span>
            ))}
          </div>
          <p className="text-[11.5px] text-ink-400 mt-3">
            Yeşil olan <b>ana sanatçı</b> — dizideki ilk isim her zaman ana sanatçı sayılır.
          </p>
        </Card>

        <Card>
          <CardHead title="Bu ayarların etkisi" />
          <div className="grid grid-cols-2 gap-3">
            <Metric label="Tanınan sanatçı" value={num(res.totals.artistCount)} />
            <Metric label="Ortak yapım" value={num(res.combos.length)} />
            <Metric
              label="En kalabalık yapım"
              value={`${Math.max(0, ...res.combos.map((c) => c.parts.length))} kişi`}
            />
            <Metric
              label="Bölüştürülen gelir"
              value={money(res.combos.reduce((a, c) => a + c.gross, 0), false)}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-ink-900/[0.03] p-3.5">
      <p className="text-[11px] text-ink-400 mb-1">{label}</p>
      <p className="text-[16px] font-semibold text-ink-900 tabular">{value}</p>
    </div>
  );
}

/* ------------------------------------------------------------- Özel oranlar */

function OverridesTab({
  cfg,
  onCfg,
  res,
  precise,
}: {
  cfg: EngineConfig;
  onCfg: (c: EngineConfig) => void;
  res: Result;
  precise: boolean;
}) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);

  const list = useMemo(() => {
    const k = foldKey(q);
    return res.combos.filter((c) => (k ? foldKey(c.artistString).includes(k) : true));
  }, [res.combos, q]);

  const setWeights = (artistString: string, weights: number[] | null) => {
    const next = { ...cfg.overrides };
    if (weights === null) delete next[artistString];
    else next[artistString] = weights;
    onCfg({ ...cfg, overrides: next });
  };

  return (
    <Card pad={false}>
      <div className="px-5 py-4 border-b border-line flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink-900">Özel bölüşüm oranları</h3>
          <p className="text-[12.5px] text-ink-500 mt-0.5">
            Varsayılan eşit bölüşüm. Bir yapım için farklı oran gerekiyorsa buradan gir —
            kaydedilir, sonraki yüklemelerde otomatik uygulanır.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {Object.keys(cfg.overrides).length > 0 && (
            <Button variant="danger" onClick={() => onCfg({ ...cfg, overrides: {} })}>
              <Icon name="trash" size={14} /> Tümünü sıfırla
            </Button>
          )}
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Yapım ara…"
            className="rounded-xl border border-line px-3 py-1.5 text-[12.5px] outline-none focus:border-brand-500 transition-colors w-48"
          />
        </div>
      </div>

      {list.length === 0 ? (
        <Empty title="Ortak yapım bulunamadı" sub="Bu raporda birden fazla sanatçılı kayıt yok." />
      ) : (
        <div className="divide-y divide-line">
          {list.slice(0, 120).map((c) => {
            const isEditing = editing === c.artistString;
            return (
              <div key={c.artistString} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-ink-900 truncate">
                      {c.artistString}
                    </p>
                    <p className="text-[11.5px] text-ink-400 mt-0.5">
                      {c.parts.length} sanatçı · {num(c.songCount)} şarkı · {moneySmart(c.gross, precise)}
                      {c.isOverridden && (
                        <span className="ml-2 text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-accent-amber/15 text-accent-amber">
                          ÖZEL ORAN
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.isOverridden && (
                      <Button variant="soft" onClick={() => setWeights(c.artistString, null)}>
                        Eşite dön
                      </Button>
                    )}
                    <Button
                      variant={isEditing ? "primary" : "ghost"}
                      onClick={() => setEditing(isEditing ? null : c.artistString)}
                    >
                      {isEditing ? "Kapat" : "Oran gir"}
                    </Button>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {c.parts.map((p, i) => (
                    <span
                      key={`${p}-${i}`}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] ${
                        i === 0 ? "bg-brand-50 text-brand-700" : "bg-ink-900/[0.05] text-ink-700"
                      }`}
                    >
                      {p}
                      <b className="tabular">{pct(c.weights[i] ?? 0, 1)}</b>
                    </span>
                  ))}
                </div>

                {isEditing && (
                  <WeightEditor
                    parts={c.parts}
                    weights={c.weights}
                    onSave={(w) => {
                      setWeights(c.artistString, w);
                      setEditing(null);
                    }}
                  />
                )}
              </div>
            );
          })}
          {list.length > 120 && (
            <p className="text-center text-[12px] text-ink-400 py-3">
              İlk 120 yapım gösteriliyor · aramayı daralt
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function WeightEditor({
  parts,
  weights,
  onSave,
}: {
  parts: string[];
  weights: number[];
  onSave: (w: number[]) => void;
}) {
  const [vals, setVals] = useState<string[]>(() =>
    parts.map((_, i) => ((weights[i] ?? 0) * 100).toFixed(1).replace(/\.0$/, ""))
  );

  const nums = vals.map((v) => {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  const sum = nums.reduce((a, b) => a + b, 0);

  return (
    <div className="mt-3.5 rounded-xl bg-ink-900/[0.03] p-4 fade-in">
      <p className="text-[11.5px] font-medium text-ink-500 mb-3">
        Her sanatçının yüzdesini gir. Toplam 100 olmasa da orantılı normalize edilir.
      </p>
      <div className="space-y-2">
        {parts.map((p, i) => (
          <div key={`${p}-${i}`} className="flex items-center gap-3">
            <span className="text-[12.5px] text-ink-700 flex-1 truncate">
              {i === 0 && <b className="text-brand-600 mr-1.5">ana</b>}
              {p}
            </span>
            <div className="relative">
              <input
                value={vals[i]}
                onChange={(e) => {
                  const next = [...vals];
                  next[i] = e.target.value;
                  setVals(next);
                }}
                inputMode="decimal"
                className="w-20 rounded-lg border border-line pl-2.5 pr-6 py-1.5 text-[13px] tabular text-right bg-white outline-none focus:border-brand-500 transition-colors"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-ink-300 pointer-events-none">
                %
              </span>
            </div>
            <span className="text-[11.5px] text-ink-400 tabular w-14 text-right">
              → {sum > 0 ? pct(nums[i] / sum, 1) : "—"}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-line">
        <span className={`text-[12px] tabular ${Math.abs(sum - 100) < 0.01 ? "text-brand-600" : "text-ink-400"}`}>
          Toplam: %{sum.toFixed(1).replace(".", ",")}
        </span>
        <div className="flex gap-2">
          <Button
            variant="soft"
            onClick={() => setVals(parts.map(() => (100 / parts.length).toFixed(1)))}
          >
            Eşitle
          </Button>
          <Button variant="primary" onClick={() => onSave(nums)} disabled={sum <= 0}>
            <Icon name="check" size={14} strokeWidth={2.4} /> Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- İsim birleştirme */

function AliasTab({
  cfg,
  onCfg,
  res,
  precise,
}: {
  cfg: EngineConfig;
  onCfg: (c: EngineConfig) => void;
  res: Result;
  precise: boolean;
}) {
  const [manualFrom, setManualFrom] = useState("");
  const [manualTo, setManualTo] = useState("");

  const nameByKey = new Map(res.artists.map((a) => [a.key, a.name] as const));
  const active = Object.entries(cfg.aliases);

  const apply = (from: string, to: string) => {
    if (!from || !to || from === to) return;
    onCfg({ ...cfg, aliases: { ...cfg.aliases, [from]: to } });
  };

  const remove = (from: string) => {
    const next = { ...cfg.aliases };
    delete next[from];
    onCfg({ ...cfg, aliases: next });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl2 bg-brand-50 border border-brand-100 p-4 flex items-start gap-3">
        <Icon name="merge" size={17} className="text-brand-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-[13px] font-medium text-brand-700">Otomatik birleştirme zaten aktif</p>
          <p className="text-[12px] text-brand-700/75 mt-1 leading-relaxed">
            Büyük/küçük harf ve Türkçe karakter farkları otomatik birleştirilir —
            <b> AĞAÇKAKAN</b> ile <b>Ağaçkakan</b>, <b>hrsz</b> ile <b>Hrsz</b> aynı kişi sayılır.
            Aşağıdakiler ise emin olamadığım, onayını beklediğim eşleşmeler.
          </p>
        </div>
      </div>

      {res.aliasSuggestions.length > 0 && (
        <Card pad={false}>
          <div className="px-5 py-4 border-b border-line">
            <h3 className="text-[15px] font-semibold text-ink-900">Öneriler</h3>
            <p className="text-[12.5px] text-ink-500 mt-0.5">
              Aynı kişi olabilecek {res.aliasSuggestions.length} isim çifti bulundu
            </p>
          </div>
          <div className="divide-y divide-line">
            {res.aliasSuggestions.map((s) => (
              <div key={`${s.from}-${s.to}`} className="px-5 py-3 flex items-center gap-4">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Avatar name={s.fromName} size={28} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink-900 truncate">{s.fromName}</p>
                    <p className="text-[11px] text-ink-400">{moneySmart(s.fromGross, precise)}</p>
                  </div>
                </div>
                <Icon name="merge" size={15} className="text-ink-300 shrink-0" />
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Avatar name={s.toName} size={28} />
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-ink-900 truncate">{s.toName}</p>
                    <p className="text-[11px] text-ink-400">{moneySmart(s.toGross, precise)}</p>
                  </div>
                </div>
                <span className="text-[11px] text-ink-400 hidden lg:block max-w-[200px] truncate">
                  {s.reason}
                </span>
                <Button variant="primary" onClick={() => apply(s.from, s.to)}>
                  <Icon name="check" size={14} strokeWidth={2.4} /> Birleştir
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHead title="Elle birleştir" sub="Listede olmayan bir eşleşmeyi kendin kur" />
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11.5px] font-medium text-ink-400 mb-1.5">
              Bu sanatçı…
            </label>
            <select
              value={manualFrom}
              onChange={(e) => setManualFrom(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2 text-[13px] bg-white outline-none focus:border-brand-500"
            >
              <option value="">seç…</option>
              {res.artists.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name} — {money(a.gross, a.gross < 1)}
                </option>
              ))}
            </select>
          </div>
          <Icon name="merge" size={17} className="text-ink-300 mb-2.5" />
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11.5px] font-medium text-ink-400 mb-1.5">
              …bu sanatçıya bağlansın
            </label>
            <select
              value={manualTo}
              onChange={(e) => setManualTo(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2 text-[13px] bg-white outline-none focus:border-brand-500"
            >
              <option value="">seç…</option>
              {res.artists.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.name} — {money(a.gross, a.gross < 1)}
                </option>
              ))}
            </select>
          </div>
          <Button
            variant="primary"
            disabled={!manualFrom || !manualTo || manualFrom === manualTo}
            onClick={() => {
              apply(manualFrom, manualTo);
              setManualFrom("");
              setManualTo("");
            }}
          >
            Birleştir
          </Button>
        </div>
      </Card>

      <Card pad={false}>
        <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-ink-900">Aktif birleştirmeler</h3>
            <p className="text-[12.5px] text-ink-500 mt-0.5">{active.length} kural</p>
          </div>
          {active.length > 0 && (
            <Button variant="danger" onClick={() => onCfg({ ...cfg, aliases: {} })}>
              <Icon name="trash" size={14} /> Tümünü kaldır
            </Button>
          )}
        </div>
        {active.length === 0 ? (
          <Empty
            title="Henüz birleştirme yok"
            sub="Yukarıdaki önerilerden veya elle ekleyebilirsin."
            icon={<Icon name="merge" />}
          />
        ) : (
          <table className="w-full">
            <thead className="bg-ink-900/[0.02] border-b border-line">
              <tr>
                <Th align="left">Kaynak</Th>
                <Th align="left">Hedef</Th>
                <Th align="right">İşlem</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {active.map(([from, to]) => (
                <tr key={from}>
                  <Td className="font-mono text-[12px] text-ink-500">{from}</Td>
                  <Td>
                    <span className="inline-flex items-center gap-2">
                      <Avatar name={nameByKey.get(to) ?? to} size={22} />
                      <span className="font-medium text-ink-900">{nameByKey.get(to) ?? to}</span>
                    </span>
                  </Td>
                  <Td align="right">
                    <button
                      onClick={() => remove(from)}
                      className="text-[12px] text-ink-400 hover:text-accent-rose transition-colors"
                    >
                      Kaldır
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
