#!/usr/bin/env node
/**
 * Dağıtım öncesi ortam değişkeni kontrolü.
 *
 * `npm run build` her zaman bundan önce bu betiği çalıştırır (bkz. package.json
 * "prebuild"). Next.js NEXT_PUBLIC_* değişkenlerini build ANINDA koda gömüyor —
 * eksikse authConfigured() derlenmiş çıktıda hep `false` döner ve middleware/
 * sayfa yönlendirmeleri sessizce ATLANIR (31 Ağu 2026'da yaşanan güvenlik açığı
 * tam olarak buydu: tüm mali veriler girişsiz görünür hâldeydi).
 *
 * Bu yüzden bu üç değişken build anında eksikse derleme burada, açıkça
 * durdurulur — sessizce "korumasız" bir build canlıya çıkamaz.
 *
 * Bu betik ayrı bir Node süreci olarak çalışır (Next.js'in kendi build'i
 * gibi .env.local'i otomatik yüklemez) — bu yüzden aşağıda kendi basit
 * .env.local okuyucusu var. Gerçek ortam değişkenleri (ör. cPanel'de
 * tanımlılarsa) her zaman önceliklidir, .env.local yalnızca eksikleri doldurur.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const [, key, rawValue] = m;
    if (process.env[key] !== undefined) continue; // gerçek env değişkeni önceliklidir
    const value = rawValue.replace(/^["']|["']$/g, "");
    process.env[key] = value;
  }
}

if (process.env.SKIP_DEPLOY_ENV_CHECK === "1") {
  console.warn("⚠️  SKIP_DEPLOY_ENV_CHECK=1 — ortam değişkeni kontrolü atlandı. " +
    "Bu build'i CANLIYA göndermiyorsan sorun yok.");
  process.exit(0);
}

const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
];

const missing = REQUIRED.filter((k) => !process.env[k] || process.env[k].trim() === "");

if (missing.length > 0) {
  console.error("\n🛑 Build durduruldu — .env.local dosyasında eksik değişken(ler):\n");
  for (const k of missing) console.error(`   - ${k}`);
  console.error(
    "\nBu değişkenler build ANINDA koda gömülüyor; eksik olursa uygulama " +
    "canlıda GİRİŞ YAPILMADAN tüm mali verileri gösterir hâle gelebilir.\n" +
    "Bilerek auth'suz (yerel, korumasız) bir build almak istiyorsan\n" +
    "SKIP_DEPLOY_ENV_CHECK=1 ile bu kontrolü atlayabilirsin — ama bunu ASLA\n" +
    "canlıya göndereceğin bir paket için yapma.\n"
  );
  process.exit(1);
}

if (!/^https:\/\//.test(process.env.NEXT_PUBLIC_SITE_URL ?? "")) {
  console.error(
    `\n🛑 Build durduruldu — NEXT_PUBLIC_SITE_URL "https://" ile başlamıyor ` +
    `(şu an: "${process.env.NEXT_PUBLIC_SITE_URL}"). Şifre sıfırlama/e-posta ` +
    "doğrulama linkleri yanlış adrese gider.\n"
  );
  process.exit(1);
}

console.log("✅ Dağıtım ortam değişkenleri tamam (NEXT_PUBLIC_SUPABASE_URL, " +
  "NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL).");
