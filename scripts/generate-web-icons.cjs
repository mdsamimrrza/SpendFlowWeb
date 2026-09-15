// Generates the web app's icon set from the SpendFlow mobile APK assets.
// Source: ../SpendFlow/assets (icon.png = parchment, favicon.png = navy #0b0f19, gold "S").
//
// Two renderings:
//  - FULL artwork (dashed ring + dots + medallion) for the large PWA icons.
//  - EMBLEM crop (center ~55% — just the double-ring "S" medallion, enlarged
//    to fill the canvas) for favicons/tab icons/header marks, where the full
//    artwork's thin ring vanishes at 16-40 px.
//
// Output (Next.js App Router conventions):
//   app/icon.png          64px   default tab favicon (light emblem)
//   app/favicon.ico       48px   legacy favicon (light emblem)
//   app/apple-icon.png    180px  iOS home-screen icon (light emblem)
//   public/icons/tab-{light,dark}.png      64px   media-aware tab icons
//   public/icons/brand-{light,dark}.png    128px  header brand marks
//   public/icons/icon-192.png / icon-512.png / icon-maskable-512.png  PWA
// Run: node scripts/generate-web-icons.cjs
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

const SRC = path.resolve(
  __dirname,
  "../../SpendFlow/assets"
);
const ROOT = path.resolve(__dirname, "..");
const NAVY = { r: 11, g: 15, b: 25 }; // #0b0f19 — favicon.png background

async function png(srcBuf, size, out) {
  await sharp(srcBuf).resize(size, size, { fit: "contain" }).png().toFile(out);
}

// Center-crop the S medallion (outer ring radius ≈25.4% of the canvas; the
// arc below it starts at ≈27%) and enlarge to the target size.
async function emblem(srcBuf, size, out) {
  const { width, height } = await sharp(srcBuf).metadata();
  const c = Math.round(Math.min(width, height) * 0.52);
  await sharp(srcBuf)
    .extract({
      left: Math.round((width - c) / 2),
      top: Math.round((height - c) / 2),
      width: c,
      height: c,
    })
    .resize(size, size)
    .png()
    .toFile(out);
}

// Same emblem crop but with rounded corners + transparent surround —
// browsers render favicons verbatim, so a full-bleed square tile looks hard
// against the tab shape. Alpha is zeroed outside the rounded rect directly
// in the pixel data (deterministic across sharp/libvips versions).
async function roundedEmblem(srcBuf, size, out, radiusFrac = 0.24) {
  const { width, height } = await sharp(srcBuf).metadata();
  const c = Math.round(Math.min(width, height) * 0.52);
  const { data, info } = await sharp(srcBuf)
    .extract({
      left: Math.round((width - c) / 2),
      top: Math.round((height - c) / 2),
      width: c,
      height: c,
    })
    .resize(size, size)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const r = size * radiusFrac;
  const inside = (x, y) => {
    const cx = Math.max(r, Math.min(x, size - r));
    const cy = Math.max(r, Math.min(y, size - r));
    return Math.hypot(x - cx, y - cy) <= r + 0.5;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (!inside(x + 0.5, y + 0.5)) data[(y * size + x) * 4 + 3] = 0;
  await sharp(data, {
    raw: { width: size, height: size, channels: info.channels },
  })
    .png()
    .toFile(out);
}

(async () => {
  const navy = fs.readFileSync(path.join(SRC, "favicon.png")); // 512px navy + gold S
  const cream = fs.readFileSync(path.join(SRC, "icon.png")); // 1024px parchment + gold S

  const appDir = path.join(ROOT, "app");
  const iconsDir = path.join(ROOT, "public", "icons");
  fs.mkdirSync(iconsDir, { recursive: true });

  // Default tab icon + legacy .ico — rounded emblem (browsers show favicons
  // verbatim, so the tile gets its own rounded corners). Light/parchment is
  // the default for browsers without media-query icon support.
  await roundedEmblem(cream, 64, path.join(appDir, "icon.png"));
  await roundedEmblem(cream, 48, path.join(appDir, "favicon-48.png"));
  await sharp(path.join(appDir, "favicon-48.png"))
    .toFile(path.join(appDir, "favicon.ico"));
  fs.unlinkSync(path.join(appDir, "favicon-48.png"));
  await emblem(cream, 180, path.join(appDir, "apple-icon.png"));

  // Media-aware tab icons (rounded; light last so non-media browsers pick it).
  await roundedEmblem(cream, 64, path.join(iconsDir, "tab-light.png"));
  await roundedEmblem(navy, 64, path.join(iconsDir, "tab-dark.png"));

  // Header brand marks — high-res emblems for the 40px header tile.
  await emblem(cream, 128, path.join(iconsDir, "brand-light.png"));
  await emblem(navy, 128, path.join(iconsDir, "brand-dark.png"));

  // PWA icons keep the full artwork (legible at 192+).
  await png(navy, 192, path.join(iconsDir, "icon-192.png"));
  await png(navy, 512, path.join(iconsDir, "icon-512.png"));

  // Maskable: the navy artwork shrunk to ~64% and centered on the same navy,
  // so the dashed ring stays inside the 66%-diameter safe zone and the
  // backgrounds blend seamlessly.
  const s = 330;
  const logo = await sharp(navy)
    .resize(s, s, { fit: "contain" })
    .toBuffer();
  await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 3,
      background: NAVY,
    },
  })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(path.join(iconsDir, "icon-maskable-512.png"));

  console.log("web icons generated");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
