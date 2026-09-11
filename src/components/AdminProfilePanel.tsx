"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";
import { Button, Card, Icon, PrefToggle } from "./ui";

interface Profil {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneCountry: string;
  notifyEmailSupport: boolean;
  notifyEmailPayout: boolean;
  notifyEmailAnnouncement: boolean;
}

const BOS: Profil = {
  firstName: "", lastName: "", email: "",
  phone: "", phoneCountry: DEFAULT_COUNTRY,
  notifyEmailSupport: false, notifyEmailPayout: false, notifyEmailAnnouncement: false,
};

/**
 * Yöneticinin KENDİ bilgileri (yönetim paneli > Profilim).
 *
 * Sanatçı tarafındaki /hesabim > İletişim Tercihleri ekranıyla aynı uca
 * (/api/account) bağlanır; yönetici de artık panelden çıkmadan kendi ad-soyad,
 * telefon ve e-posta bildirim tercihlerini düzenleyebiliyor.
 *
 * E-POSTA SALT-OKUNUR: değiştirmek kimlik doğrulama kaydını da değiştirmek
 * demek; bu ekranın işi değil. Bilerek gösteriliyor ama düzenlenemiyor.
 */
export function AdminProfilePanel() {
  const router = useRouter();
  const [p, setP] = useState<Profil>(BOS);
  // Sunucudan gelen son hâl: ad-soyad yalnızca GERÇEKTEN değiştiyse
  // gönderilsin diye tutuluyor (aşağıya bak).
  const [ilk, setIlk] = useState<Profil>(BOS);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hata, setHata] = useState<string | null>(null);
  const [kaydedildi, setKaydedildi] = useState(false);

  useEffect(() => {
    let iptal = false;
    fetch("/api/account")
      .then((r) => {
        // Durum kontrolü şart: 401/403 gövdesi de JSON olduğu için, kontrol
        // edilmezse boş bir form GERÇEK veriymiş gibi görünür — "tüm
        // bildirimler kapalı" gibi yanlış bir bilgi gösterirdi.
        if (!r.ok) throw new Error("yetki");
        return r.json();
      })
      .then((j) => {
        if (iptal) return;
        const gelen: Profil = {
          firstName: j.firstName ?? "",
          lastName: j.lastName ?? "",
          email: j.email ?? "",
          phone: j.phone ?? "",
          phoneCountry: j.phoneCountry ?? DEFAULT_COUNTRY,
          notifyEmailSupport: !!j.notifyEmailSupport,
          notifyEmailPayout: !!j.notifyEmailPayout,
          notifyEmailAnnouncement: !!j.notifyEmailAnnouncement,
        };
        setP(gelen);
        setIlk(gelen);
      })
      .catch(() => setHata("Bilgiler yüklenemedi. Oturumun düşmüş olabilir — sayfayı yenile."))
      .finally(() => { if (!iptal) setYukleniyor(false); });
    return () => { iptal = true; };
  }, []);

  const set = <K extends keyof Profil>(k: K, v: Profil[K]) => {
    setP((x) => ({ ...x, [k]: v }));
    setKaydedildi(false);
  };

  // Boş isimle kaydetmek sunucuda 400 döndürür ve İSTEĞİN TAMAMI düşer —
  // yani aynı anda değiştirilen telefon ve bildirim tercihleri de sessizce
  // kaybolurdu. Bu yüzden düğme baştan kapalı.
  // Yalnızca kullanıcının DOKUNDUĞU isim alanı boşsa engelle. Baştan boş
  // gelen bir kayıt, sırf bu yüzden bildirim tercihlerini değiştirememeli.
  const adlarDolu =
    (p.firstName === ilk.firstName || p.firstName.trim().length > 0) &&
    (p.lastName === ilk.lastName || p.lastName.trim().length > 0);

  const kaydet = async () => {
    if (!adlarDolu) return;
    setBusy(true); setHata(null); setKaydedildi(false);
    try {
      const r = await fetch("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          // Ad-soyad SADECE değiştiyse gönderiliyor. Her kayıtta göndermek
          // iki soruna yol açıyordu: (1) yalnızca bir bildirim tercihini
          // değiştirmek isteyen, adı boş bir hesabı olan yönetici hiçbir şey
          // kaydedemiyordu; (2) her rutin kayıt, sunucudaki admin-özel isim
          // yolunu ve fazladan ön-okumayı gereksiz yere tetikliyordu.
          ...(p.firstName !== ilk.firstName ? { firstName: p.firstName } : {}),
          ...(p.lastName !== ilk.lastName ? { lastName: p.lastName } : {}),
          phone: p.phone,
          phoneCountry: p.phoneCountry,
          notifyEmailSupport: p.notifyEmailSupport,
          notifyEmailPayout: p.notifyEmailPayout,
          notifyEmailAnnouncement: p.notifyEmailAnnouncement,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setHata(j.error ?? "Kaydedilemedi."); return; }
      // Sunucu telefonu normalize ediyor (ör. "0532 123 45 67" -> "5321234567")
      // ve ülke kodunu düzeltiyor. Cevabı geri yazmazsak ekran, veritabanında
      // OLMAYAN bir değeri gösterir ve kullanıcı bunu ancak bir sonraki
      // ziyarette fark ederdi.
      setP({
        firstName: j.firstName ?? "",
        lastName: j.lastName ?? "",
        email: j.email ?? "",
        phone: j.phone ?? "",
        phoneCountry: j.phoneCountry ?? DEFAULT_COUNTRY,
        notifyEmailSupport: !!j.notifyEmailSupport,
        notifyEmailPayout: !!j.notifyEmailPayout,
        notifyEmailAnnouncement: !!j.notifyEmailAnnouncement,
      });
      setIlk({
        firstName: j.firstName ?? "",
        lastName: j.lastName ?? "",
        email: j.email ?? "",
        phone: j.phone ?? "",
        phoneCountry: j.phoneCountry ?? DEFAULT_COUNTRY,
        notifyEmailSupport: !!j.notifyEmailSupport,
        notifyEmailPayout: !!j.notifyEmailPayout,
        notifyEmailAnnouncement: !!j.notifyEmailAnnouncement,
      });
      setKaydedildi(true);
      // Kenar çubuğundaki ad sunucudan geliyor; tazelemezsek isim
      // değişikliği kaydedilmemiş gibi görünürdü.
      router.refresh();
    } catch {
      setHata("Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  };

  if (yukleniyor) {
    return <p className="text-[13px] text-ink-400">Yükleniyor…</p>;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {hata && (
        <p className="text-[12.5px] text-accent-rose flex items-start gap-1.5">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {hata}
        </p>
      )}
      {kaydedildi && (
        <p className="text-[12.5px] text-brand-600 flex items-start gap-1.5">
          <Icon name="check" size={14} className="mt-0.5 shrink-0" /> Kaydedildi.
        </p>
      )}

      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-3">
          Kişisel bilgiler
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-[12px] text-ink-500 mb-1.5">Ad</span>
            <input
              className="w-full rounded-xl border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand-500 transition-colors"
              value={p.firstName}
              onChange={(e) => set("firstName", e.target.value)}
            />
          </label>
          <label className="block">
            <span className="block text-[12px] text-ink-500 mb-1.5">Soyad</span>
            <input
              className="w-full rounded-xl border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand-500 transition-colors"
              value={p.lastName}
              onChange={(e) => set("lastName", e.target.value)}
            />
          </label>
        </div>
        <label className="block mt-3">
          <span className="block text-[12px] text-ink-500 mb-1.5">E-posta</span>
          <input
            disabled
            value={p.email}
            className="w-full rounded-xl border border-line px-3 py-2 text-[13.5px] bg-ink-900/[0.03] text-ink-500"
          />
          <span className="block text-[11.5px] text-ink-400 mt-1.5">
            E-posta giriş kimliğin olduğu için buradan değiştirilemez.
          </span>
        </label>
      </Card>

      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-3">
          İletişim numarası
        </p>
        <div className="flex gap-2 max-w-md">
          <select
            className="rounded-xl border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand-500 transition-colors w-[128px] shrink-0"
            value={p.phoneCountry}
            onChange={(e) => set("phoneCountry", e.target.value)}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.dial} {c.code}</option>
            ))}
          </select>
          <input
            type="tel"
            className="flex-1 min-w-0 rounded-xl border border-line px-3 py-2 text-[13.5px] outline-none focus:border-brand-500 transition-colors"
            value={p.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="5xx xxx xx xx"
          />
        </div>
      </Card>

      <Card>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 mb-3">
          E-posta bildirimleri
        </p>
        <p className="text-[12px] text-ink-500 mb-3 leading-relaxed">
          Panel içi bildirimlerin her zaman gelir. Aşağıdakileri açarsan, aynı olaylar için
          ayrıca e-posta da alırsın.
        </p>
        <div className="space-y-1">
          <PrefToggle
            label="Destek konuşmama cevap geldiğinde"
            checked={p.notifyEmailSupport}
            onChange={(v) => set("notifyEmailSupport", v)}
          />
          <PrefToggle
            label="Yeni ödeme partisi yayınlandığında"
            checked={p.notifyEmailPayout}
            onChange={(v) => set("notifyEmailPayout", v)}
          />
          <PrefToggle
            label="Yeni duyuru yayınlandığında"
            checked={p.notifyEmailAnnouncement}
            onChange={(v) => set("notifyEmailAnnouncement", v)}
          />
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <Button variant="primary" onClick={kaydet} disabled={busy || !adlarDolu}>
          <Icon name="save" size={15} /> {busy ? "Kaydediliyor…" : "Kaydet"}
        </Button>
        {!adlarDolu && (
          <span className="text-[12px] text-ink-400">Ad ve soyad boş bırakılamaz.</span>
        )}
      </div>
    </div>
  );
}
