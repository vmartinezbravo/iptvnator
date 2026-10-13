#!/usr/bin/env node
// Builds the Android launcher icons from IPTVnator's app icon, replacing the
// default Capacitor ones: the legacy and round icons for every density and
// the foreground layer of the adaptive icon (Android 8+, Fire OS 7), whose
// background colour is set in values/ic_launcher_background.xml.
//
// Usage: node tools/android/make-launcher-icons.mjs
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ICON = resolve(ROOT, 'apps/web/src/assets/icons/icon-1024.png');
const RES = resolve(ROOT, 'apps/android-tv/android/app/src/main/res');
/** The icon's own dark blue, behind the adaptive foreground. */
const BACKGROUND = '#081520';
/** Scale of the icon inside the 108 dp adaptive layer: keeps the TV glyph
 *  inside the 72 dp the launcher masks it to. */
const FOREGROUND_SCALE = 0.8;

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [density, factor] of Object.entries(DENSITIES)) {
    const dir = resolve(RES, `mipmap-${density}`);
    const legacy = Math.round(48 * factor);
    const layer = Math.round(108 * factor);
    const inner = Math.round(layer * FOREGROUND_SCALE);

    await sharp(ICON).resize(legacy, legacy).png().toFile(resolve(dir, 'ic_launcher.png'));

    const circle = Buffer.from(
        `<svg width="${legacy}" height="${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}"/></svg>`
    );
    await sharp(ICON)
        .resize(legacy, legacy)
        .composite([{ input: circle, blend: 'dest-in' }])
        .png()
        .toFile(resolve(dir, 'ic_launcher_round.png'));

    const offset = Math.round((layer - inner) / 2);
    await sharp({
        create: { width: layer, height: layer, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
        .composite([{ input: await sharp(ICON).resize(inner, inner).toBuffer(), left: offset, top: offset }])
        .png()
        .toFile(resolve(dir, 'ic_launcher_foreground.png'));

    console.log(`${density}: ${legacy} px icons, ${layer} px foreground`);
}

writeFileSync(
    resolve(RES, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${BACKGROUND}</color>
</resources>
`
);
console.log(`Adaptive background ${BACKGROUND}`);
