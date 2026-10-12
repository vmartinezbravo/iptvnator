# IPTVnator Fire TV / Android TV — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** APK para Android TV / Fire TV (referencia mínima: Fire TV Stick 3ª gen)
que reutiliza la UI Angular de IPTVnator y cubre, solo con el mando, tres
recorridos sobre una fuente Xtream: zapping en directo con "ahora / después",
buscar una película y retomar una serie.

**Architecture:** el runtime PWA existente (IndexedDB, localStorage,
`RuntimeCapabilitiesService`) es la base. Capacitor lo empaqueta y un
`NativeDataService`, que hereda de `PwaService`, cambia solo el transporte: la
API Xtream se llama directamente con `CapacitorHttp`, sin proxy. Todo lo
específico de la plataforma va detrás de capacidades y servicios; ningún
componente pregunta "¿soy Android?".

**Tech Stack:** Nx · Angular 22 · NgRx Signals · Capacitor (última estable) ·
hls.js 1.7.1 / mpegts.js 1.8.2 · Jest · Gradle / Android SDK · ADB.

**Spec:** `docs/superpowers/specs/2026-10-11-android-firetv-design.md` (aprobado
por Víctor el 2026-10-11). Léelo antes de cada fase.

## Global Constraints

- Gestor de paquetes: **pnpm 10.33.0**; `pnpm install --frozen-lockfile`. Nunca npm.
- Node: `^22.22.3 || ^24.15.0`; Víctor usa 24.20.0.
- Dependencias con versión exacta (`.npmrc` tiene `save-exact=true`); cada dependencia nueva debe justificar su peso en el commit.
- Contenedor: Capacitor. Nada de Cordova, React Native ni reescritura nativa.
- `appId`: `com.victor.iptvnator`; `appName`: `IPTVnator`.
- Capacitor: `server.androidScheme: 'http'` y tráfico en claro permitido, fijados desde la primera APK, porque cambiarlos borra IndexedDB y localStorage.
- **Prohibido** activar el parche global de CapacitorHttp (`plugins.CapacitorHttp.enabled` queda en `false`); se llama a `CapacitorHttp.request(...)` explícitamente.
- Peticiones Xtream nativas con la cabecera `User-Agent: XTREAM_CLIENT_USER_AGENT` (`@iptvnator/shared/interfaces`, valor `VLC/3.0.18 LibVLC/3.0.18`).
- Reproductor en el runtime nativo: solo `VideoPlayer.Html5Player`.
- El comportamiento por plataforma se decide con `RuntimeCapabilitiesService`, nunca con `window.electron` ni `window.Capacitor` dentro de componentes.
- Alias `@iptvnator/*`, límites de proyectos Nx, menos de 400 líneas por archivo de producción (objetivo 300).
- No se aplican las puertas de upstream (revisiones Codex/Greptile, notas en `.changes/`).
- Umbrales en el Stick (mediana de 3; superar el límite suspende la fase):
  - abrir la app → poder elegir canal en directo: objetivo **10 s**, límite **20 s**;
  - elegir canal → primera imagen: objetivo **3 s**, límite **5 s**;
  - zapping → primera imagen: objetivo **3 s**, límite **5 s**.
- Dispositivos: Fire TV Stick `192.168.100.82:5555` (`adb connect`) y un emulador Android TV (AVD "Television 1080p", API 34).
- Una rama por fase (`android/fase-N-nombre`), con commits pequeños en inglés.
- Al cerrar cada fase: `requesting-code-review` → `finishing-a-development-branch` → **Víctor confirma en la Fire TV** antes de empezar la siguiente.
- Ante cualquier fallo: `systematic-debugging`. Antes de decir que algo funciona: `verification-before-completion`.

## Review Focus

1. **El proveedor responde HTML** (desafío de un WAF, página de error) o JSON con `status` de error en vez del catálogo. Esperado: aviso de error y estado reintentable, sin cuelgues. Test: Task 3.2, `returns ERROR when the provider answers non-JSON`.
2. **`get_vod_streams` (23.000 elementos) tarda más que el timeout.** Esperado: resultado `ERROR` con un mensaje legible y la pantalla de carga con opción de reintentar. Test: Task 3.2, `maps a CapacitorHttp timeout to ERROR`.
3. **Canal sin EPG** (lista vacía o `epg_listings` ausente). Esperado: la fila no muestra programa y no hay errores en consola. Test: Task 2.4, `loadChannelEpg returns [] when the provider has no listings`.
4. **Ajustes guardados con `player: 'videojs'` o `'embedded-mpv'`** que llegan a la APK (por defecto, o por una restauración de copia de seguridad). Esperado: el runtime nativo usa HTML5. Test: Task 2.5, `coerces stored non-HTML5 player on native shell`.
5. **Atrás con un diálogo abierto sobre el reproductor a pantalla completa.** Esperado: se cierra solo el diálogo. Test: Task 5.3, `closes the top dialog before leaving fullscreen`.

---

# Fase 2 — Base web para Android

Rama: `android/fase-2-base-web`. Se hace y se prueba en el navegador; Capacitor
todavía no existe en esta fase.

### Task 2.1: Preparar el repositorio y la línea base

**Files:**
- Modify: `.github/workflows/ci.yml:392` (paso `pnpm run agents:validate`)

- [ ] **Step 1: Apuntar `origin` al fork.** Pide a Víctor la URL de su fork y ejecuta:
  ```bash
  git remote rename origin upstream
  git remote add origin <URL-del-fork>
  git remote -v
  ```
  Expected: `origin` es el fork y `upstream` es `4gray/iptvnator`.
- [ ] **Step 2: Crear la rama.** `git checkout -b android/fase-2-base-web`, partiendo de `android/fase-1-analisis`, que contiene el diseño y este plan.
- [ ] **Step 3: Instalar.** `pnpm install --frozen-lockfile`.
  - Expected: termina sin errores.
  - Si falla el `postinstall` (`electron-builder install-app-deps` compila `better-sqlite3`), aplica `systematic-debugging` y no lo esquives con `--ignore-scripts` sin el OK de Víctor.
- [ ] **Step 4: Línea base.** Ejecuta `pnpm nx test services`, `pnpm nx test portal-xtream-data-access`, `pnpm nx test portal-xtream-feature` y `pnpm nx build web --configuration=pwa`.
  - Expected: todo pasa.
  - Apunta cualquier fallo previo en el commit: no es tuyo.
- [ ] **Step 5: Desactivar `agents:validate` en el CI del fork.** CLAUDE.md, ya fusionado en la fase 1, supera a propósito el límite de 30 líneas / 2 KiB (ver "Excepciones del fork" en CLAUDE.md). Añade al paso de `ci.yml:392` un `if: github.repository == '4gray/iptvnator'` con un comentario que explique por qué. No borres el paso.
  - Expected: `pnpm run agents:validate` sigue fallando en local por el tamaño de CLAUDE.md (es lo esperado), y el paso no se ejecuta en el fork.
- [ ] **Step 6: Commit** `ci: skip agent guidance validation on the Android fork`.

### Task 2.2: Detectar el runtime nativo y desactivar ahí el service worker

**Files:**
- Modify: `libs/services/src/lib/runtime-capabilities.service.ts`
- Modify: `apps/web/src/app/services/runtime-config.ts`
- Test: `libs/services/src/lib/runtime-capabilities.service.spec.ts`
- Test: `apps/web/src/app/services/runtime-config.spec.ts`

**Interfaces:**
- Produces:
  - `RuntimeCapabilitiesService.isNativeShell: boolean` (getter). Es `true` solo si `globalThis.window?.Capacitor?.isNativePlatform?.() === true`.
  - `isPwa` sigue siendo `!isElectron`: el runtime nativo es un runtime PWA más el transporte nativo.
  - `ServiceWorkerRuntimeContext.nativeShell?: boolean`.

- [ ] **Step 1: Escribir los tests que fallan.**
  ```ts
  it('isNativeShell is true only when Capacitor reports a native platform', () => {
      (window as any).Capacitor = { isNativePlatform: () => true };
      expect(service.isNativeShell).toBe(true);
      (window as any).Capacitor = { isNativePlatform: () => false };
      expect(service.isNativeShell).toBe(false);
      delete (window as any).Capacitor;
      expect(service.isNativeShell).toBe(false);
      expect(service.isPwa).toBe(true);
  });
  // runtime-config.spec.ts
  it('never enables the service worker inside a native shell', () => {
      expect(shouldEnableServiceWorker(true, { serviceWorker: {} } as Navigator,
          { protocol: 'http:', nativeShell: true })).toBe(false);
  });
  ```
