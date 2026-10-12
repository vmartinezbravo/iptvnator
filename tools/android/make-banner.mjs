#!/usr/bin/env node
// Builds the 320×180 launcher banner that Android TV and Fire TV show for the
// app: the app icon on the left and the name on the right, over the icon's
// dark background.
//
// Usage: node tools/android/make-banner.mjs
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ICON = resolve(ROOT, 'apps/web/src/assets/icons/icon-1024.png');
const OUT = resolve(
    ROOT,
    'apps/android-tv/android/app/src/main/res/drawable-xhdpi/banner.png'
);
const WIDTH = 320;
const HEIGHT = 180;
const ICON_SIZE = 120;

const background = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0d2233"/>
      <stop offset="1" stop-color="#060d14"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <text x="160" y="101" font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif"
        font-size="30" font-weight="600" fill="#ffffff">IPTVnator</text>
</svg>`);

const icon = await sharp(ICON).resize(ICON_SIZE, ICON_SIZE).toBuffer();

mkdirSync(dirname(OUT), { recursive: true });
await sharp(background)
    .composite([{ input: icon, left: 24, top: (HEIGHT - ICON_SIZE) / 2 }])
    .png()
    .toFile(OUT);
console.log(`Banner ${WIDTH}×${HEIGHT} → ${OUT}`);
