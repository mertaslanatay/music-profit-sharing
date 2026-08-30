import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { authConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default function KayitPage() {
  return (
    <AuthShell
      title="Kayıt ol"
      sub="Hesabın e-posta doğrulamasından sonra yönetici onayına düşer."
      footer={
        <>
          Zaten hesabın var mı?{" "}
          <Link href="/giris" className="text-brand-600 font-medium hover:underline">
            Giriş yap
          </Link>
        </>
      }
    >
      {!authConfigured() ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-800 leading-relaxed">
          Kayıt sistemi henüz yapılandırılmadı.
        </div>
      ) : (
        <RegisterForm />
      )}
    </AuthShell>
  );
}