- [ ] **Step 2: Comprobar que fallan.** `pnpm nx test services --testFile=runtime-capabilities.service.spec.ts` y `pnpm nx test web --testFile=runtime-config.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
  - Añade el getter `isNativeShell` y declara `Capacitor?` en el tipo de `window` del servicio.
  - En `runtime-config.ts`, `getDefaultServiceWorkerRuntimeContext()` rellena `nativeShell` con la misma comprobación de `window.Capacitor`, y `shouldEnableServiceWorker` añade `&& !runtimeContext.nativeShell`.
- [ ] **Step 4: Comprobar que pasan.** Los mismos comandos. Expected: PASS.
- [ ] **Step 5: Commit** `feat(runtime): detect native shell and keep service worker off there`.

### Task 2.3: Configuración de build `android`

**Files:**
- Create: `apps/web/src/environments/environment.android.ts`
- Modify: `apps/web/project.json` (`targets.build.configurations.android`)

**Interfaces:**
- Produces: `pnpm nx build web --configuration=android` genera la salida en `dist/apps/web-android`.

- [ ] **Step 1: Crear `environment.android.ts`.** Copia de `environment.prod.ts` con `environment: 'ANDROID'` y `BACKEND_URL: ''`; en el runtime nativo no hay backend.
- [ ] **Step 2: Añadir la configuración `android` en `apps/web/project.json`.** Es una copia de `pwa` con estos cambios:
  - `"serviceWorker": false`;
  - `"outputPath": { "base": "dist/apps/web-android", "browser": "" }`;
  - `fileReplacements` de `environment.ts` → `environment.android.ts`.

  Mantén `baseHref: "/"` y los mismos budgets.
- [ ] **Step 3: Verificar.** `pnpm nx build web --configuration=android --skip-nx-cache` y después `ls dist/apps/web-android`.
  - Expected: build sin errores.
  - Existe `index.html`; **no** existen `ngsw-worker.js` ni `ngsw.json`.
- [ ] **Step 4: Commit** `build(web): add android build configuration without service worker`.

### Task 2.4: Capacidad de EPG del proveedor ("ahora / después" en Xtream)

**Files:**
- Modify: `libs/services/src/lib/runtime-capabilities.service.ts`
- Modify: `libs/portal/xtream/data-access/src/lib/stores/features/with-epg.feature.ts:114` (`supportsEpg` → `supportsProviderEpg` en `loadEpg` y `loadChannelEpg`)
- Modify: `libs/portal/xtream/feature/src/lib/portal-channels-list/portal-channels-list.component.ts:141-143,291,357,387` y `.html` (`showEpg`, `epgProgram`, `progressPercentage`, `channelItemSize`)
- Modify: `libs/portal/xtream/feature/src/lib/live-stream-layout/live-stream-layout.component.ts:217` y `.html:178`
- Test: `runtime-capabilities.service.spec.ts`, `with-epg.feature.spec.ts`, `portal-channels-list.component.spec.ts` (créalo si no existe), `live-stream-layout.component.spec.ts`

**Interfaces:**
- Produces: `RuntimeCapabilitiesService.supportsProviderEpg: boolean`, que vale `this.supportsEpg || this.isPwa`.
- `supportsEpg` y `supportsEpgMapping` **no cambian**. Siguen controlando XMLTV, la parrilla, la búsqueda de programas y la asignación manual de EPG, y el menú contextual de detalles sigue con `supportsEpgMapping`.

- [ ] **Step 1: Escribir los tests que fallan.**
  ```ts
  it('supportsProviderEpg is true in PWA without any EPG bridge', () => {
      expect(service.supportsEpg).toBe(false);
      expect(service.supportsProviderEpg).toBe(true);
  });
  // with-epg.feature.spec.ts — runtime stub { supportsEpg: false, supportsProviderEpg: true }
  it('loadChannelEpg uses provider short EPG when only provider EPG is supported', async () => {
      apiService.getShortEpg.mockResolvedValue([nowItem, nextItem]);
      await expect(store.loadChannelEpg(42, null)).resolves.toEqual([nowItem, nextItem]);
  });
  it('loadChannelEpg returns [] when the provider has no listings', async () => {
      apiService.getShortEpg.mockResolvedValue([]);
      await expect(store.loadChannelEpg(42, null)).resolves.toEqual([]);
  });
  // portal-channels-list / live-stream-layout specs
  it('shows now/next rows when only provider EPG is supported', ...);   // [showEpg]=true, itemSize 68
  it('renders the live EPG panel when only provider EPG is supported', ...); // .epg exists
  ```
- [ ] **Step 2: Comprobar que fallan.** `pnpm nx test services`, `pnpm nx test portal-xtream-data-access --testFile=with-epg.feature.spec.ts` y `pnpm nx test portal-xtream-feature`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
  - Añade el getter.
  - Sustituye **solo** las comprobaciones listadas en *Files*.
  - Confirma que `XtreamXmltvFallbackService.resolveCurrentEpg` sin fuentes XMLTV configuradas llama directamente a `fetchProvider` y no toca `window.electron`. Si no es así, protégelo con `supportsEpgProgramLookup` y añade un test.
- [ ] **Step 4: Comprobar que pasan.** Los mismos comandos más `pnpm nx lint portal-xtream-feature`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(xtream): show provider now/next EPG without the XMLTV bridge`.

### Task 2.5: Solo HTML5 en el runtime nativo

**Files:**
- Modify: `apps/web/src/app/settings/settings-options.ts:135-160`
- Modify: `apps/web/src/app/settings/settings.component.ts:181`
- Modify: `libs/services/src/lib/settings-store.defaults.ts`
- Modify: `libs/services/src/lib/settings-store.service.ts` (`loadSettings`, alrededor de las líneas 76-100)
- Test: `apps/web/src/app/settings/settings-options.spec.ts`, `libs/services/src/lib/settings-store.service.spec.ts`

**Interfaces:**
- Produces:
  - `SettingsPlayerAvailability.isNativeShell: boolean`.
  - `resolveRuntimePlayer(player: VideoPlayer | undefined, isNativeShell: boolean): VideoPlayer`, exportado desde `settings-store.defaults.ts`. En el runtime nativo siempre devuelve `Html5Player`; fuera de él devuelve `player ?? DEFAULT_SETTINGS.player`.

- [ ] **Step 1: Escribir los tests que fallan.**
  ```ts
  it('offers only the HTML5 player in a native shell', () => {
      expect(buildSettingsPlayerOptions({ supportsEmbeddedMpv: false,
          supportsManagedExternalPlayers: false, isNativeShell: true })
          .map((o) => o.id)).toEqual([VideoPlayer.Html5Player]);
  });
  it('coerces stored non-HTML5 player on native shell', async () => {
      // runtime stub isNativeShell=true; storage returns { player: 'videojs' }
      await store.loadSettings();
      expect(store.player()).toBe(VideoPlayer.Html5Player);
  });
  it('keeps the stored player outside a native shell', ...); // 'artplayer' stays
  ```
- [ ] **Step 2: Comprobar que fallan.** `pnpm nx test web --testFile=settings-options.spec.ts` y `pnpm nx test services --testFile=settings-store.service.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
  - `buildSettingsPlayerOptions` devuelve solo HTML5 cuando `isNativeShell` es true; `settings.component.ts` le pasa `runtime.isNativeShell`.
  - `loadSettings` aplica `resolveRuntimePlayer` tanto con ajustes guardados como sin ellos, inyectando `RuntimeCapabilitiesService` en `withMethods`.
  - No toques `DEFAULT_SETTINGS.player`, que es el valor de escritorio.
- [ ] **Step 4: Comprobar que pasan.** Los mismos comandos. Expected: PASS.
- [ ] **Step 5: Commit** `feat(settings): restrict native shell to the HTML5 player`.

### Task 2.6: Verificación de la fase en el navegador

- [ ] **Step 1: Arrancar el backend en el puerto que espera `environment.ts`** (`http://localhost:3000`), en Git Bash:
  ```bash
  PORT=3000 CLIENT_URL=http://localhost:4200 BACKEND_URL=/api \
  TSX_TSCONFIG_PATH=tsconfig.base.json pnpm tsx apps/web-backend/src/main.ts
  ```
  y en otra terminal `pnpm run serve:frontend`.
  - Expected: `curl http://localhost:3000/health` responde OK.
