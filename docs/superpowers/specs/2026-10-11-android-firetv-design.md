# IPTVnator para Fire TV / Android TV — Diseño

## Estado

Borrador para aprobación (fase 1, rama `android/fase-1-analisis`). Base para
`docs/PLAN-ANDROID.md`, que detallará las fases 2 a 7.

Leyenda: **[Víctor]** = decidido por el usuario · **[Claude]** = decisión técnica
de Claude, revisable · **[Hecho]** = verificado en código o en el dispositivo.

## 1. Intención

Víctor usa IPTVnator con **una fuente Xtream** (~600 canales en directo,
~23.000 películas, ~8.000 series) y quiere usarla en la tele sin un PC. El
objetivo es una **APK para Android TV / Fire TV** que reutilice la UI Angular
actual, con solo lo imprescindible para que sea ligera, rápida y estable.

Hay tres recorridos de uso, **igual de importantes** [Víctor]:

1. Entrar y ir directo a un canal en directo (deportes, TV) y hacer zapping,
   viendo **qué echan ahora y qué viene después**.
2. Buscar una película por nombre y reproducirla.
3. Retomar una serie donde se dejó.

## 2. Dispositivos objetivo

- **Dispositivo mínimo de referencia** [Víctor]: Fire TV Stick 3ª gen, que es
  el de Víctor. Datos leídos por ADB [Hecho]:
  - Modelo `AFTSSS`, Fire OS 7.7.1.7 sobre **Android 9 (API 28)**.
  - WebView: `com.amazon.webview.chromium` **138**.
  - RAM total ~900 MB, **~200 MB disponibles** en reposo.
  - Pantalla 1920×1080 a densidad 320, es decir **viewport CSS de 960×540**.
  - Decodificadores nativos de vídeo: AVC, HEVC, VP9, MPEG-2.
  - Decodificadores nativos de audio: AAC, AC3, E-AC3.
- **También debe funcionar** [Víctor] en Fire TV más potentes y en otros
  dispositivos **Android TV / Google TV**. Por eso:
  - nada exclusivo de Amazon,
  - las capacidades (códecs, versión de WebView) se detectan en el dispositivo,
  - se valida en un emulador Android TV además del Stick.
- **Fuera de alcance ahora** [Víctor]: móvil Android e iPhone. Vendrán en un
  proyecto futuro, así que el diseño no debe cerrarles la puerta (ver §5).

## 3. Objetivos, no objetivos y anti-objetivos

**Objetivos**

- APK instalable por ADB que abre en el Stick y cubre los tres recorridos de §1
  usando solo el mando (D-pad, OK, Atrás, play/pausa).
- Xtream completo: directo, películas, series, búsqueda, favoritos, recientes,
  posiciones de reproducción y EPG "ahora / después".
- Tamaño de APK y arranque en frío razonables (R8 en release).

**No objetivos**

- Soporte táctil o móvil, y tablets.
- EPG XMLTV, parrilla completa, catch-up / timeshift y asignación manual de EPG.
- Caché persistente del catálogo: se descarga entero en cada arranque [Víctor].
- Probar M3U y Stalker en el dispositivo. El código se queda, pero no se valida.
- Publicar en Amazon Appstore o Google Play.

**Anti-objetivos** (lo que haría fracasar el proyecto aunque "funcione")

- Que la app se cierre por falta de memoria en el Stick al cargar el catálogo.
- Elementos a los que no se puede llegar con el D-pad, o foco invisible.
- Rediseñar la UI en vez de adaptarla.
- Componentes Angular con `if (android)`: la plataforma va detrás de servicios
  y capacidades.
- Activar el parche global de `fetch`/XHR de CapacitorHttp (ver §6.3).

### Umbrales de rendimiento en el Stick [Víctor]

Se miden en el Fire TV Stick 3ª gen con la fuente real. Superar el **límite**
suspende la fase. Quedar entre el objetivo y el límite se acepta, anotándolo.

