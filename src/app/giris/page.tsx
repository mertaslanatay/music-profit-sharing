import Link from "next/link";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { authConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default function GirisPage() {
  return (
    <AuthShell
      title="Giriş yap"
      sub="M4NM Pulse hesabınla devam et."
      footer={
        <>
          Hesabın yok mu?{" "}
          <Link href="/kayit" className="text-brand-600 font-medium hover:underline">
            Kayıt ol
          </Link>
        </>
      }
    >
      {!authConfigured() ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] text-amber-800 leading-relaxed">
          Giriş sistemi henüz yapılandırılmadı. <code>.env.local</code> dosyasına
          <code className="mx-1">NEXT_PUBLIC_SUPABASE_URL</code> ve
          <code className="mx-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> eklenmeli.
        </div>
      ) : (
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      )}
    </AuthShell>
  );
}
