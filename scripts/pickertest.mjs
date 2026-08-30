import { chromium } from "playwright";
const B = "http://127.0.0.1:3111";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1560, height: 1000 } });
const errs = []; p.on("pageerror", e => errs.push(e.message));
p.on("console", m => { if (m.type()==="error" && !m.text().includes("favicon")) errs.push(m.text()); });
const net = async () => (await p.locator("text=DAĞITILACAK NET").locator("xpath=..").innerText()).replace(/\n/g," ").trim();
const trigger = () => p.locator('label:has-text("Tarih aralığı") + button');
const menu = () => p.locator('div.absolute.z-30');
const shot = async n => { await p.waitForTimeout(400); await p.screenshot({ path:`/home/claude/shots/${n}.png` }); };

await p.goto(B, { waitUntil:"networkidle" });
console.log("PANEL tüm     :", await net());

await trigger().click();
await p.waitForTimeout(300);
await shot("F1-menu-open");
// iki ay birden isaretle, sonra Uygula
await menu().locator('button:has-text("Mart 2026")').click();
await menu().locator('button:has-text("Nisan 2026")').click();
await p.waitForTimeout(200);
console.log("TASLAK        :", (await menu().locator('button:has-text("Uygula"), button:has-text("Kapat")').innerText()).trim());
await shot("F2-two-checked");
await menu().locator('button:has-text("Uygula")').click();
await p.waitForLoadState("networkidle"); await p.waitForTimeout(1200);
console.log("PANEL M+N     :", await net(), "| etiket:", (await trigger().innerText()).trim());

// tek aya dus
await trigger().click(); await p.waitForTimeout(250);
await menu().locator('button:has-text("Nisan 2026")').click();
await menu().locator('button:has-text("Uygula")').click();
await p.waitForLoadState("networkidle"); await p.waitForTimeout(1200);
console.log("PANEL Mart    :", await net(), "| etiket:", (await trigger().innerText()).trim());
await shot("F3-march-only");

// Odeme Listesi
await p.click('nav >> text=Ödeme Listesi');
await p.waitForURL(/v=payouts/, { timeout:15000 });
await p.waitForLoadState("networkidle"); await p.waitForTimeout(800);
console.log("DROPDOWN      :", (await p.locator("select").first().locator("option").allInnerTexts()).join("  |  "));
console.log("ÖDEME tüm     :", await net());
await shot("F4-payout");
await p.selectOption("select", { index:1 });
await p.waitForLoadState("networkidle"); await p.waitForTimeout(1500);
console.log("ÖDEME parti   :", await net());
await shot("F5-payout-batch");

// geri don: analiz secimi korundu mu
await p.click('nav >> text=Panel');
await p.waitForLoadState("networkidle"); await p.waitForTimeout(1200);
console.log("GERİ DÖNÜŞ    :", (await trigger().innerText()).trim(), "| net:", await net());
console.log("KONSOL        :", errs.length ? errs.slice(0,2).join(" | ") : "temiz");
await b.close();