| Medida | Objetivo | Límite |
|---|---|---|
| Abrir la app → poder elegir un canal en directo (catálogo descargándose; se admite pantalla de carga) | 10 s | 20 s |
| Elegir un canal → primera imagen | 3 s | 5 s |
| Zapping: canal siguiente con el mando → primera imagen | 3 s | 5 s |

Cada medida es la mediana de al menos 3 intentos, en arranque en frío para la
primera.

## 4. Restricciones

- **Contenedor:** Capacitor, última versión estable. Nada de Cordova, React
  Native ni reescritura nativa (CLAUDE.md).
- **Red:** CapacitorHttp para la API Xtream, sin proxy en el dispositivo
  (CLAUDE.md).
- **Reproductor:** `<video>` + hls.js / mpegts.js primero. ExoPlayer / Media3
  solo si la fase 4 lo justifica y Víctor lo confirma (CLAUDE.md).
- **Gestor de paquetes:** pnpm 10.33.0 (`packageManager`), no npm [Hecho].
- **Node:** `engines` `^22.22.3 || ^24.15.0`, y Víctor usa 24.20.0, que lo
  cumple. `.nvmrc` (22.23.2) es lo que usa CI [Hecho].
- **Convenciones del repo** (de `AGENTS.md`, que ya no se importa desde
  CLAUDE.md):
  - alias `@iptvnator/*`,
  - límites de proyectos Nx,
  - menos de 400 líneas por archivo de producción,
  - comportamiento por `RuntimeCapabilitiesService`, nunca por `window.electron`.

  **[Claude]** Se respetan. No se aplican las puertas del proceso upstream
  (revisiones Codex/Greptile, notas en `.changes/`), porque esto es un fork que
  no se contribuye a upstream.
- No avanzar de fase sin que Víctor confirme en la Fire TV (CLAUDE.md).

## 5. Arquitectura propuesta

### 5.1 Punto de partida: la PWA [Hecho]

- `DataFactory()` (`apps/web/src/app/app.config.ts:99`) elige `ElectronService`
  o `PwaService`.
- `RuntimeCapabilitiesService` (`libs/services`) oculta todo lo que requiere
  Electron.
- En la PWA:
  - las fuentes se guardan en IndexedDB,
  - favoritos, recientes y posiciones de Xtream en localStorage
    (`USER_DATA_STORAGE`),
  - el catálogo Xtream vive en memoria (`PwaXtreamDataSource`).
- `PwaService` envía todo el tráfico al proxy `apps/web-backend`
  (`/xtream`, `/parse`, `/stalker`) para saltarse CORS.

### 5.2 Nuevo runtime "nativo" (Capacitor)

- **Configuración de build `android` para `apps/web`** [Claude]:
  - sin service worker (`provideServiceWorker` desactivado, como en Electron),
  - entorno propio,
  - el resto igual que `pwa`.
- **Nuevo `DataService` nativo** [Claude], por ejemplo `NativeDataService` junto
  a `pwa.service.ts`:
  - forma recomendada: **hereda de `PwaService` y sustituye solo el transporte**
    (`forwardXtreamRequest`, `getPlaylistFromUrl`, `forwardStalkerRequest`,
    `resetConnectivityGuard`), que llama directamente al proveedor con
    `CapacitorHttp.request(...)`. Mantiene el contrato de mensajes
    (`XTREAM_RESPONSE`, `ERROR`) y los avisos de error;
  - nadie consume `getAppEnvironment()` fuera de las implementaciones [Hecho],
    así que no hay ramas por entorno que tocar;
  - envía `XTREAM_CLIENT_USER_AGENT` (firma estilo VLC; algunos paneles con WAF
    la exigen, ver `docs/architecture/xtream-portal-compatibility.md#user-agent`);
  - M3U por URL: descarga nativa más `iptv-playlist-parser` en el cliente;
    solo se pide que compile y no rompa, no se valida.
  - `DataFactory` lo elige cuando `Capacitor.isNativePlatform()`.
- **Persistencia:** se reutiliza tal cual la de la PWA. `PwaXtreamDataSource`
  se selecciona solo porque no hay puente SQLite.
