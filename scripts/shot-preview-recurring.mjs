/**
 * Screenshots of the redesigned Recurring page via /preview-recurring:
 * commitment strip, plan register and the open rule editor, at mobile, tablet
 * and desktop widths.
 * Run: node scripts/shot-preview-recurring.mjs  (needs dev server on :3000)
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

for (const width of [390, 768, 1280]) {
  for (const mode of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.addInitScript(
      (pref) => localStorage.setItem("spendflow_theme_preference", pref),
      mode,
    );
    await page.goto(`${BASE}/preview-recurring`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return { pageOverflow: el.scrollWidth > el.clientWidth, scrollW: el.scrollWidth, clientW: el.clientWidth };
    });
    await page.screenshot({ path: `shots/recurring-${width}-${mode}.png`, fullPage: true });
    console.log(
      `${width}px ${mode}: page overflow=${overflow.pageOverflow} (${overflow.scrollW}>${overflow.clientW})`,
    );
    await page.close();
  }
}

await browser.close();
console.log("done");
