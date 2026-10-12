# IPTVnator Android (fork) — Contexto para Claude Code

@AGENTS.md

Las reglas comunes del monorepo (pnpm, Nx, alias `@iptvnator/*`, límites de líneas,
capacidades de runtime, qué documentación leer por tarea) están en [AGENTS.md](AGENTS.md).
Lee solo los contratos enlazados que afecten a la tarea. Las skills de release del repo
están replicadas en `.claude/skills/` (sus copias de Codex deben quedar idénticas byte a byte);
el resto de skills del repo se localiza con el [context map](docs/maintenance/agent-context-map.md).
Si una regla de AGENTS.md choca con este archivo, mandan las "Excepciones del fork" de abajo.

## Objetivo
Portar IPTVnator (Angular + Electron) a una **APK Android para Fire TV / Android TV**
(referencia mínima: Fire TV Stick 3ª gen), manteniendo la interfaz y la esencia de la app, pero
con solo lo imprescindible para que sea **ligera, rápida y estable**. El móvil con táctil es la
fase 8 (opcional) del plan; iPhone, un proyecto posterior.
Diseño aprobado: `docs/superpowers/specs/2026-10-11-android-firetv-design.md` · Plan: `docs/PLAN-ANDROID.md`.

## Decisiones de arquitectura (no cambiar sin consultarme)
- **Contenedor:** Capacitor (última versión estable). Nada de Cordova, React Native ni reescritura nativa.
- **UI:** se reutiliza el frontend Angular existente. Se adapta, no se rediseña.
- **Electron:** se elimina del build Android. Todo lo que use IPC, `fs`, menús nativos o BD de escritorio
  se sustituye por equivalentes web (IndexedDB) o plugins de Capacitor, detrás de una interfaz/servicio
  común para no ensuciar los componentes.
- **Red:** las peticiones de listas M3U, Xtream y EPG usan `CapacitorHttp` (nativo, sin CORS). Sin proxy.
- **Reproductor:** primero `<video>` + hls.js (HLS) y mpegts.js (MPEG-TS) en el WebView. Solo si en
  Fire TV no rinde o hay streams que no se reproducen, se propone un plugin nativo con
  **ExoPlayer / Media3** (en esa fase, no antes, y con mi OK).
- **Fire TV:** navegación completa con D-pad (foco visible en todos los elementos interactivos),
  tecla Atrás funcional, manifest con soporte leanback y banner 320×180.

## Qué se puede recortar
Funciones exclusivas de escritorio (menús de ventana, auto-update de Electron, integraciones del SO,
atajos de teclado de escritorio) y cualquier dependencia que solo usen esas funciones.
**Antes de eliminar una funcionalidad visible para el usuario, pregúntame.**

## Flujo de trabajo
- Una fase por rama (`android/fase-N-nombre`), commits pequeños y descriptivos.
- Antes de implementar algo no trivial: skill `brainstorming` → `writing-plans`.
- Para ejecutar un plan: `executing-plans` (o `subagent-driven-development` si las tareas son independientes).
- Ante cualquier fallo: `systematic-debugging` antes de proponer arreglos.
- Antes de decir que algo funciona: `verification-before-completion` (build real + prueba en dispositivo).
- Al cerrar cada fase: `requesting-code-review` y `finishing-a-development-branch`.
- No avanzar a la siguiente fase sin que yo confirme que la actual funciona en la Fire TV.
- Nunca hagas pruebas destructivas (restaurar, borrar, importar, resetear) sobre los datos reales del
  Stick ni del PC sin pedírmelo antes y sin exportar antes una copia; usa datos de prueba siempre que se pueda.

## Excepciones del fork a AGENTS.md
- Planes y diseños: `docs/PLAN-ANDROID.md` y `docs/superpowers/` (no `.plans/`).
- Sin notas de release en `.changes/` ni la revisión local Codex/Greptile previa al push.
- Este CLAUDE.md supera a propósito el límite de 30 líneas / 2 KiB; el paso `agents:validate`
  del CI se desactiva en el fork (fase 2).
- El resto de AGENTS.md se aplica: pnpm, Nx, alias, límites de líneas, `RuntimeCapabilitiesService`.

## Comandos habituales
```bash
pnpm install --frozen-lockfile
pnpm nx test <proyecto>                        # p. ej. services, web, portal-xtream-data-access
pnpm nx lint <proyecto>
pnpm nx build web --configuration=android      # build web para la APK (desde fase 2)
pnpm nx run android-tv:sync                    # build android + cap sync (desde fase 3)
pnpm nx run android-tv:assemble-debug          # gradlew assembleDebug (Windows: gradlew.bat)
adb connect <IP_FIRE_TV>:5555
pnpm nx run android-tv:install-debug           # adb install -r apps/android-tv/android/app/build/outputs/apk/debug/app-debug.apk
adb logcat | grep -i -E "chromium|capacitor|iptv"   # logs del WebView y la app
```
Depuración del WebView: `chrome://inspect` en el PC con el dispositivo conectado por ADB.
Navegador (fase 2): backend con `PORT=3000` (ver Task 2.6 del plan) + `pnpm run serve:frontend`.

## Criterios de "ligera y rápida"
- APK release lo más pequeña posible (R8/minify activado, sin assets ni librerías sin uso).
- Arranque en frío razonable en Fire TV Stick.
- Listas grandes (miles de canales) con scroll fluido: virtual scrolling si hace falta.
- Sin dependencias nuevas sin justificar su peso.

## Idioma
Respóndeme en español. Código, commits y nombres de variables en inglés.

## Volumen de datos objetivo
Mi lista real (Xtream Codes): ~600 canales, ~23.000 películas, ~8.000 series.
- Xtream es el modo principal; M3U solo para listas pequeñas.
- Catálogo: se descarga completo en cada arranque, como hoy en la PWA. Detalles de serie/película
  solo al abrirlos (ya es así).
- Umbrales en el Stick (mediana de 3): abrir → elegir canal en directo 10 s objetivo / 20 s límite;
  elegir canal → imagen y zapping → imagen 3 s objetivo / 5 s límite.
- Si la medición de la fase 3 supera un límite o hay cierre por memoria, propón mitigaciones
  (directo disponible antes que películas y series, caché persistente en IndexedDB, carga por
  categoría…) y espera mi OK antes de implementarlas.
- Virtual scrolling en todas las listas y carga diferida de carátulas.
- Todo debe ir fluido en una Fire TV Stick.
