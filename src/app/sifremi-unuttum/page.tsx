import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetRequestForm } from "@/components/auth/ResetForms";

export const dynamic = "force-dynamic";

export default function SifremiUnuttumPage() {
  return (
    <AuthShell
      title="Şifremi unuttum"
      sub="E-posta adresini gir; sıfırlama bağlantısını gönderelim."
      footer={
        <Link href="/giris" className="text-ink-500 hover:text-ink-700 hover:underline">
          Giriş ekranına dön
        </Link>
      }
    >
      <ResetRequestForm />
    </AuthShell>
  );
}
