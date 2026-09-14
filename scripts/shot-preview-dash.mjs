/**
 * Responsive screenshot + horizontal-overflow check for the redesigned
 * statement dashboard +"-dash — real DashboardShell + overview tiers,
 * mock data). Captures light + dark at 390/768/1280/1920 px and reports any
 * documentElement horizontal scroll (overflow) at any width.
 *
 * Run: node scripts/shot-preview-dash.mjs   (needs dev server on :3000)
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
    await page.goto(`${BASE}/preview-dash`, { waitUntil: "networkidle" });
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
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `shots/dash-${width}-${mode}.png`, fullPage: true });
    console.log(
      `${width}px ${mode}: page overflow=${overflow.pageOverflow} (${overflow.scrollW}>${overflow.clientW})` +
        (overflow.wide.length ? ` wide nodes:\n  ${overflow.wide.join("\n  ")}` : " clean"),
    );
    await page.close();
  }
}

await browser.close();
console.log("done");
