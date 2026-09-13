import { chromium } from "playwright-core";
const browser = await chromium.launch({ executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
const page = await browser.newPage({ viewport: { width: Number(process.argv[2] ?? 1280), height: 900 } });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.waitForTimeout(3000); // land mid-cycle on a currency with long amounts (waits past 1 tick)
await page.screenshot({ path: `shots/landing-compact-${process.argv[2] ?? 1280}.png`, fullPage: false });
await browser.close();
console.log("saved");
