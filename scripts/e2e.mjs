import { chromium } from "playwright";
const XLSX = process.argv[2];
const B = "http://127.0.0.1:3111";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1560, height: 1000 } });
const errs = []; p.on("pageerror", e => errs.push(e.message));
p.on("console", m => { if (m.type() === "error" && !m.text().includes("favicon")) errs.push(m.text()); });
const shot = async n => { await p.waitForTimeout(500); await p.screenshot({ path: `/home/claude/shots/${n}.png` }); };

// 1) Bos panel
await p.goto(B, { waitUntil: "networkidle" });
console.log("BOS PANEL:", (await p.locator("h1").first().innerText()).trim());
await shot("E1-empty");

// 2) Admin: yukle
await p.goto(B + "/admin", { waitUntil: "networkidle" });
await p.setInputFiles('input[type="file"]', XLSX);
await p.fill('input[placeholder="M4NM Q2 2026 Ödeme"]', "M4NM Q2 2026 Ödeme");
await p.fill('input[placeholder="0,00"]', "27,75");
await shot("E2-admin-form");
await p.click('button:has-text("Yükle ve işle")');
await p.waitForSelector("text=Taslak olarak kaydedildi", { timeout: 90000 });
await p.waitForTimeout(800);
const box = await p.locator("text=Taslak olarak kaydedildi").locator("xpath=ancestor::div[contains(@class,'rounded-xl2')][1]").innerText();
console.log("YUKLEME:", box.replace(/\n+/g, " | "));
await shot("E3-admin-uploaded");

// 3) Taslak panelde gorunmemeli
await p.goto(B, { waitUntil: "networkidle" });
const stillEmpty = await p.locator("text=Henüz yayınlanmış bir rapor yok").count();
console.log("TASLAK GIZLI:", stillEmpty === 1 ? "EVET (dogru)" : "HAYIR (HATA)");

// 4) Yayinla
await p.goto(B + "/admin", { waitUntil: "networkidle" });
await p.click('button:has-text("Yayınla")');
await p.waitForTimeout(1500);
const row = await p.locator("tbody tr").first().innerText();
console.log("RAPOR SATIRI:", row.replace(/\n+/g, " | "));
await shot("E4-admin-published");

// 5) Panel artik veriyi gosteriyor
await p.goto(B, { waitUntil: "networkidle" });
await p.waitForSelector("text=DAĞITILACAK NET", { timeout: 20000 });
await p.waitForTimeout(1200);
const bar = await p.locator("text=DAĞITILACAK NET").locator("xpath=ancestor::div[contains(@class,'rounded-xl2')][1]").innerText();
console.log("DONEM CUBUGU:", bar.replace(/\n+/g, " | "));
await shot("E5-dashboard-all");

// 6) Donem sec
await p.click('button:has-text("Mart 2026")');
await p.waitForURL(/\?d=/, { timeout: 15000 });
await p.waitForLoadState("networkidle");
await p.waitForFunction(() => !document.body.innerText.includes("$300,7471"), null, { timeout: 15000 })
       .catch(() => console.log("  (uyari: tutar degismedi)"));
await p.waitForTimeout(600);
const bar2 = await p.locator("text=DAĞITILACAK NET").locator("xpath=ancestor::div[contains(@class,'rounded-xl2')][1]").innerText();
console.log("MART 2026   :", bar2.replace(/\n+/g, " | "));
await shot("E6-dashboard-march");

// 7) Odeme listesi
await p.click('nav >> text=Ödeme Listesi');
await p.waitForTimeout(1000);
console.log("ILK SATIR   :", (await p.locator("tbody tr").first().innerText()).replace(/\n+/g, " | "));
await shot("E7-payouts");

console.log("KONSOL HATASI:", errs.length ? errs.slice(0,3).join(" | ") : "yok");
await b.close();
