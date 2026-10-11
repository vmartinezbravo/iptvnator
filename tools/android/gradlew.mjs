#!/usr/bin/env node
// Runs the Gradle wrapper of apps/android-tv/android on any OS
// (gradlew.bat on Windows, ./gradlew elsewhere).
// Usage: node tools/android/gradlew.mjs <gradle args...>
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const androidDir = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../apps/android-tv/android'
);
const isWindows = process.platform === 'win32';
const wrapper = resolve(androidDir, isWindows ? 'gradlew.bat' : 'gradlew');
const result = spawnSync(`"${wrapper}"`, process.argv.slice(2), {
    cwd: androidDir,
    stdio: 'inherit',
    shell: true,
});

process.exit(result.status ?? 1);
