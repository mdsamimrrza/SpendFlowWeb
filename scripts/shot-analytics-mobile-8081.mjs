/**
 * Mobile full-page screenshots of the analytics statement (:8081)
 * at 390px width, in each theme (light + dark). Uses /preview/analytics —
 * the real AnalyticsStatement + DashboardShell with mock data — because the
 * live /analytics route needs a signed-in session.
 * Run: node scripts/shot-analytics-mobile-8081.mjs
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.SHOT_BASE ?? "http://localhost:8081";
const WIDTH = 390;

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

for (const mode of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 } });
  await page.addInitScript(
    (pref) => localStorage.setItem("spendflow_theme_preference", pref),
    mode,
  );
  await page.goto(`${BASE}/preview/analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  const title = await page.title();
  const url = page.url();
  await page.screenshot({ path: `shots/analytics-mobile-${mode}-8081.png`, fullPage: true });
  console.log(`${mode}: saved shots/analytics-mobile-${mode}-8081.png (url=${url}, title=${title})`);
  await page.close();
}

await browser.close();
