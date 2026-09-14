/**
 * Responsive screenshot + overflow check for the redesigned Settings page
 * via the static /preview-settings route (real page + shell, no auth).
 * Dark mode is applied through the real ThemeContext (localStorage
 * preference). Mobile widths are captured as viewport shots (top + bottom)
 * because fullPage capture draws the fixed bottom tab bar mid-page.
 *
 * Run: node scripts/shot-preview-settings.mjs   (needs dev server on :3100)
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
const WIDTHS = [390, 768, 1280, 1920];

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

for (const width of WIDTHS) {
  for (const mode of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.addInitScript(
      (pref) => localStorage.setItem("spendflow_theme_preference", pref),
      mode,
    );
    await page.goto(`${BASE}/preview-settings`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      const pageOverflow = el.scrollWidth > el.clientWidth;
      const wide = [];
      document.querySelectorAll("body *").forEach((n) => {
        const r = n.getBoundingClientRect();
        if (r.right > el.clientWidth + 1 && r.width > 1 && !n.closest(".scroll-x")) {
          wide.push(`${n.tagName}.${String(n.className).slice(0, 60)} (${Math.round(r.right)}px)`);
        }
      });
      return { pageOverflow, clientW: el.clientWidth, scrollW: el.scrollWidth, wide: wide.slice(0, 8) };
    });
    if (width < 768) {
      await page.screenshot({ path: `shots/settings-${width}-${mode}-top.png` });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `shots/settings-${width}-${mode}-bottom.png` });
    } else {
      await page.screenshot({ path: `shots/settings-${width}-${mode}.png`, fullPage: true });
    }
    console.log(
      `${width}px ${mode}: page overflow=${overflow.pageOverflow} (${overflow.scrollW}>${overflow.clientW})` +
        (overflow.wide.length ? ` wide nodes:\n  ${overflow.wide.join("\n  ")}` : " clean"),
    );
    await page.close();
  }
}

await browser.close();
console.log("done");