- **Nueva capacidad para EPG del proveedor** [Claude]:
  - Hoy `supportsEpg` exige toda la parte de XMLTV de Electron y oculta el
    panel EPG del directo y el "ahora/después" de la lista de canales
    (`live-stream-layout.component.html:178`,
    `portal-channels-list.component.html`).
  - Se añade una capacidad más específica (p. ej. `supportsProviderEpg`) que la
    PWA y el runtime nativo cumplen, y esos dos puntos de Xtream pasan a usarla.
  - El resto de superficies EPG siguen tras `supportsEpg`.
- **Reproductor:**
  - en el runtime nativo, el reproductor por defecto es HTML5
    (`VideoPlayer.Html5Player`); hoy el valor por defecto es `VideoJs`;
  - Video.js y ArtPlayer no se ofrecen en Android [Víctor].
- **"Abrir en VLC"** [Víctor]: una acción de "reproductor externo" detrás de una
  interfaz de plataforma. En Android lanza un `Intent ACTION_VIEW` con el URL y
  tipo `video/*`, mediante un plugin Capacitor mínimo o uno existente. Sustituye
  al "abrir en MPV/VLC" de escritorio.
- **Preparado para iOS en el futuro:**
  - red: CapacitorHttp, también disponible en iOS;
  - reproductor nativo eventual: interfaz común con implementación Android
    (ExoPlayer) y, más adelante, iOS (AVPlayer);
  - "Abrir en VLC": interfaz común;
  - ningún componente conoce la plataforma.

### 5.3 Proyecto Capacitor

- **[Claude]** Un proyecto Nx propio (p. ej. `apps/android-tv`) con
  `capacitor.config.ts` y la carpeta `android/`. `webDir` apunta a la salida
  del build `android`. Quien construya puede elegir otra ubicación si la
  justifica, y debe actualizar los comandos de CLAUDE.md
  (`npx cap sync`, ruta de `gradlew`, ruta del APK).
- **appId** [Claude]: `com.victor.iptvnator`.
- **Origen y streams `http://`** [Claude]:
  - `server.androidScheme: 'http'`, de modo que el origen es
    `http://localhost`, que sigue siendo contexto seguro, y no hay bloqueo por
    contenido mixto con los streams `http://` de los proveedores;
  - `usesCleartextTraffic` / network security config que permita HTTP;
  - el esquema se fija desde el principio, porque cambiarlo más tarde cambia el
    origen y se perderían IndexedDB y localStorage.
- **Manifest TV** (fase 5): `uses-feature android.software.leanback`
  `required=false`, `android.hardware.touchscreen` `required=false`,
  `LEANBACK_LAUNCHER` y banner de 320×180. Vale igual para Fire TV y para
  Android TV.
- **WebView mínimo** [Claude]: se define la versión mínima de Chromium que
  necesita el build de Angular 22. Si el dispositivo tiene una más antigua, se
  muestra un aviso claro ("actualiza Android System WebView") en vez de una
  pantalla en blanco.

## 6. Riesgos y cómo se tratan

### 6.1 Memoria y tiempo de carga del catálogo (alto)

- **Situación** [Hecho]:
  - al entrar en cualquier sección Xtream, `initializeContent()` descarga en
    secuencia `get_live_streams`, `get_vod_streams` y `get_series` completos,
    sin categoría (`with-content.feature.ts:1219`);
  - la PWA solo los guarda en memoria y además copia cada elemento al
    normalizarlo.
- **Estimación** [Claude, sin medir]: ~20–25 MB de JSON que atraviesan el
  puente nativo de CapacitorHttp como texto, con ~200 MB libres en el Stick.
- **Tratamiento:** se mide en la fase 3 con la fuente real (tiempo hasta poder
  elegir un canal en directo, memoria con `dumpsys meminfo`, 3 arranques en
  frío). Si hay cierre por memoria o se supera el límite de 20 s (§3,
  umbrales), se proponen mitigaciones y **se espera el OK de Víctor**. Como la
  carga actual es secuencial (directo → películas → series), es probable que
  haga falta que el directo esté disponible antes que el resto. Posibles
  mitigaciones:
  - Live disponible antes que VOD y series,
  - parseo fuera del hilo principal,
  - caché persistente.

