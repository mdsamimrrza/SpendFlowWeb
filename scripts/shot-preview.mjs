/**
 * Responsive screenshot + horizontal-overflow check for the design-preview
 * screens at /preview/<slug> (mock data, no auth — see app/preview/registry.ts).
 * Replaces the 16 per-screen shot-preview-<screen>.mjs clones, which were
 * byte-identical except the route and filename.
 *
 * Run: node scripts/shot-preview.mjs [slug ...] [options]   (needs dev server)
 *   no slugs        → every registered screen
 *   --widths=390,768,1280,1920   capture widths (default shown)
 *   --modes=light,dark           theme modes
 *   --split-mobile               <768px: capture viewport top+bottom instead
 *                                of fullPage (keeps fixed tab bar out of shots)
 *   SHOT_BASE=http://localhost:3100   dev-server URL (default :3000)
 *
 * Prints one line per capture: overflow status + the widest offending nodes,
 * and exits non-zero if any page overflows horizontally.
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const BASE = process.env.SHOT_BASE ?? "http://localhost:3000";

const argv = process.argv.slice(2);
const flags = Object.fromEntries(
  argv.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")),
);
const slugs = argv.filter((a) => !a.startsWith("--"));

const ALL = [
  "accounts", "analytics", "bin", "bullion", "categories", "dash", "expense",
  "export", "history", "profile", "profit-loss", "recurring", "settings",
  "transfer", "transfer-log",
];
const targets = slugs.length ? slugs : ALL;
const widths = (flags.widths ?? "390,768,1280,1920").split(",").map(Number);
const modes = (flags.modes ?? "light,dark").split(",");

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
let leaks = 0;

for (const slug of targets) {
  for (const width of widths) {
    for (const mode of modes) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      page.setDefaultTimeout(120_000); // first dev-mode compile of the route can be slow
      await page.addInitScript(
        (pref) => localStorage.setItem("spendflow_theme_preference", pref),
        mode,
      );
      await page.goto(`${BASE}/preview/${slug}`, { waitUntil: "networkidle", timeout: 120_000 });
      await page.waitForTimeout(1500);
      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        const wide = [];
        document.querySelectorAll("body *").forEach((n) => {
          const r = n.getBoundingClientRect();
          if (r.right > el.clientWidth + 1 && r.width > 1 && !n.closest(".scroll-x")) {
            wide.push(`${n.tagName.toLowerCase()}.${String(n.className).slice(0, 60)} (${Math.round(r.right)}px)`);
          }
        });
        return {
          pageOverflow: el.scrollWidth > el.clientWidth,
          clientW: el.clientWidth,
          scrollW: el.scrollWidth,
          wide: wide.slice(0, 8),
        };
      });
      if (overflow.pageOverflow) leaks++;
      // Freeze entrance/stagger animations so the capture shows the settled state.
      await page.addStyleTag({
        content: "*,*::before,*::after{animation:none !important;transition:none !important;}",
      });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(250);
      if (flags["split-mobile"] && width < 768) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(200);
        await page.screenshot({ path: `shots/${slug}-${width}-${mode}-top.png` });
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(250);
        await page.screenshot({ path: `shots/${slug}-${width}-${mode}-bottom.png` });
      } else {
        await page.screenshot({ path: `shots/${slug}-${width}-${mode}.png`, fullPage: true });
      }
      console.log(
        `${slug} ${width}px ${mode}: overflow=${overflow.pageOverflow} (${overflow.scrollW}>${overflow.clientW})` +
          (overflow.wide.length ? `\n  wide: ${overflow.wide.join("\n  ")}` : ""),
      );
      await page.close();
    }
  }
}

await browser.close();
console.log(leaks === 0 ? "overflow-clean" : `${leaks} overflowing captures`);
process.exitCode = leaks ? 1 : 0;
