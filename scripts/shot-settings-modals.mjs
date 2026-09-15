/**
 * Ad-hoc visual check: open each Settings modal (currency, theme, language,
 * security, notifications, sign-out) and capture it. Not part of the repo's
 * per-screen shot suite — run manually after touching settings modals.
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ executablePath: EDGE, headless: true });

const ROWS = [
  ["currency", "Select Currency"],
  ["theme", "Theme"],
  ["language", "Select Language"],
  ["security", "Security & Lock"],
  ["notifications", "Budget Notifications"],
  ["signout", "Sign out of SpendFlow?"],
];

for (const mode of ["light", "dark"]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(
    (pref) => localStorage.setItem("spendflow_theme_preference", pref),
    mode,
  );
  await page.goto(`${BASE}/preview-settings`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  for (const [key, label] of ROWS) {
    // Trigger: nav rows open via their row button; sign-out via the pill.
    if (key === "currency") await page.getByText("Currency", { exact: true }).first().click();
    else if (key === "theme") await page.locator("nav button", { hasText: "Theme" }).first().click();
    else if (key === "language") await page.locator("nav button", { hasText: "Language" }).first().click();
    else if (key === "security") await page.locator("nav button", { hasText: "App Lock" }).first().click();
    else if (key === "notifications") await page.locator("nav button", { hasText: "Notifications" }).first().click();
    else if (key === "signout") await page.getByRole("button", { name: "Sign out" }).last().click();
    await page.waitForTimeout(400);
    const dialog = page.locator("[role='dialog']");
    const visible = await dialog.count();
    if (!visible) {
      console.log(`${mode} ${key}: MODAL DID NOT OPEN`);
      continue;
    }
    const overflow = await dialog.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    console.log(`${mode} ${key}: open, titled "${label}", scrollOverflow=${overflow}`);
    await page.screenshot({ path: `shots/settings-modal-${key}-${mode}.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
  await page.close();
}
await browser.close();
console.log("done");
