import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Oturum tazeleme ve kaba kapı.
 *
 * Middleware Edge çalışma zamanındadır — veritabanına BAĞLANMAZ. Burada
 * yalnızca "oturum var mı" sorulur; "ne görebilir" kararı her zaman
 * sunucu tarafında getSession() ile verilir. Yani bu katman bir kolaylık,
 * güvenlik sınırı değil; asıl sınır veri sorgularındaki yetki süzmesidir.
 */

const PUBLIC = [
  "/giris",
  "/kayit",
  "/sifremi-unuttum",
  "/sifre-belirle",
  "/beklemede",
  "/auth/callback",
  "/auth/cikis",
];

const isPublic = (p: string) =>
  PUBLIC.some((x) => p === x || p.startsWith(x + "/")) ||
  p.startsWith("/_next") ||
  p.startsWith("/api/auth") ||
  /\.(png|jpg|svg|ico|webp|txt|xml)$/.test(p);

export async function middleware(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Auth kurulmadıysa uygulama eskisi gibi açık çalışır (yerel geliştirme).
  if (!url || !key) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const sb = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });

  // getUser() çerezdeki jetonu Supabase'e doğrulatır ve gerekiyorsa tazeler.
  const { data } = await sb.auth.getUser();
  const path = req.nextUrl.pathname;

  // API'ye yönlendirme yapılmaz — istemci JSON bekliyor. Yetki denetimi
  // rota işleyicilerinde (guard.ts) yapılır ve düzgün 401/403 döner.
  if (path.startsWith("/api/")) return res;

  if (!data.user && !isPublic(path)) {
    const to = req.nextUrl.clone();
    to.pathname = "/giris";
    // Girişten sonra kullanıcıyı istediği sayfaya geri götür.
    if (path !== "/") to.searchParams.set("devam", path + req.nextUrl.search);
    return NextResponse.redirect(to);
  }

  // Girişliyken giriş/kayıt sayfasına gidilmez.
  if (data.user && (path === "/giris" || path === "/kayit")) {
    const to = req.nextUrl.clone();
    to.pathname = "/";
    to.search = "";
    return NextResponse.redirect(to);
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