- [ ] **Step 2: Comprobar en Chrome (`http://localhost:4200`), con la fuente Xtream de Víctor:**
  - añadir la fuente;
  - Live, Películas y Series muestran contenido;
  - en Live, cada fila visible muestra el programa actual y el panel muestra "ahora / después";
  - buscar una película por nombre la encuentra;
  - reproducir un episodio unos segundos, recargar la página y "Continuar viendo" recupera la posición.

  Pide a Víctor que lo confirme, porque las credenciales son suyas.
- [ ] **Step 3: Pasar los checks automáticos.** `pnpm nx affected -t test lint --base=master` y `pnpm nx build web --configuration=android`. Expected: PASS.
- [ ] **Step 4: Cerrar la fase.** `requesting-code-review` → `finishing-a-development-branch` → OK de Víctor.

---

# Fase 3 — Capacitor y primera APK

Rama: `android/fase-3-capacitor`. Requisitos: Android SDK, `adb`, el JDK que
pida la versión de Capacitor instalada (vale el JBR de Android Studio) y el
Stick conectado.

### Task 3.1: Proyecto Capacitor `android-tv`

**Files:**
- Modify: `package.json` (dependencias exactas: `@capacitor/core`, `@capacitor/android`, `@capacitor/app`; `@capacitor/cli` en devDependencies; todas en la misma versión estable más reciente)
- Create: `apps/android-tv/project.json`, `apps/android-tv/capacitor.config.ts`, `apps/android-tv/android/**` (lo genera `cap add android`)
- Modify: `.gitignore` (`apps/android-tv/android/app/build/`, `apps/android-tv/android/.gradle/`, `*.jks`, `keystore.properties`)

**Interfaces:**
- Produces, como targets Nx de `android-tv`:
  - `sync`: depende de `web:build:android` y ejecuta `pnpm cap sync android` con `cwd` `apps/android-tv`;
  - `assemble-debug`: `gradlew assembleDebug` en `apps/android-tv/android`, `.bat` en Windows;
  - `install-debug`: `adb install -r <apk>`.
- `capacitor.config.ts`:
  ```ts
  { appId: 'com.victor.iptvnator', appName: 'IPTVnator',
    webDir: '../../dist/apps/web-android',
    server: { androidScheme: 'http', cleartext: true },
    plugins: { CapacitorHttp: { enabled: false } } }
  ```
- Tags de Nx: `scope:android`, `type:app`.

- [ ] **Step 1: Instalar las dependencias** con `pnpm add -E` y, dentro de `apps/android-tv`, ejecutar `pnpm cap add android`. Anota en el commit la versión de Capacitor y el `minSdkVersion` que trae, que debe ser ≤ 28.
- [ ] **Step 2: Crear `project.json` y `capacitor.config.ts`** con los valores de *Interfaces*.
- [ ] **Step 3: Verificar el build.** `pnpm nx run android-tv:sync` y después `pnpm nx run android-tv:assemble-debug`.
  - Expected: existe `app-debug.apk`.
  - Inspecciona el `AndroidManifest.xml` del merge (`app/build/intermediates/merged_manifests/...`): tiene `android:usesCleartextTraffic="true"`.
- [ ] **Step 4: Verificar en el Stick.** `adb connect 192.168.100.82:5555`, después `pnpm nx run android-tv:install-debug` y `adb shell monkey -p com.victor.iptvnator 1`.
  - Expected: la app abre la pantalla inicial de IPTVnator.
  - En `chrome://inspect`, `location.origin === 'http://localhost'`.
- [ ] **Step 5: Commit** `feat(android-tv): add Capacitor Android project`.

### Task 3.2: `NativeDataService`: transporte Xtream con CapacitorHttp

**Files:**
- Create: `apps/web/src/app/services/native-data.service.ts`
- Create: `apps/web/src/app/services/native-xtream-request.ts`, con funciones puras de URL y mapeo de respuestas, para que el servicio quede por debajo de 300 líneas
- Modify: `apps/web/src/app/app.config.ts:99-104` (`DataFactory`)
- Test: `apps/web/src/app/services/native-data.service.spec.ts`, `apps/web/src/app/services/native-xtream-request.spec.ts`

**Interfaces:**
- Consumes:
  - `RuntimeCapabilitiesService.isNativeShell` (Task 2.2);
  - `normalizeXtreamServerUrl` y `XTREAM_CLIENT_USER_AGENT` (`@iptvnator/shared/interfaces`);
  - `describeXtreamConnectionFailure` (`libs/shared/interfaces/src/lib/xtream-connection-test.ts:32`);
  - `PlaylistsService.handlePlaylistParsing('URL', text, title, url)`.
- Produces:
  - `buildXtreamApiUrl(serverUrl: string): string`: devuelve `normalizeXtreamServerUrl(serverUrl)` + `/player_api.php`, sin duplicar el segmento si ya está (mismas reglas que `appendPathSegment` en `apps/web-backend/src/app/web-backend-app.ts:533`).
  - `NATIVE_XTREAM_TIMEOUTS = { connectTimeout: 15_000, readTimeout: 90_000 }`.
  - `class NativeDataService extends PwaService`, que sobrescribe:
    - `forwardXtreamRequest`: `CapacitorHttp.get({ url, params, headers: { 'User-Agent': XTREAM_CLIENT_USER_AGENT }, responseType: 'json', ...NATIVE_XTREAM_TIMEOUTS })`;
    - `getPlaylistFromUrl`: GET de texto + `handlePlaylistParsing`;
    - `forwardStalkerRequest`: rechaza con el mensaje traducido `PORTALS.REQUEST_ERRORS.STALKER` y `status 501`. Stalker no está en el alcance;
    - `resetConnectivityGuard`: devuelve `{ reset: false }`;
    - `getAppEnvironment`: devuelve `'native'`.
  - `DataFactory`: Electron → `ElectronService`; `Capacitor.isNativePlatform()` → `NativeDataService`; si no, `PwaService`.

- [ ] **Step 1: Escribir los tests que fallan** (`jest.mock('@capacitor/core')`).
  ```ts
  it('calls player_api.php directly with trimmed credentials and VLC user agent', ...);
      // expect(CapacitorHttp.get).toHaveBeenCalledWith(expect.objectContaining({
      //   url: 'http://host:8080/player_api.php',
      //   params: { username: 'u', password: 'p&w', action: 'get_live_streams' },
      //   headers: { 'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18' } }))
  it('posts XTREAM_RESPONSE with the payload on success', ...);
  it('returns ERROR when the provider answers non-JSON', ...);   // data: '<html>…'
  it('returns ERROR with the provider status on HTTP 4xx/5xx', ...);
  it('maps a CapacitorHttp timeout to ERROR', ...);             // get rejects { code: 'SocketTimeoutException' }
  it('connectionTest returns { payload } or { connectionFailure }', ...);
  it('rejects Stalker requests as unsupported', ...);
  it('DataFactory picks NativeDataService inside a native shell', ...);
  it('buildXtreamApiUrl does not append player_api.php twice', ...);
  ```
- [ ] **Step 2: Comprobar que fallan.** `pnpm nx test web --testFile=native`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
  - Se conservan los silencios (`silentXtreamActions`), los avisos (snackbar) y `logPortalDebug*` de `PwaService`. Para no duplicar código, extrae a métodos `protected` de `PwaService` solo lo que haga falta.
  - "Non-JSON" significa que `typeof data === 'string'` o que no hay `Array`/objeto: en ese caso se trata como error con `status` 502.
