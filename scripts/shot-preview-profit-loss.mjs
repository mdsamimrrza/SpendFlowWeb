/**
 * Screenshots of the redesigned Profit & Loss page via /preview-profit-loss
 * (mobile + desktop). Run: node scripts/shot-preview-profit-loss.mjs
 * (needs dev server on :3000)
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

for (const width of [390, 1280]) {
  for (const mode of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    await page.addInitScript(
      (pref) => localStorage.setItem("spendflow_theme_preference", pref),
      mode,
    );
    await page.goto("http://localhost:3000/preview-profit-loss", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return { pageOverflow: el.scrollWidth > el.clientWidth, scrollW: el.scrollWidth, clientW: el.clientWidth };
    });
    await page.screenshot({ path: `shots/pl-${width}-${mode}.png`, fullPage: true });
    console.log(
      `${width}px ${mode}: page overflow=${overflow.pageOverflow} (${overflow.scrollW}>${overflow.clientW})`,
    );
    await page.close();
  }
}

await browser.close();
console.log("done");