### 6.2 Compatibilidad de reproducción (alto)

- MSE en Chromium no reproduce vídeo MPEG-2.
- AC3/E-AC3 en MSE depende de cómo se compile el WebView, aunque el hardware
  los decodifique.
- Los códecs varían entre dispositivos.
- **Tratamiento** (fase 4):
  - registrar `MediaSource.isTypeSupported` para los códecs relevantes en cada
    dispositivo de prueba;
  - probar canales reales de Víctor (HLS y TS) y VOD (mp4/mkv);
  - el botón "Abrir en VLC" cubre los fallos;
  - ExoPlayer solo con datos y confirmación.

### 6.3 CORS de los streams (medio, sin verificar)

- hls.js y mpegts.js descargan con `fetch`/XHR, así que el servidor IPTV debe
  enviar cabeceras CORS. Electron tampoco lo evita (`webSecurity: true`,
  `stream-probe.ts`), lo que sugiere que los paneles Xtream habituales sí las
  envían.
- **Tratamiento:**
  - verificarlo pronto con el proveedor de Víctor (fase 3, al primer intento de
    reproducción);
  - si falla, proponer interceptar respuestas en el `WebViewClient` nativo o
    pasar a ExoPlayer.
- **No** se activa el parche global de CapacitorHttp: mpegts.js necesita `fetch`
  con streaming (`ReadableStream`), y el parche lo bufferiza todo y lo pasa por
  el puente.

### 6.4 Navegación con D-pad (alto)

- Hay un anillo de foco global (`:focus-visible` con `--app-focus-ring`), pero
  no hay navegación espacial: solo 13 archivos manejan flechas.
- Riesgos concretos:
  - controles del reproductor que aparecen al mover el ratón,
  - menús contextuales,
  - diálogos,
  - rejillas de pósters,
  - el panel lateral de canales.
- **Tratamiento** (fase 5): una capa de navegación espacial (librería ligera o
  directiva propia, a justificar por peso) más gestión de la tecla Atrás con
  `@capacitor/app`. Atrás cierra el diálogo, después vuelve atrás, y en la raíz
  sale con confirmación.

### 6.5 Viewport de 960×540 (medio)

La UI de escritorio se verá en un viewport CSS pequeño. En la fase 5 se revisan
tamaños y densidad de los tres recorridos, ajustando estilos sin rediseñar.

### 6.6 Otros (bajo)

- **Copia de seguridad:** en la PWA exporta con `<a download>` y un blob
  (`settings-backup.facade.ts`), cosa que el WebView de Android no gestiona.
  Hace falta guardar el archivo por Filesystem o Share.
- **`postinstall`:** ejecuta `electron-builder install-app-deps`, que compila
  `better-sqlite3`; en Windows puede fallar sin herramientas nativas.
- **`origin`:** apunta a `4gray/iptvnator`, no al fork de Víctor. Se cambia
  antes de la fase 2.

## 7. Qué se recorta [Víctor, aprobado]

- **A. Invisible, se elimina del build Android:**
  - auto-update de Electron, menús, bandeja, zoom y controles de ventana,
    instancia única, apertura de listas desde el sistema operativo;
  - service worker;
  - SQLite y sus workers, y el worker XMLTV.
- **B. Visible en escritorio, no se porta:**
  - Embedded MPV y MPV/VLC externos de escritorio;
  - descargas y grabaciones;
  - mando a distancia HTTP (`remote-control-web`);
  - ajustes de EPG/XMLTV.
- **C. Se mantiene tal como funciona en la PWA:**
  - favoritos, recientes y retomar reproducción;
  - control parental;
  - TMDB;
  - copia de seguridad y restauración (con la adaptación de §6.6);
  - código de M3U y Stalker, sin validar en el dispositivo.
