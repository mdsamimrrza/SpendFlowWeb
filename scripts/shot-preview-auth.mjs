/**
 * Visual + overflow check for the redesigned auth flow:
 * /sign-in, /sign-up, /forgot-password at 390 / 768 / 1280 / 1920 in
 * light & dark, plus a 320 px stress pass. Full-page shots.
 *
 * Run: node scripts/shot-preview-auth.mjs   (needs dev server on :3000)
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const ROUTES = ["sign-in", "sign-up", "forgot-password"];
const WIDTHS = [390, 768, 1280, 1920];
const STRESS = [320];

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

let leaks = 0;
const pageErrors = [];
async function open(mode, width, path) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.setDefaultTimeout(120_000); // first dev-mode compile of the route can be slow
  page.on("pageerror", (err) => pageErrors.push(`${path} @${width} ${mode}: ${err.message}`));
  await page.addInitScript(
    (pref) => localStorage.setItem("spendflow_theme_preference", pref),
    mode,
  );
  await page.goto(`http://localhost:3000/${path}`, { waitUntil: "load", timeout: 120_000 });
  await page.waitForTimeout(1600); // dev-mode hydration + reveal animation
  return page;
}

async function overflow(page) {
  return page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth;
  });
}

/** Phone fit: the auth screens must not scroll at real device heights. */
async function vScroll(page) {
  return page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollHeight - el.clientHeight;
  });
}

async function shot(page, file) {
  await page.evaluate(() => document.querySelector("nextjs-portal")?.remove());
  await page.screenshot({ path: file, fullPage: true });
  console.log("wrote", file);
}

for (const mode of ["light", "dark"]) {
  for (const route of ROUTES) {
    for (const width of WIDTHS) {
      const page = await open(mode, width, route);
      const ov = await overflow(page);
      if (ov) {
        leaks++;
        console.log(`OVERFLOW ${route} @${width} ${mode}`);
      }
      await shot(page, `shots/auth-${route}-${width}-${mode}.png`);
      await page.close();
    }
  }
}

// 320 px stress pass (smallest common phone) — light only, overflow report.
for (const route of ROUTES) {
  const page = await open("light", STRESS[0], route);
  const ov = await overflow(page);
  if (ov) {
    leaks++;
    console.log(`OVERFLOW ${route} @320`);
  }
  await page.close();
}

// No-scroll pass — real phone viewports. 390 px wide is the repo's phone
// standard (AGENTS.md) and must fit without scrolling; 320×568 (iPhone SE 1)
// is reported for information only — a 3-field form cannot fit 568 px height.
for (const [w, h] of [[390, 844], [390, 667], [320, 568]]) {
  for (const route of ROUTES) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    page.setDefaultTimeout(120_000);
    page.on("pageerror", (err) => pageErrors.push(`${route} @${w}x${h}: ${err.message}`));
    await page.goto(`http://localhost:3000/${route}`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForTimeout(1200);
    const extra = await vScroll(page);
    if (extra > 0) {
      if (w >= 390) {
        leaks++;
        console.log(`SCROLLS ${route} @${w}x${h}: +${extra}px`);
      } else {
        console.log(`info: ${route} @${w}x${h} scrolls +${extra}px (legacy viewport)`);
      }
    }
    if (w === 390 && h === 667) {
      await shot(page, `shots/auth-${route}-390x667-light.png`);
    }
    await page.close();
  }
}

// Forgot-password "sent" state — the reset Edge Function call is stubbed so
// no real mail goes out; we only exercise the UI transition.
for (const width of [390, 1280]) {
  const page = await open("light", width, "forgot-password");
  await page.route("**/functions/v1/send-password-reset*", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) }),
  );
  await page.getByLabel(/email/i).first().fill("someone@example.com");
  await page.getByRole("button", { name: /send reset link/i }).click();
  await page.waitForTimeout(600);
  const ov = await overflow(page);
  if (ov) {
    leaks++;
    console.log(`OVERFLOW forgot-sent @${width}`);
  }
  await shot(page, `shots/auth-forgot-password-sent-${width}-light.png`);
  await page.close();
}

// Favicon sync pass — the tab icon must follow the IN-APP theme toggle,
// not just the OS preference: light → tab-light.png, one ThemeToggle click
// (light→dark) → tab-dark.png.
{
  const page = await open("light", 1280, "sign-in");
  const iconState = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('link[rel="icon"]')].map((l) => ({
        href: l.getAttribute("href"),
        media: l.getAttribute("media"),
      })),
    );
  const before = await iconState();
  // ThemeToggle cycles light → dark → system; one click lands on dark.
  await page.getByRole("button", { name: /^Theme:/ }).click();
  await page.waitForTimeout(800);
  const after = await iconState();
  const allMatch = (links, want) =>
    links.length > 0 && links.every((l) => l.href?.includes(want) && !l.media);
  const ok = allMatch(before, "tab-light") && allMatch(after, "tab-dark");
  console.log(
    `favicon sync: light=${JSON.stringify(before)} dark=${JSON.stringify(after)} ${ok ? "OK" : "FAIL"}`,
  );
  if (!ok) leaks++;
  await page.close();
}

await browser.close();
if (pageErrors.length) {
  leaks += pageErrors.length;
  for (const e of pageErrors) console.log(`PAGEERROR ${e}`);
}
console.log(leaks === 0 ? "overflow-clean" : `${leaks} overflow leaks`);
console.log("done");