- [ ] **Step 4: Comprobar que pasan.** `pnpm nx test web` y `pnpm nx lint web`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(android): native Xtream transport via CapacitorHttp`.

### Task 3.3: Aviso de WebView demasiado antiguo

**Files:**
- Create: `apps/android-tv/android/app/src/main/java/com/victor/iptvnator/WebViewVersionGuard.java`
- Modify: `apps/android-tv/android/app/src/main/java/com/victor/iptvnator/MainActivity.java`
- Test: `apps/android-tv/android/app/src/test/java/com/victor/iptvnator/WebViewVersionGuardTest.java`

**Interfaces:**
- Produces:
  - `static int majorOf(String versionName)`: devuelve el entero antes del primer `.`, o `-1`;
  - `static boolean isSupported(String versionName, int minMajor)`;
  - `MIN_WEBVIEW_MAJOR`: el mínimo de Chrome que soporta Angular 22 según su documentación de navegadores soportados. Anota la fuente en un comentario.

- [ ] **Step 1: Escribir los tests JUnit.**
  - `majorOf("138.amazon-webview-v138-7204-tv.7204.244.304") == 138`;
  - `majorOf("garbage") == -1`;
  - `isSupported("138.0", 120)` es true;
  - `isSupported("99.0.4844", 120)` es false.
- [ ] **Step 2: Comprobar que fallan.** `gradlew test` en `apps/android-tv/android`. Expected: FAIL.
- [ ] **Step 3: Implementar.** En `MainActivity.onCreate`:
  - lee `WebViewCompat.getCurrentWebViewPackage(this)`;
  - si no está soportada, muestra un `AlertDialog` no cancelable: "Tu Android System WebView (versión X) es demasiado antigua. Actualízala desde la tienda de apps.", con el botón "Salir".
- [ ] **Step 4: Comprobar que pasan.** `gradlew test`. Expected: PASS. En el Stick, la versión 138 abre sin aviso.
- [ ] **Step 5: Commit** `feat(android-tv): warn when system WebView is too old`.

### Task 3.4: Medición de arranque, memoria y CORS en el Stick

**Files:**
- Modify: `libs/portal/xtream/feature/src/lib/portal-channels-list/portal-channels-list.component.ts`. La primera vez que `filteredChannels().length > 0` con el tipo `live`, ejecuta `performance.mark('iptvnator:live-list-ready')` y `console.info('[perf] live-list-ready')`, una sola vez por carga de página.
- Create: `docs/android-measurements.md`

- [ ] **Step 1: Añadir la marca** y un test en el spec del componente: `emits the live-list-ready mark once`. Si el lint prohíbe `console`, usa `createLogger(...).info` de `@iptvnator/portal/shared/util/logger`, porque también aparece en logcat.
- [ ] **Step 2: Medir 3 arranques en frío:**
  - `adb shell am force-stop com.victor.iptvnator`, después `adb logcat -c` y `adb shell am start -W -n com.victor.iptvnator/.MainActivity`;
  - entra en Live;
  - el tiempo es la diferencia en logcat entre `Start proc ... com.victor.iptvnator` y `[perf] live-list-ready`;
  - memoria con `adb shell dumpsys meminfo com.victor.iptvnator` y con el proceso del renderer del WebView (`ps -A | grep sandboxed`), tras cargar los tres catálogos.
- [ ] **Step 3: Comprobar CORS.** Reproduce 1 canal en directo y 1 película, y revisa la consola en `chrome://inspect` buscando errores CORS.
- [ ] **Step 4: Probar en el emulador.** Crea el AVD Android TV (API 34), instala el APK y comprueba que abre y carga la fuente.
- [ ] **Step 5: Registrar los resultados** en `docs/android-measurements.md`: tabla con fecha, dispositivo, mediana y PSS. Hay tres resultados posibles:
  - mediana ≤ 20 s y ningún cierre → fase aprobada;
  - entre 10 y 20 s → se anota;
  - **más de 20 s, cierre por memoria o CORS bloqueado → para.** Escribe en ese mismo documento las mitigaciones del spec §6.1 / §6.3 con su coste y espera la decisión de Víctor.
- [ ] **Step 6: Commit y cierre de fase**, con revisión y el OK de Víctor.

---

# Fase 4 — Reproducción

Rama: `android/fase-4-reproductor`.

### Task 4.1: Marcas de tiempo hasta la primera imagen

**Files:**
- Modify: `libs/ui/playback/src/lib/html-video-player/html-video-player.component.ts`
- Test: `html-video-player.component.spec.ts`

**Interfaces:**
- Produces: al asignar una fuente nueva guarda `t0 = performance.now()`. En el primer evento `playing` de esa fuente emite `console.info('[perf] first-frame', ms, kind)`, donde `kind` es `PlaybackUrlSourceKind`.

- [ ] **Step 1: Test** `logs first-frame once per source with the elapsed ms`, con `performance.now` y el evento `playing` simulados. Comprueba que falla.
- [ ] **Step 2: Implementar.** El test pasa con `pnpm nx test ui-playback`.
- [ ] **Step 3: Commit** `feat(playback): log time to first frame`.

### Task 4.2: Sondeo de códecs MSE

**Files:**
- Create: `libs/playback/util/src/lib/diagnostics/media-codec-probe.ts`
- Modify: `apps/web/src/app/app.component.ts`. Solo si `runtime.isNativeShell`: una llamada al arrancar que hace `console.info('[codecs]', JSON.stringify(result))`.
- Test: `media-codec-probe.spec.ts`

**Interfaces:**
- Produces:
  - `MEDIA_CODEC_PROBES`:
    ```ts
    { avc: 'video/mp4; codecs="avc1.640028"', hevc: 'video/mp4; codecs="hvc1.1.6.L120.90"',
      vp9: 'video/mp4; codecs="vp09.00.10.08"', aac: 'audio/mp4; codecs="mp4a.40.2"',
      ac3: 'audio/mp4; codecs="ac-3"', eac3: 'audio/mp4; codecs="ec-3"' }
    ```
  - `probeMediaCodecs(isTypeSupported: (t: string) => boolean): Record<keyof typeof MEDIA_CODEC_PROBES, boolean>`.

- [ ] **Step 1: Test** `maps each probe through isTypeSupported`. Comprueba que falla.
- [ ] **Step 2: Implementar.** Pasa con `pnpm nx test playback-util` y `pnpm nx test web`.
- [ ] **Step 3: Commit** `feat(playback): probe MSE codec support on native shell`.

### Task 4.3: "Abrir en VLC" (reproductor externo de Android)

**Files:**
- Create: `apps/android-tv/android/app/src/main/java/com/victor/iptvnator/ExternalPlayerPlugin.java`
- Modify: `MainActivity.java` (`registerPlugin(ExternalPlayerPlugin.class)`)
- Create: `apps/web/src/app/services/native-external-player.ts`. Es la interfaz común; la implementación de Android usa el plugin, y la de iOS llegará en el futuro.
- Modify: `libs/services/src/lib/runtime-capabilities.service.ts`
- Modify: `apps/web/src/app/services/external-playback.service.ts`
- Modify: superficies de un solo stream controladas por `supportsManagedExternalPlayers`:
  - `libs/ui/playback/src/lib/playback-diagnostic-panel/*`,
  - `libs/ui/playback/src/lib/web-player-view/*`,
  - `libs/portal/xtream/feature/src/lib/vod-details/vod-details-menu.service.ts`,
  - `libs/portal/xtream/feature/src/lib/serial-details/serial-details-menu.service.ts`.
- Test: `runtime-capabilities.service.spec.ts`, `external-playback.service.spec.ts`, `playback-diagnostic-view.util.spec.ts`

**Interfaces:**
- Produces:
  - Plugin `ExternalPlayer` con `open({ url: string; title?: string }): Promise<{ launched: boolean }>`. Hace `Intent.ACTION_VIEW` con `setDataAndType(Uri.parse(url), "video/*")` y, si hay `title`, el extra `"title"`, envuelto en `Intent.createChooser`. Si no hay ninguna app capaz, resuelve con `{ launched: false }`.
  - `RuntimeCapabilitiesService.supportsNativeExternalPlayer`, que vale `isNativeShell`.
  - `openInNativeExternalPlayer(url: string, title?: string): Promise<boolean>`, en `native-external-player.ts`. Sin nombres de plataforma, para que iOS pueda implementarlo más adelante.
  - Etiqueta de UI: "Abrir en VLC". Si `launched` es false, muestra el aviso "Instala VLC desde la tienda de apps".

- [ ] **Step 1: Tests:**
  - `supportsNativeExternalPlayer follows isNativeShell`;
  - `external playback delegates to the native plugin on native shell`;
  - `diagnostic view offers "Abrir en VLC" when supportsNativeExternalPlayer`;
  - `shows install hint when no app handles the intent`.

  Comprueba que fallan.
- [ ] **Step 2: Implementar.** El plugin Java y el servicio TS; las superficies muestran la acción con `supportsManagedExternalPlayers || supportsNativeExternalPlayer`, pero solo donde se lanza un único URL.
- [ ] **Step 3: Verificar.** Tests en verde (`pnpm nx affected -t test`). En el Stick, con VLC instalado, la acción abre VLC con el stream.
- [ ] **Step 4: Commit** `feat(android): open streams in an external Android player`.

### Task 4.4: Copia de seguridad y restauración en Android

