/**
 * Desktop screenshot of the expense form's record-preview rail via the
 * static /preview-expense route. Run: node scripts/shot-preview-expense.mjs
 * (needs dev server on :3000)
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

for (const mode of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.addInitScript(
    (pref) => localStorage.setItem("spendflow_theme_preference", pref),
    mode,
  );
  await page.goto("http://127.0.0.1:3000/preview-expense", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return { pageOverflow: el.scrollWidth > el.clientWidth, scrollW: el.scrollWidth, clientW: el.clientWidth };
  });
  await page.screenshot({ path: `shots/expense-1280-${mode}.png`, fullPage: true });
  console.log(
    `1280px ${mode}: page overflow=${overflow.pageOverflow} (${overflow.scrollW}>${overflow.clientW})`,
  );
  await page.close();
}

await browser.close();
console.log("done");
