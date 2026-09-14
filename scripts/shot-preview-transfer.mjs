/**
 * Screenshots of the redesigned Transfer form via /preview-transfer:
 * route cards, amount panel and FX strip, at mobile, tablet and desktop widths.
 * Run: node scripts/shot-preview-transfer.mjs  (needs dev server on :3000)
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

for (const width of [390, 768, 1280]) {
  for (const mode of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.addInitScript(
      (pref) => localStorage.setItem("spendflow_theme_preference", pref),
      mode,
    );
    await page.goto("http://127.0.0.1:3000/preview-transfer", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    // Type an amount so the locked-rate FX strip renders in the shot.
    await page.locator('input[name="tr-amount"]').fill("25000");
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return { pageOverflow: el.scrollWidth > el.clientWidth, scrollW: el.scrollWidth, clientW: el.clientWidth };
    });
    await page.screenshot({ path: `shots/transfer-${width}-${mode}.png`, fullPage: true });
    console.log(
      `${width}px ${mode}: page overflow=${overflow.pageOverflow} (${overflow.scrollW}>${overflow.clientW})`,
    );
    await page.close();
  }
}

await browser.close();
console.log("done");
