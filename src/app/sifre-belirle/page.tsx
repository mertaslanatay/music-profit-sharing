import { AuthShell } from "@/components/auth/AuthShell";
import { NewPasswordForm } from "@/components/auth/ResetForms";

export const dynamic = "force-dynamic";

export default function SifreBelirlePage() {
  return (
    <AuthShell title="Yeni şifre belirle" sub="Bu bağlantı tek kullanımlıktır.">
      <NewPasswordForm />
    </AuthShell>
  );
}