**Files:**
- Modify: `package.json` (`@capacitor/filesystem`, en la misma versión que `@capacitor/core`)
- Create: `apps/web/src/app/settings/native-backup-file.ts`
- Modify: `apps/web/src/app/settings/settings-backup.facade.ts:35-60` (antes de `downloadBackupInBrowser`, si `runtime.isNativeShell`)
- Test: `settings-backup.facade.spec.ts`

**Interfaces:**
- Produces: `saveNativeBackupFile(fileName: string, json: string): Promise<string>`. Escribe con `Filesystem.writeFile({ path: 'IPTVnator/' + fileName, data: json, directory: Directory.Documents, encoding: Encoding.UTF8, recursive: true })` y devuelve la ruta para mostrarla en un aviso.

- [ ] **Step 1: Tests:** `exports through the native file writer on native shell` y `keeps the browser download outside a native shell`. Comprueba que fallan.
- [ ] **Step 2: Implementar.** Pasa con `pnpm nx test web`.
- [ ] **Step 3: Verificar en el Stick.**
  - Exportar muestra la ruta, y `adb shell ls /sdcard/Documents/IPTVnator` lista el archivo.
  - Restaurar con el selector de archivos existente (`<input type="file">`) funciona. Si el WebView no abre el selector, **para** y comunícalo a Víctor: en TV la restauración puede quedar fuera.
- [ ] **Step 4: Commit** `feat(android): save settings backups to device storage`.

### Task 4.5: Validación de reproducción en el dispositivo

- [ ] **Step 1: Comprobar en el Stick y anotar en `docs/android-measurements.md`:**
  - resultado de `[codecs]`;
  - 3 canales en directo de deportes y de TV (anota si son HLS o TS);
  - 1 película mp4 y 1 mkv;
  - 1 episodio;
  - mediana de `[perf] first-frame` al elegir canal y al hacer zapping;
  - 30 minutos seguidos en un canal sin cortes;
  - retomar un episodio en la posición guardada;
  - "Abrir en VLC".
- [ ] **Step 2: Aplicar el criterio.**
  - Primera imagen ≤ 5 s y zapping ≤ 5 s → aprobada.
  - Si hay canales que no se reproducen (vídeo MPEG-2, audio AC3 sin soporte) o se supera un límite → **para**. Escribe `docs/android-exoplayer-proposal.md`: qué falla, la evidencia, el plugin Media3 propuesto detrás de una interfaz `NativePlayer` que en el futuro tendrá implementación iOS, y su coste. **No implementes nada** hasta el OK de Víctor.
- [ ] **Step 3: Cierre de fase**, con revisión y el OK de Víctor.

---

# Fase 4b — Prototipo medido de Media3 (ExoPlayer)

Rama: `android/fase-4b-media3`, desde `android/fase-4-reproductor`.
Aprobada por Víctor el 2026-10-12 como **prototipo medido**: no se integra en
la app hasta ver los números. Argumento y evidencia:
`docs/android-exoplayer-proposal.md` (§2 AC-3/E-AC-3, §3 tiempos, §4 diseño,
§6 redirección) y `docs/android-measurements.md` («Reproducción en el Stick»).

**Goal:** saber, con medidas en el Stick, si un reproductor nativo Media3 a
pantalla completa reproduce con imagen y sonido lo que el HTML5 no puede, y
con qué tiempos de primera imagen y zapping.

**Architecture:** plugin Capacitor `NativePlayer` que lanza
`NativePlayerActivity` (Media3 `PlayerView` a pantalla completa) con una
lista de elementos y un índice. Los eventos (`firstFrame`, `audio`, `error`,
`closed`) vuelven al WebView. En el prototipo nadie de la UI lo llama: se
lanza desde un script de medición por DevTools, como la línea base de VLC.

### Criterio de la fase (Víctor, 2026-10-12)

Media3 se integra en la app **solo si**, en el Stick y con el método de la
fase 4 (clic → primer fotograma):

- elegir canal → primera imagen y zapping → primera imagen cumplen los
  umbrales del plan: objetivo **3 s**, límite **5 s** (mediana de 3);
- los canales FHD con E-AC-3 (La 1 FHD, La 2 FHD) y una película mkv con
  AC-3 se ven **y se oyen**, tanto con **passthrough** (el receptor HDMI
  decodifica) como **decodificado en el Stick** (`OMX.dolby.*`, salida PCM).

Línea base de comparación: el reproductor HTML5 actual (7,7 s al elegir
canal, 5,1–5,9 s en zapping). VLC (10–12 s) es solo referencia.

### Global Constraints (además de las del plan)

- Dependencias nuevas: solo `androidx.media3:media3-exoplayer`,
  `media3-exoplayer-hls` y `media3-ui`, en **la misma versión exacta**: la
  última estable publicada hace más de dos semanas. Su tamaño en el APK
  debug y la versión van en el mensaje del commit.
- Sin cambios en el reproductor HTML5, en los recorridos de la app ni en
  escritorio/PWA. El código TypeScript nuevo solo existe en el runtime nativo.
- Peticiones de Media3 con el User-Agent del WebView
  (`WebSettings.getDefaultUserAgent`) y la URL resuelta antes con
  `StreamRedirects.resolve(url, ua, StreamRedirects.HTTP, 5)` (fase 4).
- Nada de credenciales ni URLs en logs, eventos o resultados de medición:
  los eventos llevan índice y nombre, nunca la URL.
- Pruebas en el Stick sin tocar datos de usuario (CLAUDE.md).

### Review Focus

1. **Receptor HDMI sin AC-3/E-AC-3:** el passthrough no está disponible.
   Esperado: el modo `auto` cae a decodificación (`OMX.dolby.*`) y suena.
   Test: Task 4b.3, `audio report marks decoded output when the sink has no passthrough`.
2. **Tres pistas E-AC-3** en el mismo canal FHD. Esperado: se elige una sola
   (la primera por defecto) y suena. Comprobado en la Task 4b.4 (evento `audio`).
3. **Redirección mal formada `//https://`** del proveedor. Esperado: Media3
   reproduce igual. Test: los de `StreamRedirectsTest` (fase 4) más la
   medición de la Task 4b.4 con canales que redirigen.
4. **Atrás en la actividad:** vuelve al WebView sin recargar la app ni perder
   el catálogo en memoria. Comprobado en la Task 4b.4.
5. **Memoria:** WebView + Media3 1080p. Esperado: sin cierres por memoria en
   10 minutos de reproducción. Comprobado en la Task 4b.4 (`dumpsys meminfo`).

### Task 4b.1: Plugin `NativePlayer` y lista de canales

**Files:**
- Modify: `apps/android-tv/android/app/build.gradle` (dependencias Media3)
- Create: `apps/android-tv/android/app/src/main/java/com/victor/iptvnator/ChannelCursor.java`
- Create: `apps/android-tv/android/app/src/main/java/com/victor/iptvnator/NativePlayerPlugin.java`
- Modify: `MainActivity.java` (`registerPlugin(NativePlayerPlugin.class)`)
- Test: `apps/android-tv/android/app/src/test/java/com/victor/iptvnator/ChannelCursorTest.java`

**Interfaces:**
- Produces:
  - `final class ChannelCursor` con `ChannelCursor(int size, int index)`,
    `int index()`, `int next()`, `int previous()`: avanza o retrocede con
    vuelta al principio o al final; `IllegalArgumentException` si `size < 1`
    o el índice está fuera de rango.
  - Plugin `NativePlayer`, método `play(options)` con
    `{ items: { url: string; title?: string }[]; index: number; isLive: boolean; startPositionMs?: number; audioMode?: 'auto' | 'pcm' }`.
    Guarda `SystemClock.elapsedRealtime()` al recibir la llamada, lanza
    `NativePlayerActivity` con todo ello en extras y resuelve `{ started: true }`.
    Rechaza con `"items is required"` si la lista está vacía.
  - Eventos del plugin (`notifyListeners`), que emite la actividad de la
    Task 4b.2: `firstFrame { index, ms }`, `audio { index, decoder: string | null, encoding: string, passthrough: boolean }`,
    `error { index, code, message }`, `closed { index, positionMs }`.

- [ ] **Step 1: Tests** `ChannelCursorTest`: `nextWrapsToTheFirstChannel`, `previousWrapsToTheLastChannel`, `rejectsAnEmptyListOrAnIndexOutOfRange`. Comprueba que fallan (`pnpm nx run android-tv:test-native`).
- [ ] **Step 2: Implementar** `ChannelCursor` y el plugin. Añadir Media3 a `build.gradle`. `pnpm nx run android-tv:test-native` en verde y `pnpm nx run android-tv:assemble-debug` compila.
- [ ] **Step 3: Commit** `feat(android): NativePlayer plugin skeleton with Media3 dependencies`, con versión de Media3 y tamaño del APK debug antes/después.