- **Reproductores:** solo HTML5 en Android. Video.js y ArtPlayer fuera [Víctor].
  Shaka solo si hace falta para DASH.

La eliminación física de código y dependencias del bundle es la fase 6, con
estimación de ahorro y OK previo de Víctor.

## 8. Fases (resumen; el detalle va en `docs/PLAN-ANDROID.md`)

Cada fase va en su rama `android/fase-N-nombre`, con revisión de código al
cerrar y confirmación de Víctor en la Fire TV antes de pasar a la siguiente.

- **Fase 2 — Base web para Android**
  - Trabajo:
    - preparación: `origin` al fork, `pnpm install --frozen-lockfile`, CLAUDE.md
      con comandos pnpm;
    - configuración de build `android` sin service worker;
    - capacidad de EPG del proveedor;
    - HTML5 por defecto en el runtime nativo.
  - Aceptación:
    - el build `android` compila sin errores;
    - en Chrome con `web-backend`: añadir la fuente Xtream, ver directo,
      películas y series;
    - "ahora / después" visible en el directo;
    - la búsqueda encuentra una película;
    - la posición de una serie sobrevive a recargar la página;
    - los tests unitarios afectados pasan, incluido uno que comprueba que el
      runtime nativo usa HTML5 por defecto y no ofrece Video.js ni ArtPlayer
      (el runtime nativo solo existe en el dispositivo a partir de la fase 3).
- **Fase 3 — Capacitor y primera APK**
  - Trabajo: proyecto Capacitor, `NativeDataService` con CapacitorHttp,
    esquema `http`, aviso de WebView mínimo, Atrás básico.
  - Aceptación:
    - APK debug instalada por ADB en el Stick, abre y carga los tres catálogos
      de la fuente real;
    - **medición de tiempo y memoria registrada** en 3 arranques en frío, sin
      cierres; abrir la app → elegir canal en directo ≤ 20 s (objetivo 10 s);
    - primer intento de reproducción para verificar CORS;
    - abre en un emulador Android TV.
- **Fase 4 — Reproducción**
  - Trabajo: HTML5 (HLS y TS en directo, VOD, episodio), sondeo de códecs MSE,
    "Abrir en VLC".
  - Aceptación:
    - canales reales de Víctor reproducen;
    - elegir canal → imagen ≤ 5 s y zapping → imagen ≤ 5 s (objetivo 3 s en
      ambos), en HLS y en TS;
    - 30 minutos estables;
    - retomar posición de serie;
    - el botón VLC funciona;
    - si algo falla, propuesta de ExoPlayer **sin implementar** hasta el OK.
- **Fase 5 — Mando y manifest**
  - Trabajo: navegación espacial, foco visible, tecla Atrás, teclas multimedia,
    ajuste al viewport de 960×540, manifest leanback y banner.
  - Aceptación:
    - los tres recorridos y los ajustes se completan solo con el mando;
    - el banner aparece en el launcher de Fire TV y del emulador Android TV.
- **Fase 6 — Recorte y optimización**
  - Trabajo: listado de código y dependencias sin uso, con ahorro estimado y OK
    previo; R8/minify; comprobar virtual scroll; repetir la medición de
    memoria.
  - Aceptación: comparativa antes/después de tamaño de APK, arranque en frío y
    memoria.
- **Fase 7 — Release**
  - Trabajo: keystore fuera del repo, firma, APK release, deploy-checklist,
    sección "Android" en el README.
  - Aceptación: APK release firmada instalada en el Stick y los tres recorridos
    funcionando.

## 9. Lo que queda a criterio de quien construye

- Nombre y ubicación exacta del proyecto Nx de Capacitor y del `DataService`
  nativo, dentro de los límites Nx.
- Librería o directiva de navegación espacial, justificando el peso.
- Plugin para el Intent de VLC: uno existente o uno mínimo propio.
- Forma de guardar la copia de seguridad en Android (Filesystem o Share).
- Si la capacidad de EPG del proveedor se llama `supportsProviderEpg` u otra
  cosa, siempre que no afloje `supportsEpg`.
