import { AuthShell } from "@/components/auth/AuthShell";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { authConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default function KayitPage() {
  return (
    <AuthShell
      mode="register"
      title="Hesabını oluştur."
      sub="Hesabın e-posta doğrulaması ve yönetici onayından sonra açılır."
      steps={{ labels: ["Bilgilerin", "E-posta doğrulama", "Yönetici onayı"], active: 1 }}
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
