/**
 * Native-resolution ELEMENT crops of the redesigned Analytics sections
 * (top outflows, health card, compact calendar, KPI row) — full-page
 * captures downscale the tall 390px sheet until text is unreadable, so
 * visual review needs per-section crops.
 *
 * Run: node scripts/shot-analytics-sections.mjs   (needs dev server on :3000)
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";

const SECTIONS = [
  { file: "top-outflows", text: "Top outflows" },
  { file: "health", text: "Financial health score" },
  { file: "calendar", text: "Spending calendar" },
  { file: "categories", text: "Adjust caps" },
  { file: "allocation", text: "Allocation", exact: true },
  { file: "channels", text: "Payment Channel", exact: true },
];

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

for (const width of [390, 1280]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.addInitScript(() => localStorage.setItem("spendflow_theme_preference", "light"));
  await page.goto(`${BASE}/preview-analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // KPI tile row — the grid holding DAILY VELOCITY.
  const kpi = page.getByText("Daily velocity", { exact: true }).locator("xpath=ancestor::div[contains(@class,'grid')][1]");
  if (await kpi.count()) {
    await kpi.first().screenshot({ path: `shots/sec-kpi-row-${width}.png` });
    console.log(`kpi-row ${width} ok`);
  } else console.log(`kpi-row ${width} MISSING`);

  for (const s of SECTIONS) {
    const axis = "ancestor::section[1]";
    const el = page.getByText(s.text, { exact: !!s.exact }).first().locator(`xpath=${axis}`);
    if (await el.count()) {
      await el.first().screenshot({ path: `shots/sec-${s.file}-${width}.png` });
      console.log(`${s.file} ${width} ok`);
      // Expanded category list (top-8 cap lifted).
      if (s.file === "categories") {
        await page.getByText("Show all", { exact: false }).first().click();
        await page.waitForTimeout(300);
        await el.first().screenshot({ path: `shots/sec-categories-expanded-${width}.png` });
        console.log(`categories-expanded ${width} ok`);
      }
    } else {
      console.log(`${s.file} ${width} MISSING`);
    }
  }
  await page.close();
}

await browser.close();
