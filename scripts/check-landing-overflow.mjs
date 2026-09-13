/**
 * TEMP diagnostic — measures FitText clipping in the landing demo statement
 * (CashFlowHero) across the full 12-currency cycle at several viewport widths.
 * Reports any figure whose rendered width exceeds its column (scrollWidth >
 * clientWidth) i.e. it is visually cut off. Delete after the fix is verified.
 *
 * Run: node scripts/check-landing-overflow.mjs   (needs dev server on :3000)
 */
import { chromium } from "playwright-core";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const WIDTHS = [Number(process.argv[2] ?? 1024), Number(process.argv[3] ?? 1280)];
const TICKS = 13; // 13 × 2.4 s > 12-currency cycle (28.8 s) → covers every currency
const TICK_MS = 2500;

const browser = await chromium.launch({ executablePath: EDGE, headless: true });

const probe = async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
  const samples = [];
  for (let i = 0; i < TICKS; i++) {
    await page.waitForTimeout(TICK_MS);
    const data = await page.evaluate(() => {
      const rows = [];
      document.querySelectorAll("span.block.w-full.overflow-hidden").forEach((wrap) => {
        const inner = wrap.firstElementChild;
        if (!inner) return;
        const label = wrap.closest("div")?.querySelector(".caps")?.textContent?.trim() ?? "?";
        rows.push({
          label,
          text: inner.textContent.trim().slice(0, 22),
          clipped: inner.scrollWidth > wrap.clientWidth + 1,
          scrollW: inner.scrollWidth,
          clientW: wrap.clientWidth,
          fontPx: getComputedStyle(inner).fontSize,
        });
      });
      const caption = [...document.querySelectorAll("p.stamp")].map((p) => p.textContent).join(" ");
      const currency = caption.match(/cycling 12 currencies · (\w+)/)?.[1] ?? "?";
      return { currency, rows };
    });
    samples.push(data);
  }
  await page.close();
  return samples;
};

for (const w of WIDTHS) {
  const samples = await probe(w);
  const clipped = [];
  const fonts = new Map();
  for (const s of samples) {
    for (const r of s.rows) {
      if (r.clipped) clipped.push(`${s.currency} ${r.label} "${r.text}" (${r.scrollW}>${r.clientW}px @${r.fontPx})`);
      fonts.set(`${s.currency}|${r.label}`, `${r.fontPx} (col ${r.clientW}px)`);
    }
  }
  console.log(`\n=== width ${w}px ===`);
  console.log(clipped.length ? `CLIPPED (${clipped.length}):\n  ${clipped.join("\n  ")}` : "no clipping observed");
  console.log("final fonts:", JSON.stringify(Object.fromEntries(fonts), null, 0).slice(0, 900));
}

await browser.close();
