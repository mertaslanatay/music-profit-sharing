import { chromium } from "playwright";
import fs from "node:fs";

const XLSX_PATH = process.argv[2];
const BASE = "http://127.0.0.1:3111";
const OUT = "/home/claude/shots";
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1560, height: 1000 } });

page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

const shot = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false });
  console.log("shot:", name);
};

await page.goto(BASE, { waitUntil: "networkidle" });
await shot("01-upload");

// Dosyayi yukle
await page.setInputFiles('input[type="file"]', XLSX_PATH);
await page.waitForSelector("text=Ödeme Listesi", { timeout: 45000 });
await page.waitForTimeout(2000);
await shot("02-overview");

const readText = async (sel) => (await page.locator(sel).first().textContent())?.trim();

// Ozet rakamlari dogrula
const netCard = await readText("text=DAĞITILACAK NET >> xpath=..");
console.log("SettleBar:", netCard?.replace(/\s+/g, " "));

// SWIFT tutari gir: 273
const input = page.locator('input[placeholder="300.75"]');
await input.click();
await input.fill("273");
await page.waitForTimeout(900);
await shot("03-overview-swift");

// Odeme listesi
await page.click('nav >> text=Ödeme Listesi');
await page.waitForTimeout(900);
await shot("04-payouts");

const firstRow = await page.locator("tbody tr").first().innerText();
console.log("İlk satır:", firstRow.replace(/\n/g, " | "));

const footTotal = await page.locator("tfoot tr").first().innerText();
console.log("Tablo toplamı:", footTotal.replace(/\n/g, " | "));

// Sanatci detayi
await page.locator("tbody tr").first().click();
await page.waitForSelector("text=NET ÖDEME", { timeout: 10000 });
await page.waitForTimeout(900);
await shot("05-artist");
const panelNet = await readText("text=NET ÖDEME >> xpath=..");
console.log("Panel:", panelNet?.replace(/\s+/g, " "));
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// Diger ekranlar
for (const [label, name] of [
  ["Şarkılar", "06-songs"],
  ["Label", "07-labels"],
  ["Coğrafya", "08-geo"],
  ["Platformlar", "09-platforms"],
]) {
  await page.click(`nav >> text=${label}`);
  await page.waitForTimeout(1100);
  await shot(name);
}

// Kurallar
await page.click("nav >> text=Kurallar");
await page.waitForTimeout(900);
await shot("10-rules-split");

await page.click('button:has-text("Özel Oranlar")');
await page.waitForTimeout(700);
await shot("11-rules-overrides");

await page.click('button:has-text("İsim Birleştirme")');
await page.waitForTimeout(700);
await shot("12-rules-aliases");

console.log("\n=== KONSOL HATALARI ===");
console.log(errors.length === 0 ? "  yok" : errors.map((e) => "  " + e).join("\n"));

await browser.close();
process.exit(errors.length === 0 ? 0 : 1);
