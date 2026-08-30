import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await b.newPage({ viewport: { width: 1560, height: 1000 } });
const errs=[]; p.on("pageerror",e=>errs.push(e.message)); p.on("console",m=>{if(m.type()==="error")errs.push(m.text())});
await p.goto("http://127.0.0.1:3111", { waitUntil: "networkidle" });
await p.setInputFiles('input[type="file"]', process.argv[2]);
await p.waitForSelector("text=Ödeme Listesi", { timeout: 45000 });
await p.click('nav >> text=Ödeme Listesi');
await p.waitForTimeout(800);
// Cig'i ara (iki labelda)
async function cigRow(){
  const rows = await p.locator("tbody tr").all();
  for (const r of rows){ const t=await r.innerText(); if(t.includes("Çiğ")&&!t.includes("Cinojunior")) return t.replace(/\n/g," | "); }
  return "bulunamadi";
}
console.log("TÜMÜ  Çiğ:", await cigRow());
await p.screenshot({ path: "/home/claude/shots/P1-all.png" });
// Black Pigeon filt
await p.click('button:has-text("Black Pigeon Records")');
await p.waitForTimeout(800);
console.log("BLACK PIGEON Çiğ:", await cigRow());
await p.screenshot({ path: "/home/claude/shots/P2-blackpigeon.png" });
// M4NM filt
await p.click('button:has-text("M4NM")');
await p.waitForTimeout(800);
console.log("M4NM Çiğ:", await cigRow());
await p.screenshot({ path: "/home/claude/shots/P3-m4nm.png" });
console.log("HATA:", errs.length? errs.join(" | "):"yok");
await b.close();
