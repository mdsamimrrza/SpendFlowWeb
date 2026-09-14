/**
 * Responsive screenshot + horizontal-overflow check for the deep-detail
 * analytics statement +"-analytics — real AnalyticsPage + DashboardShell,
 * mock data injected). Captures light + dark at 390/768/1280/1920 px, plus one
 * shot with the Daily Velocity calculation explainer open, and reports any
 * documentElement horizontal scroll (overflow) at any width.
 *
 * Run: node scripts/shot-preview-analytics.mjs   (needs dev server on :3000)
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
    await page.goto(`${BASE}/preview-analytics`, { waitUntil: "networkidle" });
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
    await page.screenshot({ path: `shots/analytics-${width}-${mode}.png`, fullPage: true });
    console.log(
      `${width}px ${mode}: page overflow=${overflow.pageOverflow} (${overflow.scrollW}>${overflow.clientW})` +
        (overflow.wide.length ? ` wide nodes:\n  ${overflow.wide.join("\n  ")}` : " clean"),
    );
    await page.close();
  }
}

// Explainer modal open (light, desktop + phone) — click the Daily Velocity cell.
for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(`${BASE}/preview-analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const cell = page.locator('button[aria-label="Daily velocity"]').first();
  if (await cell.count()) {
    await cell.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `shots/analytics-modal-${width}.png`, fullPage: false });
    console.log(`modal ${width}px captured`);
  } else {
    console.log(`modal ${width}px: velocity cell not found`);
  }
  await page.close();
}

// Section-tab states (390 light): click each tab, verify the layout stays
// overflow-clean and capture the filtered sheet.
for (const pick of ["Overview", "Categories", "Habits"]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.goto(`${BASE}/preview-analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: pick, exact: true }).first().click();
  await page.waitForTimeout(500);
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth;
  });
  await page.screenshot({ path: `shots/analytics-section-${pick.toLowerCase()}-390.png`, fullPage: true });
  console.log(`section ${pick} @390: overflow=${overflow}`);
  await page.close();
}

// Custom-period state (390 light): click the Custom chip, verify the inline
// date inputs appear without overflow.
{
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await page.goto(`${BASE}/preview-analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Custom", exact: true }).first().click();
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  await page.screenshot({ path: `shots/analytics-period-custom-390.png` });
  console.log(`period custom @390: overflow=${overflow}`);
  await page.close();
}

await browser.close();
