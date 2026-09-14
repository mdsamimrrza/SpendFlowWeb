/**
 * Visual check for the redesigned Profile & security page: base page +
 * password modal + email-OTP modal (the two "Change" flows), light & dark
 * at desktop and one mobile pass. Uses the static /preview-profile route.
 *
 * Run: node scripts/shot-preview-profile.mjs   (needs dev server on :3000)
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = "http://localhost:3000/preview-profile";

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

async function open(mode, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(120_000); // first dev-mode compile of the route can be slow
  await page.addInitScript(
    (pref) => localStorage.setItem("spendflow_theme_preference", pref),
    mode,
  );
  await page.goto(BASE, { waitUntil: "load", timeout: 120_000 });
  await page.waitForTimeout(2000); // dev-mode hydration
  return page;
}

async function shot(page, file) {
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
  await page.screenshot({ path: file });
  console.log("wrote", file);
}

/**
 * Dev-mode hydration is slow: an early click lands on the SSR markup with no
 * handler attached. Retry clicks until the dialog mounts.
 */
async function clickOpenModal(page, button) {
  for (let i = 0; i < 10; i++) {
    await button.click();
    try {
      await page.waitForSelector('[role="dialog"]', { timeout: 2000 });
      return;
    } catch {
      // not hydrated yet — click again
    }
  }
  throw new Error("dialog never opened after 10 clicks");
}

for (const mode of ["light", "dark"]) {
  const page = await open(mode, 1280);
  await shot(page, `shots/profile-1280-${mode}.png`);

  // Password modal — first "Change" button in the Security register.
  await clickOpenModal(page, page.getByRole("button", { name: "Change", exact: true }).first());
  await page.waitForTimeout(300);
  await shot(page, `shots/profile-pw-modal-1280-${mode}.png`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // Email modal — second "Change" button, step 1 (authorize).
  await clickOpenModal(page, page.getByRole("button", { name: "Change", exact: true }).nth(1));
  await page.waitForTimeout(300);
  await shot(page, `shots/profile-email-modal-1280-${mode}.png`);
  await page.keyboard.press("Escape");
  await page.close();
}

// Mobile pass — base + both Change modals (viewport shots, not fullPage for modals).
{
  const page = await open("light", 390);
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
  await page.screenshot({ path: "shots/profile-390-light.png", fullPage: true });
  console.log("wrote shots/profile-390-light.png");
  await clickOpenModal(page, page.getByRole("button", { name: "Change", exact: true }).first());
  await page.waitForTimeout(300);
  await shot(page, "shots/profile-pw-modal-390-light.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await clickOpenModal(page, page.getByRole("button", { name: "Change", exact: true }).nth(1));
  await page.waitForTimeout(300);
  await shot(page, "shots/profile-email-modal-390-light.png");
  await page.close();
}

// Dock spread check — viewport shots at the bottom of the page, phone widths.
for (const width of [320, 390, 430]) {
  const page = await open("light", width);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    const dock = document.querySelector("nav.glass");
    const r = dock?.getBoundingClientRect();
    return {
      pageOverflow: el.scrollWidth > el.clientWidth,
      dock: r ? { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) } : null,
      viewport: el.clientWidth,
    };
  });
  console.log(`dock @${width}:`, JSON.stringify(overflow));
  await shot(page, `shots/dock-${width}-light.png`);
  await page.close();
}

await browser.close();
console.log("done");
