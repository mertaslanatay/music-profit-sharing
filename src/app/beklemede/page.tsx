import { AuthShell, Alert } from "@/components/auth/AuthShell";
import { LogoutLink } from "@/components/auth/LogoutButton";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * E-postası doğrulanmış ama henüz onaylanmamış (veya askıya alınmış)
 * kullanıcının indiği sayfa. Buradan hiçbir mali veri görünmez.
 */
export default async function BeklemedePage({
  searchParams,
}: {
  searchParams: Promise<{ dogrulandi?: string }>;
}) {
  const sp = await searchParams;
  const { viewer, reason, authEmail } = await getSession();

  // Onaylanmış kullanıcı burada oyalanmaz.
  if (viewer) {
    return (
      <AuthShell title="Hesabın hazır" sub="Onaylanmışsın, panele geçebilirsin.">
        <a href="/" className="block text-center w-full px-4 py-2.5 rounded-xl text-[14px] font-semibold bg-brand-600 text-white hover:bg-brand-700 transition-colors">
          Panele git
        </a>
      </AuthShell>
    );
  }

  const body =
    reason === "suspended" ? (
      <Alert tone="error">
        <strong className="font-semibold">Hesabın askıya alınmış.</strong>
        <br />
        Bunun bir hata olduğunu düşünüyorsan yöneticiyle iletişime geç.
      </Alert>
    ) : reason === "unverified" ? (
      <Alert tone="info">
        <strong className="font-semibold">E-postanı doğrulaman gerekiyor.</strong>
        <br />
        {authEmail} adresine gönderdiğimiz bağlantıya tıkla. Gelmediyse spam klasörüne bak.
      </Alert>
    ) : reason === "no-profile" ? (
      <Alert tone="error">
        Bu e-postayla bir profil bulunamadı. Kaydını tamamlamadıysan tekrar kayıt olman gerekiyor.
      </Alert>
    ) : (
      <Alert tone="info">
        <strong className="font-semibold">Hesabın yönetici onayı bekliyor.</strong>
        <br />
        {sp.dogrulandi === "1" && "E-posta adresin doğrulandı. "}
        Mali veriye erişim tek tek onaylandığı için bu adım elle yapılıyor.
        Onaylandığında {authEmail ?? "e-posta adresine"} bildirim göndereceğiz.
      </Alert>
    );

  return (
    <AuthShell
      title="Neredeyse hazır"
      footer={<LogoutLink />}
    >
      <div className="space-y-4">
        {body}
        <p className="text-[12.5px] text-ink-500 leading-relaxed">
          Acil bir durumda doğrudan{" "}
          <a href="mailto:info@m4nm.net" className="text-brand-600 hover:underline">info@m4nm.net</a>{" "}
          adresine yazabilirsin.
        </p>
      </div>
    </AuthShell>
  );
}