### Task 4b.2: `NativePlayerActivity` con Media3

**Files:**
- Create: `apps/android-tv/android/app/src/main/java/com/victor/iptvnator/NativePlayerActivity.java`
- Create: `apps/android-tv/android/app/src/main/res/layout/activity_native_player.xml` (`PlayerView` a pantalla completa)
- Modify: `AndroidManifest.xml` (actividad, tema sin barra, `configChanges` como `MainActivity`)
- Create: `apps/android-tv/android/app/src/main/java/com/victor/iptvnator/NativePlayerEvents.java` (puente estático actividad → plugin)

**Interfaces:**
- Consumes: `ChannelCursor`, extras de la Task 4b.1, `StreamRedirects.resolve`.
- Produces: la actividad reproduce `items[index]`:
  - fuente: `HlsMediaSource` si la URL resuelta acaba en `.m3u8`, si no `ProgressiveMediaSource`;
  - `DefaultHttpDataSource.Factory().setUserAgent(<UA del WebView>).setAllowCrossProtocolRedirects(true)`;
  - `DefaultLoadControl` con `bufferForPlaybackMs = 1000` y `bufferForPlaybackAfterRebufferMs = 2000`;
  - la URL se resuelve fuera del hilo principal antes de `setMediaItem`.
  
  Atajos:
  - `KEYCODE_DPAD_UP`, `KEYCODE_CHANNEL_UP` → `cursor.next()`;
  - `KEYCODE_DPAD_DOWN`, `KEYCODE_CHANNEL_DOWN` → `cursor.previous()`;
  - Atrás → `finish()` y evento `closed`.
  
  Por cada canal, el reloj arranca al recibir la llamada (primer canal) o al pulsar la tecla (zapping). En `onRenderedFirstFrame` se emite `firstFrame { index, ms }` y se escribe `[perf] native-first-frame <ms> <index>` con `android.util.Log.i`; esta es la única línea de log nueva y no lleva URL.

- [ ] **Step 1: Implementar.** Lógica pura ya cubierta por `ChannelCursorTest` y `StreamRedirectsTest`. La actividad se verifica en el dispositivo, con la misma decisión que el plugin `ExternalPlayer` (Ruling de la Task 4.3).
- [ ] **Step 2: Verificar en el Stick.** Lanzar desde DevTools con un canal HD que hoy funciona en HTML5. Expected: imagen y sonido, `firstFrame` recibido en el WebView, Atrás vuelve a la app sin recargarla.
- [ ] **Step 3: Commit** `feat(android): fullscreen Media3 player activity for the prototype`.

### Task 4b.3: Modo de audio (passthrough o decodificado) y su informe

**Files:**
- Create: `apps/android-tv/android/app/src/main/java/com/victor/iptvnator/AudioRouteReport.java`
- Modify: `NativePlayerActivity.java`
- Test: `apps/android-tv/android/app/src/test/java/com/victor/iptvnator/AudioRouteReportTest.java`

**Interfaces:**
- Produces:
  - `static String encodingName(int encoding)`: `C.ENCODING_AC3` → `"ac3"`,
    `C.ENCODING_E_AC3` → `"eac3"`, `C.ENCODING_E_AC3_JOC` → `"eac3-joc"`,
    `C.ENCODING_PCM_16BIT` → `"pcm16"`, `C.ENCODING_PCM_FLOAT` → `"pcm-float"`,
    cualquier otro → `"other:<n>"`.
  - `static boolean isPassthrough(int encoding)`: verdadero para AC-3, E-AC-3 y
    E-AC-3 JOC; falso para PCM.
  - En la actividad:
    - `audioMode: 'pcm'` construye el `DefaultAudioSink` con `AudioCapabilities.DEFAULT_AUDIO_CAPABILITIES` (solo PCM) y obliga a decodificar con `OMX.dolby.*`;
    - `'auto'` usa las capacidades del receptor HDMI;
    - un `AnalyticsListener` emite `audio { index, decoder, encoding, passthrough }` con el nombre del decodificador (`onAudioDecoderInitialized`, `null` si no se inicializa ninguno) y la codificación de salida (`onAudioTrackInitialized`).

- [ ] **Step 1: Tests:**
  - `namesTheDolbyAndPcmEncodings`;
  - `treatsCompressedOutputAsPassthrough`;
  - `audio report marks decoded output when the sink has no passthrough` (`isPassthrough(C.ENCODING_PCM_16BIT)` es falso).

  Comprueba que fallan.
- [ ] **Step 2: Implementar.** `pnpm nx run android-tv:test-native` en verde.
- [ ] **Step 3: Commit** `feat(android): choose and report the prototype's audio route`.

### Task 4b.4: Interfaz `NativePlayer` y medición en el Stick

**Files:**
- Create: `apps/web/src/app/services/native-player.ts`
- Test: `apps/web/src/app/services/native-player.spec.ts`
- Create: `tools/android/native-player-probe.mjs`
- Modify: `docs/android-measurements.md` (sección «Prototipo Media3»)

**Interfaces:**
- Consumes: plugin y eventos de la Task 4b.1.
- Produces, en `native-player.ts` (sin nombres de plataforma, para iOS en el futuro):
  ```ts
  export interface NativePlayerItem { url: string; title?: string }
  export interface NativePlayerRequest {
      items: readonly NativePlayerItem[];
      index: number;
      isLive: boolean;
      startPositionMs?: number;
      audioMode?: 'auto' | 'pcm';
  }
  export type NativePlayerEvent =
      | { type: 'first-frame'; index: number; ms: number }
      | { type: 'audio'; index: number; decoder: string | null; encoding: string; passthrough: boolean }
      | { type: 'error'; index: number; code: string; message: string }
      | { type: 'closed'; index: number; positionMs: number };
  export interface NativePlayer {
      play(request: NativePlayerRequest): Promise<void>;
      events(): Observable<NativePlayerEvent>;
  }
  export const NATIVE_PLAYER: InjectionToken<NativePlayer>;
  ```
  - La implementación usa `registerPlugin('NativePlayer')` y convierte los
    eventos del plugin (`firstFrame`, `audio`, `error`, `closed`) en
    `NativePlayerEvent`.
  - Refina el boceto de la propuesta (§4.1): una lista `items` con un
    `index` en lugar de un elemento más `channels`.
  - `native-player-probe.mjs`:
    - uso: `node tools/android/native-player-probe.mjs <ronda> [serial]`;
    - lanza el plugin por DevTools con los canales de la línea base HTML5
      (DEPORTES: GOL play FULLHD, GOL PLAY SD, GOL PLAY HD; GENERALISTAS:
      La 1 HD, La 1 SD, La 2 HD, La 1 FHD, La 2 FHD) y una mkv con AC-3
      (City Hunter y el perfume de Cupido 720p, id 46966; su AC-3 se comprobó en la Task 4.5);
    - zapping con `adb shell input keyevent 19` (D-pad arriba);
    - recoge los eventos y escribe solo nombres, índices y tiempos en
      `dist/performance/android-stick/media3-<timestamp>.json`.

- [ ] **Step 1: Tests** `native-player.spec.ts`:
  - `maps plugin events to NativePlayerEvent`;
  - `play passes the request to the plugin unchanged`.

  Comprueba que fallan.
- [ ] **Step 2: Implementar.** Los tests pasan con `pnpm nx test web`.
- [ ] **Step 3: Medir en el Stick**, 3 rondas, en `audioMode: 'auto'` y en
  `audioMode: 'pcm'`:
  - mediana de elegir canal y de zapping;
  - en La 1 FHD, La 2 FHD y la mkv: imagen (`firstFrame`) y sonido (evento
    `audio` con decodificador o passthrough, más el `AudioPlayer` de la app
    en estado `started` en `dumpsys audio`);
  - Atrás vuelve a la app sin recargarla;
  - PSS de la app tras 10 min en un canal FHD.

  Si el receptor no admite passthrough, anotarlo: Víctor lo prueba con otra
  tele o desactivando «Dolby Digital Plus» en los ajustes de audio de Fire OS.
- [ ] **Step 4: Anotar** los resultados en `docs/android-measurements.md`
  junto a la línea base HTML5 y aplicar el criterio de la fase.
