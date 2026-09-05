import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { audit, rateLimit } from "@/lib/access";

export const runtime = "nodejs";

/**
 * Dağıtım kancası (deploy webhook).
 *
 * GitHub Actions, `deploy` dalına build çıktısını push ettikten hemen sonra
 * bu uç noktayı çağırır. Sunucu tarafında SSH/FTP yok — bu yüzden "sunucuyu
 * güncelle" adımı burada, uygulamanın kendi süreci içinden çalışıyor:
 *
 *   git fetch origin deploy && git reset --hard origin/deploy
 *   && npm install --omit=dev
 *   && touch tmp/restart.txt   (Passenger'ın "yeniden başlat" sinyali)
 *
 * Bu GitHub'ın kendi webhook imza şeması (HMAC) DEĞİL — GitHub'ın kendisi
 * bu adrese istek atmıyor, atan tek taraf bizim Actions job'ımız. Bu yüzden
 * basit bir paylaşılan sır (Authorization: Bearer ...) yeterli; sabit-süreli
 * karşılaştırma zamanlama saldırılarına karşı.
 *
 * Aynı anda iki dağıtımın çakışmaması için süreç-içi (in-memory) kilit var —
 * cPanel/Passenger bu uygulamayı tek süreç olarak çalıştırdığı sürece yeterli.
 */

const execAsync = promisify(execCb);

const SHELL_TIMEOUT_MS = 4 * 60 * 1000; // npm install yavaş olabilir
const MAX_BUFFER = 4 * 1024 * 1024;

let deployInProgress = false;

function sha256(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

/** Sabit süreli karşılaştırma — uzunluk farkı bile zamanlamadan sızmasın diye önce hash'liyoruz. */
function secretMatches(provided: string, expected: string): boolean {
  return timingSafeEqual(sha256(provided), sha256(expected));
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "bilinmiyor";
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  const ua = req.headers.get("user-agent");

  const expected = process.env.DEPLOY_HOOK_SECRET;
  if (!expected) {
    // Sır cPanel'de tanımlanmadan bu uç nokta asla çalışmamalı.
    console.error("[deploy-hook] DEPLOY_HOOK_SECRET tanımlı değil — istek reddedildi.");
    return NextResponse.json({ error: "Dağıtım kancası yapılandırılmadı." }, { status: 503 });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const provided = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  // IP başına kaba bir hız sınırı — sır tahmin etme denemelerini yavaşlatır.
  const limited = await rateLimit(`deploy-hook:${ip}`, 20, 900);
  if (!limited.ok) {
    await audit({ userId: null, action: "deploy_hook_rate_limited", resource: ip, ip, userAgent: ua });
    return NextResponse.json({ error: "Çok fazla istek." }, { status: 429 });
  }

  if (!provided || !secretMatches(provided, expected)) {
    await audit({ userId: null, action: "deploy_hook_denied", resource: ip, ip, userAgent: ua });
    return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
  }

  if (deployInProgress) {
    return NextResponse.json({ error: "Zaten devam eden bir dağıtım var, tekrar dene." }, { status: 409 });
  }

  deployInProgress = true;
  const startedAt = Date.now();
  try {
    // cPanel Node.js Selector'ın kendi node/npm'ini PATH'e almak için —
    // "Setup Node.js App" sayfasındaki "Enter to the virtual environment"
    // komutunun tam eşleniği. Bu, GitHub secret'ı DEĞİL; cPanel'in kendi
    // Node.js App ortam değişkeni olarak tanımlanır (bkz. proje notları).
    // Tanımlı değilse, sürecin zaten çalıştığı ortamın PATH'iyle denenir.
    const venvActivate = process.env.NODE_VENV_ACTIVATE;
    const prefix = venvActivate ? `${venvActivate.replace(/;\s*$/, "")} && ` : "";

    const cmd =
      `${prefix}` +
      `git fetch origin deploy && ` +
      `git reset --hard origin/deploy && ` +
      `npm install --omit=dev && ` +
      `mkdir -p tmp && touch tmp/restart.txt`;

    const { stdout, stderr } = await execAsync(cmd, {
      cwd: process.cwd(),
      shell: "/bin/bash",
      timeout: SHELL_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
    });

    let commit = "bilinmiyor";
    try {
      const rev = await execAsync("git rev-parse --short HEAD", { cwd: process.cwd() });
      commit = rev.stdout.trim();
    } catch {
      // rev-parse başarısız olsa bile dağıtım başarılı sayılır — bilgi amaçlı bir alan bu.
    }

    const durationMs = Date.now() - startedAt;
    await audit({
      userId: null, action: "deploy_hook_success", resource: commit, ip, userAgent: ua,
      meta: { durationMs, stdoutTail: stdout.slice(-2000), stderrTail: stderr.slice(-2000) },
    });

    return NextResponse.json({ ok: true, commit, durationMs });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : "Bilinmeyen hata";
    const stdout = (err as { stdout?: string })?.stdout ?? "";
    const stderr = (err as { stderr?: string })?.stderr ?? "";
    console.error("[deploy-hook] dağıtım başarısız:", message, stderr);
    await audit({
      userId: null, action: "deploy_hook_failed", resource: null, ip, userAgent: ua,
      meta: { durationMs, message, stdoutTail: stdout.slice(-2000), stderrTail: stderr.slice(-2000) },
    });
    return NextResponse.json(
      { error: "Dağıtım başarısız.", message, stderrTail: stderr.slice(-2000) },
      { status: 500 }
    );
  } finally {
    deployInProgress = false;
  }
}
