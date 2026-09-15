/**
 * Responsive screenshots + overflow check of the expense form via the static
 * /preview-expense route (mobile-first sweep: 390 / 768 / 1280 / 1920, light
 * + dark). Run: node scripts/shot-preview-expense.mjs (needs dev server on :3000)
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const WIDTHS = [390, 768, 1280, 1920];

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

for (const width of WIDTHS) {
  for (const mode of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await page.addInitScript(
      (pref) => localStorage.setItem("spendflow_theme_preference", pref),
      mode,
    );
    await page.goto("http://localhost:3000/preview-expense", { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      const wide = [];
      document.querySelectorAll("body *").forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.right > el.clientWidth + 1 && r.width > 1 && !n.closest(".scroll-x")) {
          wide.push(`${n.tagName}.${String(n.className).slice(0, 60)} (${Math.round(r.right)}px)`);
        }
      });
      return {
        pageOverflow: el.scrollWidth > el.clientWidth,
        scrollW: el.scrollWidth,
        clientW: el.clientWidth,
        wide: wide.slice(0, 6),
      };
    });
    await page.screenshot({ path: `shots/expense-${width}-${mode}.png`, fullPage: true });
    console.log(
      `${width}px ${mode}: page overflow=${overflow.pageOverflow} (${overflow.scrollW}>${overflow.clientW})${
        overflow.wide.length ? " " + JSON.stringify(overflow.wide) : " clean"
      }`,
    );
    await page.close();
  }
}

await browser.close();
console.log("done");