- [ ] **Step 5: Commit** `feat(android): NativePlayer interface and Media3 measurements`.
- [ ] **Step 6: PARA.** Presenta los números a Víctor. La integración en los
  tres recorridos se planifica solo con su OK y en tareas nuevas: selección
  de reproductor, guardado de posiciones y recientes con los eventos
  `closed`, e interfaz de pistas de audio.

---

# Fase 5 — Mando y manifest

Rama: `android/fase-5-mando`. Para los estilos de foco se usa `frontend-design`,
manteniendo la estética actual y las reglas de "Keyboard Focus" de
`docs/architecture/iptvnator-ui-guidelines.md`.

### Task 5.1: Manifest de TV y banner

**Files:**
- Modify: `apps/android-tv/android/app/src/main/AndroidManifest.xml`
- Create: `apps/android-tv/android/app/src/main/res/drawable-xhdpi/banner.png` (320×180, generado con `sharp` a partir del icono de la app)
- Create: `tools/android/make-banner.mjs`

- [ ] **Step 1: Editar el manifest.** Añade:
  - `<uses-feature android:name="android.software.leanback" android:required="false"/>`;
  - `<uses-feature android:name="android.hardware.touchscreen" android:required="false"/>`;
  - `android:banner="@drawable/banner"` en `<application>`;
  - en el `intent-filter` de `MainActivity`, `<category android:name="android.intent.category.LEANBACK_LAUNCHER"/>` junto a `LAUNCHER`.
- [ ] **Step 2: Generar el banner** con `node tools/android/make-banner.mjs`.
- [ ] **Step 3: Verificar.** `aapt dump badging app-debug.apk | grep -E "leanback-launchable-activity|banner"`. Expected: aparecen las dos líneas. El banner se ve en el launcher del Stick y en el del emulador Android TV.
- [ ] **Step 4: Commit** `feat(android-tv): leanback manifest and launcher banner`.

### Task 5.2: Navegación espacial con el D-pad

**Files:**
- Modify: `package.json` (`spatial-navigation-polyfill`, el polyfill del WICG, en versión exacta; anota su tamaño en el commit)
- Create: `apps/web/src/app/services/spatial-navigation.loader.ts`
- Modify: `apps/web/src/app/app.config.ts` (un `provideAppInitializer` que llama al loader)
- Test: `spatial-navigation.loader.spec.ts`

**Interfaces:**
- Produces: `loadSpatialNavigation(runtime: RuntimeCapabilitiesService, importer = () => import('spatial-navigation-polyfill')): Promise<boolean>`. Solo importa el polyfill si `runtime.isNativeShell`, así el bundle de escritorio y de la PWA no cambia.

- [ ] **Step 1: Tests:** `does not import the polyfill outside a native shell` y `imports it once inside a native shell`. Comprueba que fallan.
- [ ] **Step 2: Implementar.** Los tests pasan con `pnpm nx test web`.
- [ ] **Step 3: Verificar en el Stick.** Recorre solo con el D-pad la lista de canales, los grupos, la rejilla de películas, una ficha de serie y su temporada, la búsqueda, los ajustes y los diálogos. Las listas con flechas propias (CDK virtual scroll con `appChannelScrollFocus`, `settings-radio-group`, `player-controls`) deben seguir funcionando: el polyfill no actúa si el evento ya tiene `defaultPrevented`.
  - Si el polyfill no funciona en alguno de los tres recorridos, **para**: describe el fallo y propone una directiva propia como alternativa a Víctor.
- [ ] **Step 4: Commit** `feat(tv): spatial D-pad navigation on native shell`.

### Task 5.3: Tecla Atrás

**Files:**
- Create: `apps/web/src/app/services/tv-back-navigation.service.ts`
- Modify: `apps/web/src/app/app.config.ts` (lo registra con `App.addListener('backButton', ...)` de `@capacitor/app`, solo con `isNativeShell`)
- Test: `tv-back-navigation.service.spec.ts`

**Interfaces:**
- Produces: `TvBackNavigationService.handleBack(): Promise<'dialog' | 'overlay' | 'fullscreen' | 'workspace-back' | 'history' | 'exit-confirm'>`. Aplica el primer caso que se cumpla, en este orden:
  1. `MatDialog.openDialogs.length > 0` → cierra el último diálogo;
  2. hay un overlay de CDK (menú) abierto → lo cierra enviando `Escape`;
  3. `document.fullscreenElement` → `document.exitFullscreen()`;
  4. hay un "Atrás" registrado con `registerWorkspaceBack` → lo ejecuta;
  5. la ruta no es la raíz → `history.back()`;
  6. en la raíz → diálogo "¿Salir de IPTVnator?" con Sí/No; con "Sí", `App.exitApp()`.

- [ ] **Step 1: Escribir los tests:**
  - uno por cada rama;
  - `closes the top dialog before leaving fullscreen`, con diálogo y pantalla completa a la vez;
  - `asks for confirmation instead of exiting at root`.

  Comprueba que fallan.
- [ ] **Step 2: Implementar.** Lee cómo exponer el back registrado en `libs/workspace/shell/feature` (`registerWorkspaceBack`). Los tests pasan con `pnpm nx test web`.
- [ ] **Step 3: Commit** `feat(tv): back key closes dialogs, exits fullscreen, navigates, confirms exit`.

### Task 5.4: Teclas multimedia y controles del reproductor con el D-pad

**Files:**
- Modify: el manejador de teclado de `libs/ui/playback/src/lib/player-controls/`. Es el que ya cubre espacio y flechas; localízalo con `player-controls-keyboard.e2e.ts`.
- Test: el spec de ese manejador

**Interfaces:**
- Produces, como mapeo de `KeyboardEvent.key`:
  - `MediaPlayPause` → alternar reproducción;
  - `MediaPlay` / `MediaPause`;
  - `MediaFastForward` / `MediaRewind` → ±10 s en VOD;
  - `ChannelUp` / `ChannelDown` → canal siguiente / anterior en directo, por la misma vía que el zapping existente (`xtream-live-channel-navigation.service.ts`).
  - Cualquier tecla del D-pad o OK muestra los controles y lleva el foco al botón de play si estaban ocultos.

- [ ] **Step 1: Tests**, uno por tecla, más `D-pad press reveals hidden controls and focuses play`. Comprueba que fallan.
- [ ] **Step 2: Implementar.** Los tests pasan con `pnpm nx test ui-playback`.
- [ ] **Step 3: Commit** `feat(playback): media keys and D-pad reveal for TV remotes`.

### Task 5.5: Ajuste al viewport de 960×540 y recorrido completo con el mando

- [ ] **Step 1: Revisar los tres recorridos y los ajustes en el Stick (960×540 CSS).** Corrige solo estilos, con la skill `frontend-design` limitada a foco y tamaños:
  - texto que no se lee a 3 m;
  - paneles que no caben;
  - anillo de foco recortado o invisible.

  Sin rediseñar. Cada ajuste va bajo una media query o una clase del runtime nativo, para no cambiar el escritorio.
- [ ] **Step 2: Hacer la prueba de aceptación con Víctor, solo con el mando:**
  - abrir la app → canal de deportes → zapping de 3 canales, viendo "ahora / después";
  - buscar una película → reproducirla → Atrás;
  - retomar una serie;
  - cambiar un ajuste;
  - salir con confirmación.

  Repetir en el emulador Android TV.
- [ ] **Step 3: Cierre de fase**, con revisión y el OK de Víctor.

---

# Fase 6 — Recorte y optimización

Rama: `android/fase-6-optimizacion`.

### Task 6.1: Medición antes del recorte

- [ ] **Step 1: Medir.** Tamaño de `app-debug.apk` y de un `assembleRelease` sin firmar ni minificar, tamaño de `dist/apps/web-android`, arranque (Task 3.4) y memoria. Anótalo en `docs/android-measurements.md`, en la sección "Antes de fase 6".

### Task 6.2: Inventario de lo que sobra (con `tech-debt`)

- [ ] **Step 1: Hacer el inventario.** Usa la skill `tech-debt` para listar qué entra en `dist/apps/web-android` sin usarse en el runtime nativo (con `source-map-explorer` o con el `stats.json` de `--stats-json`), cruzado con los grupos A y B del spec §7: Video.js, ArtPlayer, Shaka si no hay DASH, chunks de Embedded MPV, descargas, grabaciones, ajustes de EPG/XMLTV, mando a distancia, auto-update. Indica el ahorro estimado en KB de cada elemento.
  - Comprueba también la regla de CLAUDE.md "virtual scrolling en todas las listas y carga diferida de carátulas": las listas largas usan `cdk-virtual-scroll-viewport` o la ventana `visibleCount` de `withSelection`, y las `<img>` de pósters y logos usan `loading="lazy"`. Lo que falte entra en la misma lista, con su coste.
