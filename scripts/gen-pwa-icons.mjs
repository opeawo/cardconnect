// Generates PWA icons from a simple SVG using sharp.
// Run via `node scripts/gen-pwa-icons.mjs`. Idempotent.
//
// The icon is the CardConnect brand glyph: a rounded blue square with the
// scan-frame mark used in the app's logo and bottom nav. We export at 192,
// 512, and a 512 maskable variant (same artwork inset to fit the safe zone
// Android requires for adaptive icons).

import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT_DIR = path.resolve("client/public");
const BLUE = "#2563EB"; // matches --blue at 220 90% 56% in HSL

// Centered scan-frame mark on a blue rounded-square background. The viewBox
// is a 512x512 canvas; the scan corners sit on a roughly 40% inset square.
function buildSvg({ size, maskable }) {
  // Maskable icons require the meaningful artwork to fit inside the inner
  // 80% safe zone (Android may crop a 10% margin on each side). We inset
  // the corners further when maskable=true.
  const corner = maskable ? 160 : 128; // distance from edge to corner-mark
  const armLen = maskable ? 72 : 88; // length of each L-arm
  const stroke = 24;
  const c1 = corner;
  const c2 = 512 - corner;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <rect width="512" height="512" rx="${maskable ? 0 : 96}" fill="${BLUE}"/>
  <g fill="none" stroke="white" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">
    <!-- top-left -->
    <path d="M ${c1} ${c1 + armLen} L ${c1} ${c1} L ${c1 + armLen} ${c1}"/>
    <!-- top-right -->
    <path d="M ${c2 - armLen} ${c1} L ${c2} ${c1} L ${c2} ${c1 + armLen}"/>
    <!-- bottom-right -->
    <path d="M ${c2} ${c2 - armLen} L ${c2} ${c2} L ${c2 - armLen} ${c2}"/>
    <!-- bottom-left -->
    <path d="M ${c1 + armLen} ${c2} L ${c1} ${c2} L ${c1} ${c2 - armLen}"/>
    <!-- horizontal scan line -->
    <line x1="${c1 + 16}" y1="256" x2="${c2 - 16}" y2="256" opacity="0.85"/>
  </g>
</svg>`;
}

async function render(svg, size, outPath) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
  console.log(`wrote ${path.relative(process.cwd(), outPath)}`);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // Standard icons (with rounded corners on the artwork itself)
  await render(buildSvg({ size: 192, maskable: false }), 192, path.join(OUT_DIR, "icon-192.png"));
  await render(buildSvg({ size: 512, maskable: false }), 512, path.join(OUT_DIR, "icon-512.png"));
  // Maskable variant (full-bleed background, art inset)
  await render(buildSvg({ size: 512, maskable: true }), 512, path.join(OUT_DIR, "icon-512-maskable.png"));
  // Apple touch icon (iOS uses a 180x180 PNG; iOS clips to its own rounded
  // corners so we use the non-maskable artwork)
  await render(buildSvg({ size: 180, maskable: false }), 180, path.join(OUT_DIR, "apple-touch-icon.png"));

  // Also drop the source SVG so it can be referenced elsewhere
  await fs.writeFile(path.join(OUT_DIR, "icon.svg"), buildSvg({ size: 512, maskable: false }), "utf-8");
  console.log("wrote client/public/icon.svg");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
