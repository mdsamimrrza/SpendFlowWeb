/**
 * Screenshots of the redesigned Transfer log register via /preview-transfer-log:
 * telemetry strip, filter band, movement register and the open detail sheet,
 * at mobile, tablet and desktop widths.
 * Run: node scripts/shot-preview-transfer-log.mjs  (needs dev server on :3000)
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
    await page.goto("http://127.0.0.1:3000/preview-transfer-log", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return { pageOverflow: el.scrollWidth > el.clientWidth, scrollW: el.scrollWidth, clientW: el.clientWidth };
    });
    await page.screenshot({ path: `shots/transfer-log-${width}-${mode}.png`, fullPage: true });

    // Open the FX movement detail sheet for the second shot.
    await page.getByRole("button", { name: /^transfer record$/i }).first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: `shots/transfer-log-detail-${width}-${mode}.png` });
    console.log(
      `${width}px ${mode}: page overflow=${overflow.pageOverflow} (${overflow.scrollW}>${overflow.clientW})`,
    );
    await page.close();
  }
}

await browser.close();
console.log("done");