- [ ] **Step 2: Parar.** Presenta la lista a Víctor y **no elimines nada** hasta su OK.

### Task 6.3: Excluir del build Android lo aprobado

**Files:** se definen tras el OK de la Task 6.2.
- Mecanismo obligatorio: `fileReplacements` en la configuración `android` de `apps/web/project.json`, que sustituye los módulos registro (los que importan reproductores o funciones de escritorio) por variantes solo-Android. El escritorio y la PWA no cambian.

- [ ] **Step 1: Test de cada variante solo-Android.** Por ejemplo, `android player registry exposes only Html5Player`.
- [ ] **Step 2: Implementar los reemplazos y verificar.** Con `pnpm nx build web --configuration=android` y `pnpm nx build web --configuration=pwa` en verde, y `pnpm nx affected -t test --base=master` en verde.
- [ ] **Step 3: Commit**, uno por grupo eliminado.

### Task 6.4: R8 y minify en release

**Files:**
- Modify: `apps/android-tv/android/app/build.gradle` (`release { minifyEnabled true; shrinkResources true; proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro' }`)
- Modify: `apps/android-tv/android/app/proguard-rules.pro` (`-keep` para `com.victor.iptvnator.**` y los plugins Capacitor, si sus consumer rules no lo cubren)

- [ ] **Step 1: Construir** con `gradlew assembleRelease`, firmando temporalmente con la debug keystore solo para probar.
- [ ] **Step 2: Comprobar en el Stick.** Abre, carga la fuente, reproduce y abre en VLC (el plugin propio sobrevive a R8).
- [ ] **Step 3: Commit** `build(android-tv): enable R8 and resource shrinking for release`.

### Task 6.5: Medición después y comparativa

- [ ] **Step 1: Medir y comparar.** Repite la Task 6.1 y añade la tabla antes/después (APK, web, arranque, memoria) a `docs/android-measurements.md`.
- [ ] **Step 2: Cierre de fase**, con revisión y el OK de Víctor.

---

# Fase 7 — Release

Rama: `android/fase-7-release`.

**Pendientes de las fases 3 y 4 que se revisan aquí** [Víctor, 2026-10-12]. Entran
en la checklist de la Task 7.2, paso 1:
- **`android:allowBackup="true"`** en `apps/android-tv/android/app/src/main/AndroidManifest.xml`.
  Las credenciales Xtream están en IndexedDB y, en Fire OS 7 (API 28),
  `adb backup` puede extraerlas. Decidir entre `allowBackup="false"` y unas
  reglas de backup que excluyan `app_webview`.
- **Copia de seguridad de ajustes en `Documents/IPTVnator`** (Task 4.4).
  El archivo lleva las credenciales de las fuentes y está en una carpeta
  pública que cualquier app con permiso de almacenamiento puede leer. Hoy solo
  se avisa al exportar. Revisar si la copia debe ir a una carpeta privada de la
  app o cifrarse con una contraseña que se pida al exportar y al restaurar.
- **Aviso de WebView antigua** (`WebViewVersionGuard` / `MainActivity`, Task 3.3).
  En Fire TV, el WebView se actualiza con el sistema (Fire OS), no desde una
  tienda de apps, así que el texto «Actualízala desde la tienda de apps»
  confunde. Ajustarlo, por ejemplo: «Actualiza el sistema o Android System
  WebView». Comprobar además que el diálogo se ve, recibe el foco del D-pad y
  que «Salir» funciona; se puede subir temporalmente `MIN_WEBVIEW_MAJOR` en un
  build de depuración. Nunca se ha mostrado en un dispositivo.

### Task 7.1: Keystore y firma

**Files:**
- Modify: `apps/android-tv/android/app/build.gradle` (`signingConfigs.release` lee `IPTVNATOR_STORE_FILE`, `IPTVNATOR_STORE_PASSWORD`, `IPTVNATOR_KEY_ALIAS` e `IPTVNATOR_KEY_PASSWORD` de `~/.gradle/gradle.properties`; si faltan, el build release falla con un mensaje claro)

- [ ] **Step 1: Explicar el keystore a Víctor y que él lo genere:**
  ```bash
  keytool -genkeypair -v -keystore "$HOME/.android-keystores/iptvnator-release.jks" \
    -alias iptvnator -keyalg RSA -keysize 4096 -validity 10000
  ```
  - Va **fuera del repo**, con una copia de seguridad en otro sitio (por ejemplo su gestor de contraseñas o un disco externo).
  - Si lo pierde, no podrá actualizar la app instalada: habrá que desinstalarla y se perderán los datos.
  - Las contraseñas solo van en `~/.gradle/gradle.properties`.
- [ ] **Step 2: Comprobar que no se puede subir por error.** `git check-ignore -v test.jks keystore.properties`. Expected: los dos aparecen como ignorados.
- [ ] **Step 3: Construir y verificar la firma.** `gradlew assembleRelease` y `apksigner verify --print-certs app-release.apk`. Expected: firma válida con el alias `iptvnator`.
- [ ] **Step 4: Commit** `build(android-tv): release signing from local gradle properties`.

### Task 7.2: Checklist, instalación y README

**Files:**
- Modify: `README.md` (nueva sección "Android / Fire TV": requisitos, comandos pnpm/Nx, firma, `adb connect` / `adb install`, depuración con `chrome://inspect`)

- [ ] **Step 1: Revisar con la skill `deploy-checklist`:**
  - versión y `versionCode` incrementados;
  - el APK está firmado;
  - no hay secretos en el repo;
  - las mediciones de la fase 6 son vigentes;
  - `allowBackup`, la ubicación o el cifrado de la copia de seguridad y el
    texto del aviso de WebView antigua, revisados (ver «Pendientes de las
    fases 3 y 4» al inicio de esta fase).
- [ ] **Step 2: Instalar en el Stick.** `adb uninstall com.victor.iptvnator` (la firma cambia respecto a debug, así que avisa a Víctor de que se pierden los datos de prueba), después `adb install app-release.apk`, y recorre los tres recorridos.
- [ ] **Step 3: Escribir la sección del README y hacer commit** `docs: add Android / Fire TV build and install guide`.
- [ ] **Step 4: Cierre de fase**, con revisión, `finishing-a-development-branch` y el OK de Víctor.

---

# Fase 8 (opcional) — Adaptación a móvil con táctil

Rama: `android/fase-8-movil`. **Fuera del alcance actual** [Víctor: Fire TV
primero]. Se apunta aquí para no perder el objetivo. iPhone queda para un
proyecto posterior que reutilizará las mismas interfaces (§5.2 del spec).

**Antes de empezar:** el diseño de las fases 2–7 no cubre esta fase, así que hace
falta una ronda de `brainstorming` y `writing-plans` para detallar sus tareas.
Empieza siempre por esa ronda; no ejecutes nada de esta sección directamente.

**Punto de partida que dejan las fases 2–7:**
- `touchscreen` ya está `required=false`, así que el mismo APK se instala en
  móviles;
- el transporte nativo, el reproductor HTML5, "Abrir en VLC" y la copia de
  seguridad son independientes del tipo de pantalla;
- los ajustes de las fases 5 y 6 van tras capacidades del runtime nativo y no
  deben asumir "es una TV".

**Temas que tendrá que cerrar el brainstorming:**
- Detectar TV o móvil (`UiModeManager` / `uiMode`) como una nueva capacidad,
  sin `if (android)` en los componentes.
- Diseño en vertical y horizontal en teléfono: navegación, rejillas de pósters,
  panel de canales y reproductor.
- Gestos en el reproductor (tocar para mostrar controles, deslizar para
  buscar), pantalla completa y orientación.
- Que la navegación espacial y el manejador de Atrás de la fase 5 no
  interfieran con el táctil.
- Uso de datos móviles y memoria con el catálogo completo (repetir la
  medición de la Task 3.4 en un móvil de gama baja).
- Tienda (Google Play) o instalación manual.

**Criterios de aceptación iniciales** (a confirmar en el brainstorming):
- los tres recorridos (directo con "ahora / después", buscar película,
  retomar serie) se completan solo con el dedo en un móvil Android;
- la Fire TV sigue pasando la prueba de aceptación de la Task 5.5 sin
  regresiones.
