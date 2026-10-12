# Mediciones del port Android / Fire TV

Registro de mediciones del plan (`docs/PLAN-ANDROID.md`). La fase 3 (Task 3.4)
añade aquí las del Fire TV Stick y el emulador; la fase 6, el antes/después del
recorte.

## Línea base PC (fase 2) — 2026-10-11

> **Una sola ronda** (`RUNS=1`): son valores orientativos, no medianas. Con el
> proveedor real hay mucha variación entre peticiones (ver «Red»), así que
> conviene repetir antes de sacar conclusiones finas.

### Condiciones

|                          |                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Equipo                   | PC de Víctor, Windows 10 Pro 19045, Node 24.20.0                                                                                      |
| Navegador                | Chrome 154.0.8037.99, headless (Playwright 1.62.1), ventana 1920×1080                                                                 |
| Fuente                   | Xtream real de Víctor: 630 canales, 23.680 películas, 8.791 series (40 / 17 / 12 categorías)                                          |
| Transporte               | Navegador → `web-backend` local (`localhost:3000`, proxy) → proveedor. En la APK será CapacitorHttp directo al proveedor, sin backend |
| Caché HTTP               | Desactivada (CapacitorHttp no la tiene), así que cada apertura descarga el catálogo completo                                          |
| Desarrollo               | `pnpm run serve:frontend` (configuración `development`: sin optimizar, con source maps y devtools de NgRx)                            |
| Producción               | `dist/apps/web-android` (`pnpm nx build web --configuration=android`), servido estático en `localhost:4300`                           |
| Bundle inicial `android` | 1,59 MB sin comprimir / ~347 kB estimados en transferencia; `dist/apps/web-android` ocupa 16 MB                                       |
| Script                   | `tools/android/perf-baseline.mjs` (no toca el código de la app ni guarda credenciales; uso en su cabecera)                            |

Definiciones:

- **Abrir → poder elegir canal**: desde que empieza la navegación a
  `/workspace/xtreams/<id>/live` (fuente ya añadida, perfil con IndexedDB)
  hasta que la primera fila de canal es visible después de pulsar la primera
  categoría. Es tiempo de máquina: no incluye lo que tarda una persona en
  pulsar.
- **Alta de la fuente**: desde pulsar «Add playlist» con la app vacía hasta
  que no queda ninguna petición Xtream en curso (catálogo descargado).
- **Procesado**: suma de _long tasks_ (> 50 ms) del hilo principal que empiezan
  después de que llega una respuesta y antes de la siguiente. Es una
  atribución aproximada.
- **Hilo principal**: `Performance.getMetrics` de Chrome. «Otros» es todo lo que
  no es script, estilos ni layout: pintado, parseo HTML, recolección de
  memoria y copia estructurada hacia IndexedDB.

### Resultados principales

| Métrica                                                       | Desarrollo | Producción (`android`) |
| ------------------------------------------------------------- | ---------: | ---------------------: |
| Abrir → primer pintado (FCP)                                  |     0,11 s |                 0,10 s |
| Abrir → DOMContentLoaded                                      |     0,67 s |                 0,24 s |
| Abrir → primera petición a la API (arranque de la app)        |     2,44 s |                 1,21 s |
| Abrir → categorías de Live en el DOM (tapadas por el overlay) |     4,67 s |                 2,27 s |
| **Abrir → poder elegir canal**                                | **17,2 s** |              **8,9 s** |
| Alta de la fuente → catálogo completo                         |     12,2 s |                 12,1 s |
| Heap JS tras abrir Live                                       |      82 MB |                  42 MB |
| Heap JS tras el alta                                          |      75 MB |                  40 MB |

La diferencia de 8 s entre desarrollo y producción al abrir **no** viene
sobre todo del build. El proveedor tardó mucho más en esa ronda de desarrollo
(`get_vod_streams` 6,1 s frente a 1,3 s), y el hilo principal solo trabajó
~1 s más (3,7 s frente a 2,7 s en total).

### Cronología de la apertura (producción)

Milisegundos desde el inicio de la navegación:

| Desde |     Hasta | Qué ocurre                                                                         |
| ----: | --------: | ---------------------------------------------------------------------------------- |
|     0 |     1.211 | Arranque de la app (bundle, Angular, lectura de IndexedDB, rutas)                  |
| 1.221 |     1.616 | `get_account_info`                                                                 |
| 1.639 |     2.024 | Categorías de directo, películas y series (en paralelo)                            |
| 2.032 | **3.454** | `get_live_streams` → **los canales ya están en memoria**                           |
| 3.470 |     4.790 | `get_vod_streams` (empieza cuando termina el directo)                              |
| 5.025 |     8.151 | `get_series` (empieza cuando termina películas)                                    |
| 8.151 |     8.862 | Procesado de series, se quita el overlay de importación y se pinta la primera fila |

En desarrollo la secuencia es la misma: directo listo a los 5,7 s, primera
fila a los 17,2 s.

### Dónde se va el tiempo (abrir → poder elegir canal, producción)

| Parte                                                    | Tiempo |    % |
| -------------------------------------------------------- | -----: | ---: |
| Red (esperas en serie al proveedor)                      | 6,65 s | 75 % |
| Arranque de la app hasta la primera petición             | 1,21 s | 14 % |
| Procesado entre respuestas, pintado de la lista y huecos | 1,00 s | 11 % |

Trabajo del hilo principal en ese intervalo:

|                                 | Desarrollo | Producción |
| ------------------------------- | ---------: | ---------: |
| Total ocupado                   |   3.654 ms |   2.670 ms |
| Script                          |   1.211 ms |     781 ms |
| Estilos                         |     164 ms |     164 ms |
| Layout                          |     172 ms |     150 ms |
| Otros (pintado, GC, IndexedDB…) |   2.107 ms |   1.575 ms |

El estilo y el layout son pequeños. El dibujado de la lista de canales (CDK
virtual scroll) **no** es el cuello de botella en el PC.

### Red: tamaño y duración de cada petición del catálogo

Petición directa al proveedor desde Node (sin navegador ni backend; el
proveedor responde con gzip, el tamaño es el JSON ya descomprimido):

| Acción                  | Elementos |  Tamaño | Primer byte |    Total | `JSON.parse` en Node |
| ----------------------- | --------: | ------: | ----------: | -------: | -------------------: |
| `get_live_categories`   |        40 |  2,9 kB |   1.144 ms¹ | 1.149 ms |                 0 ms |
| `get_live_streams`      |       630 |  291 kB |      352 ms |   549 ms |                 1 ms |
| `get_vod_categories`    |        17 |  1,2 kB |      212 ms |   212 ms |                 0 ms |
| `get_vod_streams`       |    23.680 | 9,68 MB |    5.557 ms | 6.459 ms |                48 ms |
| `get_series_categories` |        12 |  0,9 kB |      211 ms |   212 ms |                 0 ms |
| `get_series`            |     8.791 | 8,33 MB |    1.617 ms | 2.836 ms |                32 ms |

¹ Incluye abrir la primera conexión (DNS, TCP).

A través de la app (navegador → backend → proveedor), total por petición y
procesado posterior en el hilo principal:

| Acción             |  Tamaño | Alta dev | Alta prod | Abrir dev | Abrir prod | Procesado (dev / prod, abrir) |
| ------------------ | ------: | -------: | --------: | --------: | ---------: | ----------------------------: |
| `get_live_streams` |  286 kB |   888 ms |  1.398 ms |  1.169 ms |   1.422 ms |                    55 / 51 ms |
| `get_vod_streams`  | 9,49 MB | 5.814 ms |  5.354 ms |  6.079 ms |   1.320 ms |                  329 / 324 ms |
| `get_series`       | 8,00 MB | 1.600 ms |  3.473 ms |  4.384 ms |   3.126 ms |                  242 / 211 ms |

Observaciones:

- En las peticiones grandes casi todo el tiempo es **espera hasta el primer
  byte**: el proveedor genera la respuesta. La descarga en sí es corta en la
  red del PC. El primer byte de `get_vod_streams` osciló entre 1,2 s y 6,0 s
  en la misma tarde.
- Películas y series suman ~17,5 MB de JSON por apertura; el directo, 0,3 MB.
- El procesado en el navegador es pequeño en el PC (≤ 0,4 s por petición). En
  el Stick, con una CPU mucho más lenta, será varias veces mayor: hay que
  medirlo en la Task 3.4.

### Por qué la lista de canales espera a películas y series

Al abrir una fuente Xtream, `XtreamStore` importa el catálogo **en serie**:
directo → películas → series (`fetchAllContent` en
`libs/portal/xtream/data-access/src/lib/stores/features/with-content.feature.ts`).
El directo se publica en el store y se marca `ready` en cuanto llega (a los
~3,45 s). Pero la shell muestra un overlay de importación a pantalla completa
(`app-workspace-shell-import-overlay`, `position: fixed; inset: 0`) mientras
haya una sesión de importación activa en Live, Películas, Series, Búsqueda o
Añadidos recientemente. Esa condición es `showXtreamImportOverlay`, en
`libs/workspace/shell/feature/src/lib/workspace-shell/services/workspace-shell-xtream-import.service.ts`.
La sesión (`activeImportSessionId`) solo se cierra en el `finally`, después de
series. Las categorías ya están en el DOM a los 2,3 s, pero no se pueden pulsar
hasta que desaparece el overlay, a los ~8,3 s.

### Propuesta pendiente: directo antes que películas y series

**No aplicada.** Se decide en la fase 3 con la medición del Stick (Task 3.4).

**Cambio mínimo:** en `showXtreamImportOverlay`, para las secciones `live`,
`vod` y `series`, mostrar el overlay solo mientras el tipo de esa sección no
esté `ready` en `contentLoadStateByType`. Búsqueda y Añadidos recientemente
mantienen el comportamiento actual, porque necesitan el catálogo completo.

- Archivos: `workspace-shell-xtream-import.service.ts` (un `computed`,
  ~10 líneas) y su spec, con tres casos: oculto en Live con el directo listo y
  películas cargando; visible en Películas mientras cargan; visible en
  Búsqueda hasta el final.
- Opcional: limitarlo al runtime nativo (`runtime.isNativeShell`) para que el
  escritorio y la PWA no cambien.
- Efecto esperado en este PC: poder elegir canal a ~3,5–4 s en lugar de 8,9 s.
  En el Stick el ahorro absoluto debería ser mayor (películas y series son el
  67 % de la red).

**Riesgos:**

1. **Tirones mientras termina la importación.** Películas y series se siguen
   descargando y procesando en segundo plano (~5 s en el PC, bastante más en el
   Stick). Sus _long tasks_ (0,3 s y 0,2 s en el PC; en el Stick quizá 1–3 s)
   pueden congelar el scroll o el mando justo después de abrir.
2. **Ancho de banda compartido.** ~17,5 MB de catálogo compiten con el primer
   canal que se reproduce, y la primera imagen de ese canal puede tardar más en
   los primeros segundos (se mide en la Task 4.5).
3. **Memoria.** El pico no baja (el catálogo se carga entero igual), y
   reproducir mientras se procesa puede subirlo. Hay que vigilar cierres por
   memoria en el Stick.
4. **Experiencia.** En Live deja de verse el progreso de la importación. Si se
   pasa a Películas antes de tiempo, aparece el overlay. Las peticiones de EPG
   («ahora / después») empiezan antes y se suman a las del catálogo hacia el
   proveedor.
5. **Divergencia con upstream** en una librería compartida de la shell. Se
   reduce si se limita al runtime nativo.

Alternativas más grandes, fuera de lo mínimo: descargar películas y series
en paralelo (ahorra hasta ~1,3–3 s del catálogo total, con más pico de
memoria), o la caché persistente en IndexedDB con refresco en segundo plano y
la carga por categoría del spec §6.1.

### Otras observaciones para fases posteriores

- **Arranque de la app hasta la primera petición:** 1,2 s en producción en el
  PC. En el Stick puede ser varias veces más. Se revisa con la medición de la
  Task 3.4 y el recorte de la fase 6.
- **Desarrollo frente a producción:** el servidor de desarrollo duplica el
  heap (82 frente a 42 MB) y añade ~1 s de hilo principal. Para juzgar la
  fluidez hay que usar siempre el build `android`.

## Fire TV Stick (fase 3, Task 3.4) — 2026-10-12

> **Resultado: supera el límite.** Mediana de 55,7 s desde que arranca la app
> hasta poder elegir un canal en directo (objetivo 10 s, límite 20 s). Sin
> cierres por memoria y sin bloqueos CORS. Según el plan, **la fase queda
> parada hasta que Víctor decida** entre las mitigaciones de abajo.

### Condiciones

|                     |                                                                                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dispositivo         | Fire TV Stick 3ª gen (`AFTSSS`), Fire OS 7 / Android 9, WebView `138.amazon-webview-v138-7204-tv.7204.244.304`                                   |
| APK                 | `app-debug.apk` de `android/fase-3-capacitor` (commit `48a3d6a63`), build web `android`                                                          |
| Fuente              | La Xtream real de Víctor, añadida por él en el Stick (630 canales, 23.680 películas, 8.791 series)                                               |
| Transporte          | `NativeDataService` → `CapacitorHttp` directo al proveedor, sin backend                                                                          |
| Script              | `tools/android/stick-startup.mjs` (uso en su cabecera). Resultados en bruto: `dist/performance/android-stick/2026-10-12T06-03-37-874Z.json`      |
| Emulador Android TV | **Omitido** (Task 3.4, paso 4) por decisión de Víctor: el PC no tiene el driver de virtualización. El AVD `Television_1080p_API_34` queda creado |

Cada ronda es un arranque en frío: `am force-stop`, `logcat -c` y
`am start -W`. El script entra en Live dentro de la app, sin recargar, en
cuanto existe la shell. Pulsa la primera categoría en cuanto nada la tapa,
igual que la medición del PC. El tiempo va de la línea
`Start proc … com.victor.iptvnator` de logcat a `[perf] live-list-ready`. Es
tiempo de máquina: no incluye lo que tarda una persona en pulsar.

### Resultados (3 arranques en frío)

| Ronda       | `am start` (primer frame) | Categoría pulsable | **Poder elegir canal** |    PSS app | PSS renderer WebView |   Heap JS |
| ----------- | ------------------------: | -----------------: | ---------------------: | ---------: | -------------------: | --------: |
| 1           |                     3,8 s |             55,3 s |             **55,7 s** |     161 MB |               101 MB |     45 MB |
| 2           |                     4,0 s |             47,4 s |             **47,9 s** |      99 MB |                92 MB |     45 MB |
| 3           |                     5,4 s |             56,0 s |             **56,4 s** |     155 MB |               102 MB |     45 MB |
| **Mediana** |                 **4,0 s** |         **55,3 s** |             **55,7 s** | **155 MB** |           **101 MB** | **45 MB** |

- PSS medido 20 s después de cargar los tres catálogos. App + renderer
  ≈ 256 MB de mediana. El Stick tiene ~900 MB en total y ~200 MB libres en
  reposo.
- **Ningún cierre**: el proceso sigue vivo al final de cada ronda y no hay
  líneas de `lowmemorykiller` ni `has died`. Tampoco en la ronda de prueba
  previa (55,4 s).
- La categoría solo se puede pulsar cuando desaparece el overlay de
  importación. Desde ahí, la primera fila tarda 0,3–0,5 s.

### Cronología de la apertura (ronda 1, la mediana)

Segundos desde `Start proc`:

| Desde |    Hasta | Qué ocurre                                                            |
| ----: | -------: | --------------------------------------------------------------------- |
|     0 |      9,9 | Arranque de la app hasta la primera petición                          |
|   9,9 |     12,1 | `get_account_info`                                                    |
|  12,5 |     14,6 | Categorías de directo, películas y series (en paralelo)               |
|  14,6 | **17,9** | `get_live_streams` → **los canales ya están en memoria**              |
|  18,3 |     42,2 | `get_vod_streams` (23,4 s)                                            |
|  43,6 |     54,6 | `get_series` (10,6 s)                                                 |
|  55,3 |     55,7 | Se quita el overlay, se pulsa la categoría y se pinta la primera fila |

En las tres rondas: el directo está en memoria a los **17,9 / 16,1 / 21,1 s**;
`get_vod_streams` tarda 23,4 / 16,9 / 20,3 s y `get_series`
10,6 / 10,5 / 11,5 s. En el PC, `get_vod_streams` tardó 6,5 s directo desde
Node.

### Dónde se va el tiempo en el Stick

**1. Arranque hasta la primera petición: 8,8–13,6 s (PC: 1,2 s).** Desglose
de un arranque en frío al dashboard (una muestra), con marcas de la página
en el mismo reloj que logcat:

| Tramo                                      | Tiempo |
| ------------------------------------------ | -----: |
| Proceso → inicio de navegación del WebView |  3,6 s |
| → primer pintado (FCP)                     | +1,8 s |
| → DOMContentLoaded                         | +2,6 s |
| → último de los 25 archivos JS descargado  | +3,6 s |
| → primera petición a la API                | +5,3 s |

El dashboard carga en el arranque los chunks de Video.js y ArtPlayer: se ven
en la consola, aunque en el runtime nativo solo se usa HTML5. Es candidato
del recorte de la fase 6.

**2. El puente nativo de CapacitorHttp duplica el coste de los catálogos
grandes.** Prueba dentro de la app con la sesión ya cargada (una muestra,
`get_vod_streams`, 9,7 MB). Las credenciales se usaron solo dentro del
WebView; el script devolvió solo tiempos:

| Vía                                                 |    Tiempo |
| --------------------------------------------------- | --------: |
| `CapacitorHttp`, `responseType: 'json'` (la actual) |    15,1 s |
| `CapacitorHttp`, `responseType: 'text'`             |    14,0 s |
| `fetch` del WebView + `JSON.parse` (0,4 s)          | **7,7 s** |

Con `Content-Type: application/json`, CapacitorHttp parsea el JSON en Java
aunque se pida texto. Después lo vuelve a serializar para cruzar el puente, y
el WebView lo parsea otra vez. Pedir texto no lo evita.

El `fetch` directo funcionó porque **el proveedor de Víctor envía cabeceras
CORS en `player_api.php`**. No lleva el User-Agent de VLC: `fetch` no permite
fijarlo.

### CORS de los streams (Task 3.4, paso 3)

- **Canal en directo:** se reproduce por MSE (`blob:`), a 1280×720 y
  avanzando.
- **Película `.mkv`:** se reproduce en `<video>` directo, a 1920×1080. En 5 s
  decodifica 120 fotogramas y no pierde ninguno.
- **Sin errores CORS** en la consola en ninguno de los dos casos. Las
  mitigaciones de §6.3 no hacen falta.
- `adb screencap` sale negro sobre el vídeo porque no captura la capa de vídeo
  por hardware. La imagen y el audio en la tele (por ejemplo, AC3 en `.mkv`)
  se validan en la Task 4.5.

### Mitigaciones propuestas (spec §6.1) — pendientes de decisión

Las estimaciones salen de la cronología de arriba: no son mediciones de cada
mitigación. Coste: S = horas, M = un día, L = varios días.

| #   | Mitigación                                                                                                             | Efecto estimado en el Stick                                                                                                                                                                                   |     Coste      | Notas                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Overlay de importación por sección**: Live usable en cuanto el directo esté `ready` (propuesta de la fase 2, arriba) | Poder elegir canal a **~18 s** de mediana (16–21,5 s): dentro del límite, por encima del objetivo. Una de las 3 rondas habría pasado de 20 s                                                                  |       S        | Cambio en `workspace-shell-xtream-import.service.ts` (~10 líneas) y su spec con 3 casos. Se puede limitar al runtime nativo. Riesgos medidos en el Stick, abajo                             |
| 2   | **Catálogo por `fetch` del WebView**, con vuelta a `CapacitorHttp` si falla (CORS o red)                               | `get_vod_streams` −7 s (medido) y `get_series` −4–5 s (estimado): el catálogo completo, ~12 s antes. Sola no baja de 20 s (~44 s); con la 1, acorta el trabajo en segundo plano y el directo llega ~1 s antes |       M        | **Choca con la decisión de CLAUDE.md "Red: CapacitorHttp"**: necesita tu OK explícito. Sin User-Agent VLC: funciona con tu proveedor; en paneles con WAF entraría la vuelta a CapacitorHttp |
| 3   | Descargar películas y series en paralelo                                                                               | Catálogo completo ~10 s antes; el directo no cambia                                                                                                                                                           |       S        | Sube el pico de memoria (dos respuestas grandes a la vez por el puente) con ~200 MB libres. No recomendado ahora                                                                            |
| 4   | Reducir el arranque hasta la primera petición (8,8–13,6 s)                                                             | Desconocido hasta perfilarlo. Es el bloque fijo más grande y el que separa ~18 s del objetivo de 10 s                                                                                                         | S (investigar) | Trazar el arranque, no cargar Video.js/ArtPlayer en el runtime nativo, etc. Encaja en la fase 6 (Tasks 6.2/6.3); se puede adelantar el perfilado                                            |
| 5   | Caché persistente del catálogo en IndexedDB con refresco en segundo plano                                              | Segundo arranque y siguientes: directo en pocos segundos tras el arranque de la app                                                                                                                           |       L        | **Contradice un no-objetivo tuyo** (spec §3: catálogo completo en cada arranque). Solo si cambias esa decisión                                                                              |
| 6   | Carga por categoría (`get_live_streams&category_id=…`)                                                                 | Directo mucho antes                                                                                                                                                                                           |       L        | Rompe Búsqueda y Añadidos recientemente, que necesitan el catálogo completo. No recomendado                                                                                                 |
| 7   | Parseo fuera del hilo principal (Worker)                                                                               | Menos tirones mientras termina la importación (relevante con la 1)                                                                                                                                            |       M        | Solo tiene sentido con la 2: un Worker no puede usar CapacitorHttp. Mejor después de medir los tirones de la 1                                                                              |

**Riesgos de la mitigación 1 vistos en el Stick** (completan la lista de la
fase 2 de más arriba):

- **Trabajo en segundo plano después de liberar Live: ~37 s.** Son películas y
  series por el puente, más su normalización. Cada respuesta grande llega al
  hilo principal de golpe. Estimación: 1–2 s de bloqueo por catálogo, mientras
  el usuario ya recorre canales. **Hay que medirlo** al implementarla, con el
  D-pad sobre la lista durante esos 37 s.
- **Ancho de banda:** ~17,5 MB de catálogo compiten con el primer canal que se
  reproduce. Se mide en la Task 4.5.
- **Memoria:** el pico no cambia (app + renderer ≈ 256 MB), pero reproducir
  mientras se importa lo sube. No hubo cierres en 4 arranques, pero tampoco se
  reprodujo nada durante la importación.
- **Divergencia con upstream:** limitada si el cambio solo actúa con
  `runtime.isNativeShell`.

**Recomendación de Claude:** aplicar la **1, solo en el runtime nativo**, y
volver a medir. Con eso, la fase debería quedar entre el objetivo y el límite
(«se anota»). Adelantar el **perfilado de la 4**, porque es lo que puede
acercar al objetivo de 10 s sin tocar decisiones de arquitectura. La **2**
solo si aceptas relajar la regla de CapacitorHttp para el catálogo. El resto,
no por ahora.

## Fire TV Stick tras las mitigaciones 1 y 4 — 2026-10-12

Decisión de Víctor sobre la tabla anterior: aplicar la **1** (overlay por
sección, solo en el runtime nativo) y la **4** (investigar el arranque,
empezando por Video.js y ArtPlayer). No aplicar la 2, la 3, la 5, la 6 ni la
7; la 2, solo con su OK expreso más adelante.

> **Resultado: 17,2 s de mediana** hasta poder elegir canal (antes, 55,7 s).
> Dentro del límite de 20 s y por encima del objetivo de 10 s. Sin cierres por
> memoria. Según la decisión de Víctor, la fase **se para aquí** y se le
> presentan las palancas que quedan (abajo).

### Qué se cambió

| Mitigación | Cambio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Commit      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1          | En el runtime nativo, el overlay de Live, Películas y Series sigue el estado de carga de su propio tipo. Búsqueda y Añadidos recientemente siguen esperando a toda la importación. Escritorio y PWA, sin cambios                                                                                                                                                                                                                                                                                                                              | `7914695aa` |
| 4          | La ruta `workspace` cargaba la shell desde el índice de su librería. Ese índice, y la propia shell, llegaban al barrel `@iptvnator/ui/playback`, así que **en cada arranque se descargaba, compilaba y ejecutaba un chunk de ~3 MB** con Video.js, ArtPlayer, hls.js, mpegts.js y Shaka, también en el dashboard. Ahora la shell entra por `@iptvnator/workspace/shell/feature/workspace-shell` y el servicio de overlays por `@iptvnator/ui/playback/embedded-mpv-player`. Afecta al empaquetado en todos los runtimes, no al comportamiento | `584e22bee` |

Investigación de la 4 (perfil de CPU de una recarga directa a Live en el
Stick, con el proceso ya caliente: 5,4 s hasta la primera petición). No hay un
culpable único:

- ~3,1 s de «(program)»: parseo y compilación de JS, estilos y layout.
- ~1,1 s en el chunk de Angular core.
- ~0,5 s en los _helpers_ de esbuild que emulan `async/await` y el spread de
  objetos.
- ~0,2 s de zone.js.
- ~0,2 s en el chunk de reproductores.

Con la 4, el dashboard ya no carga los reproductores (en la consola dejan de
salir los avisos de Video.js y ArtPlayer). **Live sigue cargándolos**, porque
`live-stream-layout` importa `WebPlayerViewComponent` desde el barrel. Por eso
el tiempo hasta la primera petición en Live apenas cambia: 10,4 s de mediana
ahora, frente a 10,6 s antes.

### Resultados (3 arranques en frío)

| Ronda       | Poder elegir canal |    PSS app | PSS renderer WebView |   Heap JS |
| ----------- | -----------------: | ---------: | -------------------: | --------: |
| 1           |         **17,2 s** |     155 MB |                96 MB |     45 MB |
| 2           |         **16,7 s** |     155 MB |                95 MB |     45 MB |
| 3           |         **17,2 s** |     159 MB |               100 MB |     45 MB |
| **Mediana** |         **17,2 s** | **155 MB** |            **96 MB** | **45 MB** |

- Ningún cierre. La memoria no cambia respecto a la medición anterior
  (≈ 251 MB app + renderer). Se mide al terminar la importación, con la lista
  recorrida.
- Resultados en bruto: `dist/performance/android-stick/2026-10-12T06-39-44-780Z.json`
  (más una ronda de prueba previa de 20,6 s, en `…06-34-04-440Z.json`).

Cronología de la ronda 1 (segundos desde `Start proc`):

| Desde | Hasta | Qué ocurre                                          |
| ----: | ----: | --------------------------------------------------- |
|     0 |  10,4 | Arranque de la app hasta la primera petición        |
|  10,4 |  12,6 | `get_account_info`                                  |
|  12,6 |  14,8 | Categorías (en paralelo)                            |
|  14,8 |  16,2 | `get_live_streams`                                  |
|  16,2 |  17,2 | Se quita el overlay de Live y se pinta la lista     |
|  16,2 |  36,4 | `get_vod_streams` en segundo plano (Live ya se usa) |
|  37,7 |  48,6 | `get_series` en segundo plano                       |

### Tirones al recorrer canales mientras se importan películas y series

Desde que Live está listo, el script pulsa ↓ en la lista de canales cada
300 ms. Lo hace por DevTools (`Input.dispatchKeyEvent`, el mismo camino que una
tecla) y sigue hasta 5 s después de que responda `get_series`, unos 31 s en
total.

| Ronda | Teclas | Tecla atendida (mediana / p90 / máx.) | Teclas > 250 ms | Long tasks (> 50 ms) | Long tasks > 500 ms | Mayor long task | Mayor hueco sin fotograma |
| ----- | -----: | ------------------------------------: | --------------: | -------------------: | ------------------: | --------------: | ------------------------: |
| 1     |     80 |                     38 / 234 / 525 ms |               5 |                   18 |                   2 |       **2,9 s** |                 **2,9 s** |
| 2     |     77 |                     36 / 218 / 414 ms |               5 |                   19 |                   2 |       **2,8 s** |                 **2,7 s** |
| 3     |     79 |                     35 / 215 / 402 ms |               5 |                   18 |                   2 |       **2,6 s** |                 **2,6 s** |

- Casi todo el rato la lista responde bien: mediana de 35–38 ms por tecla.
- **En cada ronda hay dos congelaciones largas**: una de 2,6–2,9 s y otra de
  más de 0,5 s. Coinciden en número con las dos respuestas grandes (películas y
  series), que se convierten y normalizan de golpe en el hilo principal.
  Durante la congelación la pantalla no se actualiza y las pulsaciones se
  acumulan.
- La latencia de tecla subestima las congelaciones: el script deja de pulsar
  mientras espera su propia consulta a la página. La medida fiable es el hueco
  sin fotograma.

### Palancas que quedan para bajar de 10 s (pendientes de decisión)

Faltan ~7 s. Estimaciones a partir de la cronología y del perfil, no medidas.

| #   | Palanca                                                                                                                                                                                            | Efecto estimado                                                    | Coste          | Notas                                                                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | **Pedir los canales en paralelo con `get_account_info` y las categorías**, en lugar de en serie (hoy son 3 esperas encadenadas de ~2 s)                                                            | **−2 a −3,5 s**                                                    | S–M            | Toca `with-content.feature.ts`, el store compartido; se puede limitar al runtime nativo. Es distinta de la opción 3 (películas y series en paralelo). Hay que comprobar que nada depende de `account_info` antes del catálogo |
| B   | **Sacar los reproductores del camino de Live**: `@defer` para `app-web-player-view` e imports de `ui/playback` por puntos de entrada secundarios en `live-stream-layout`                           | −0,5 a −1,5 s                                                      | M              | Cambia cuándo se carga el reproductor en todos los runtimes (la primera reproducción espera a ese chunk). Librería compartida                                                                                                 |
| C   | Recorte de la fase 6 adelantado: fuera Video.js, ArtPlayer y Shaka del build `android` (`fileReplacements`)                                                                                        | −0,5 a −1 s y ~1,8 MB menos de JS                                  | M              | Ya está en el plan (Tasks 6.2/6.3). Solo afecta a Android                                                                                                                                                                     |
| D   | Comprobar si el WebView guarda la caché de código compilado de los scripts que sirve Capacitor (`http://localhost`, peticiones interceptadas). Si no la guarda, cada arranque recompila todo el JS | Desconocido; puede ser una parte grande de los ~3 s de compilación | S (investigar) | Solo medición; el arreglo dependería de lo que salga                                                                                                                                                                          |
| E   | Salida ES2022 y/o quitar zone.js (sin _helpers_ de `async/await` ni spread)                                                                                                                        | −0,5 a −1 s                                                        | M–L            | Afecta a toda la app. Upstream tiene trabajo previo (`perf/zoneless-flag`, `perf-electron-es2022-target`)                                                                                                                     |
| F   | Repartir la normalización de películas y series en trozos que cedan el hilo principal                                                                                                              | Quita las congelaciones de ~2,8 s; no cambia los 17 s              | M              | Solo para los tirones. Store compartido; se puede limitar al runtime nativo                                                                                                                                                   |

El arranque nativo hasta el primer fotograma de la actividad (`am start`,
3,7–3,9 s) es casi un suelo: es Android creando el proceso y el WebView.

**Recomendación de Claude:** A, porque es la que más ahorra por menos coste,
y D, porque cuesta poco investigarla y puede ser grande. Con la A, ~14–15 s;
la D puede bajar algo más.
Para acercarse a 10 s harían falta además B o C. F, si las congelaciones de
~3 s molestan en el uso real.

## Fire TV Stick tras las palancas A y D — línea base de la fase 3 (2026-10-12)

Decisión de Víctor sobre la tabla anterior: aplicar la **A** y la **D**, solo
en el runtime nativo y con tests. No aplicar la B, la C, la E ni la F por
ahora. Aceptar el resultado si queda por debajo de ~15 s o si las palancas
no ahorran más de 1 s.

> Resultado con la A: 15,2 s de mediana (era 55,7 s al empezar la fase y
> 17,2 s tras las mitigaciones 1 y 4). La **línea base definitiva** es la
> medición posterior a la revisión final: **15,0 s** (sección siguiente).
>
> **Sobre la aceptación:** la A ahorró 2,0 s, más de 1 s, así que la segunda
> condición de Víctor («las palancas no ahorran más de 1 s») **no se cumple**.
> La aceptación se apoya solo en leer 15,0–15,2 s como «por debajo de ~15 s».
> Víctor confirmó esa lectura el 2026-10-12 (ver la sección siguiente).

### Palanca A: canales adelantados mientras se comprueba la cuenta

En el runtime nativo, la sesión de ruta de Xtream envía
`XTREAM_PREFETCH_LIVE_CATALOGUE` al abrir Live, Películas o Series de una
fuente. Lo hace **solo para esa fuente** y antes de comprobar su cuenta.
`NativeDataService` lanza entonces las tres peticiones de categorías y
`get_live_streams`. Cuando la importación pide exactamente esas peticiones,
recibe la respuesta adelantada, una sola vez y dentro de 2 minutos; si el
adelanto falló, pide de nuevo. Películas y series no se adelantan.

El flujo de importación no cambia, incluido el de cuenta caducada, que sigue
decidiéndose con `get_account_info`. Escritorio y PWA nunca envían el comando.

Commits:

- `1c6882c8c`: primera versión, que adelantaba con cada `get_account_info`.
- `e3c37cf8b`: la revisión final detectó que así se adelantaba para todas las
  fuentes del dashboard, y este commit lo corrige.

### Palanca D: caché de código del WebView — investigada, sin arreglo aplicado

- El WebView sí crea entradas en `cache/WebView/Default/HTTP Cache/Code Cache/js`
  para los scripts de `http://localhost` (`main-*.js`, `polyfills-*.js`,
  chunks).
- **Todas ocupan 181–184 bytes**, incluso tras decenas de arranques con el
  mismo build: son solo el marcador de «script visto», nunca el código
  compilado.
- **Conclusión: en cada arranque en frío el WebView parsea y compila desde
  cero todo el JS de la app.** Es la mayor parte de los ~3 s de «(program)»
  del perfil.
- Causa probable: las respuestas que sirve Capacitor (`WebViewLocalServer`,
  peticiones interceptadas) no se validan para la caché de código de
  Chromium.
- No hay un arreglo pequeño y seguro, así que no se ha tocado nada. Queda como
  palanca pendiente (D2, abajo).

### Resultados (3 arranques en frío)

| Ronda       | Poder elegir canal |    PSS app | PSS renderer WebView |   Heap JS |
| ----------- | -----------------: | ---------: | -------------------: | --------: |
| 1           |         **15,8 s** |     110 MB |                90 MB |     45 MB |
| 2           |         **14,9 s** |     170 MB |                91 MB |     45 MB |
| 3           |         **15,2 s** |     157 MB |                93 MB |     45 MB |
| **Mediana** |         **15,2 s** | **157 MB** |            **91 MB** | **45 MB** |

- Ningún cierre. App + renderer ≈ 248 MB de mediana, sin cambio relevante
  frente a las mediciones anteriores.
- Resultados en bruto: `dist/performance/android-stick/2026-10-12T07-01-02-355Z.json`.

Cronología de la ronda 3, la mediana (segundos desde `Start proc`):

| Desde | Hasta | Qué ocurre                                                                     |
| ----: | ----: | ------------------------------------------------------------------------------ |
|     0 |  10,0 | Arranque de la app hasta la primera petición                                   |
|  10,0 |  10,9 | `get_account_info`; a la vez arrancan las categorías y los canales adelantados |
|  11,3 |  12,5 | La importación recoge las categorías (una ya estaba lista: 3 ms)               |
|  12,6 |  13,7 | La importación recoge los canales en directo                                   |
|  13,7 |  15,2 | Se quita el overlay de Live y se pinta la lista                                |

En el Stick, cinco peticiones en paralelo compiten por la red y por el puente
nativo, así que el adelanto no se solapa del todo: ahorra 2,0 s, no los ~3,5 s
estimados.

### Tirones al recorrer canales mientras se importan películas y series

Mismo método que en la medición anterior.

| Ronda | Teclas | Tecla atendida (mediana / p90 / máx.) | Teclas > 250 ms | Long tasks > 500 ms | Mayor hueco sin fotograma |
| ----- | -----: | ------------------------------------: | --------------: | ------------------: | ------------------------: |
| 1     |     84 |                      36 / 85 / 537 ms |               6 |                   2 |                 **2,7 s** |
| 2     |     70 |                     38 / 120 / 357 ms |               1 |                   2 |                 **2,8 s** |
| 3     |     82 |                     36 / 147 / 433 ms |               3 |                   2 |                 **3,1 s** |

Igual que antes: respuesta fluida casi todo el rato, y **dos congelaciones por
arranque**, la mayor de 2,7–3,1 s, al llegar películas y series.

### Pendiente (documentado, no aplicado)

| #   | Palanca                                                                                                                                                                     | Efecto estimado                                                      | Coste                      | Cuándo                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------- |
| B   | Sacar los reproductores del camino de Live (`@defer` de `app-web-player-view` e imports por puntos de entrada secundarios)                                                  | −0,5 a −1,5 s                                                        | M                          | Solo con OK de Víctor (afecta a todos los runtimes)                 |
| C   | Quitar Video.js, ArtPlayer y Shaka del build `android` (`fileReplacements`)                                                                                                 | −0,5 a −1 s y ~1,8 MB menos de JS                                    | M                          | **Fase 6** (Tasks 6.2/6.3)                                          |
| D2  | Conseguir caché de código para el JS de la app: por ejemplo, otra forma de servir los assets que Chromium sí cachee, o _compile hints_ de V8 para compilar en segundo plano | Puede ser la mayor parte de los ~3 s de compilación en cada arranque | M (investigar + prototipo) | Cuando Víctor lo pida; candidata natural de la fase 6               |
| E   | Salida ES2022 y/o quitar zone.js                                                                                                                                            | −0,5 a −1 s                                                          | M–L                        | Solo con OK de Víctor                                               |
| F   | Repartir la normalización de películas y series en trozos que cedan el hilo principal                                                                                       | Quita las congelaciones de ~3 s; no cambia los 15 s                  | M                          | **Si las congelaciones molestan en el uso real**                    |
| 2   | Catálogo por `fetch` del WebView (de la primera tabla)                                                                                                                      | Catálogo completo ~12 s antes; acorta el periodo de congelaciones    | M                          | Solo con OK expreso de Víctor (choca con la regla de CapacitorHttp) |

## Línea base de la Fire TV tras la revisión final de la fase 3 — 2026-10-12

Cambios de la revisión final que afectan al Stick:

- **Adelanto solo para la fuente abierta** (commit `e3c37cf8b`).
- **Redirecciones entre `http` y `https`** (commit `f75c64da6`): Android no las
  sigue por debajo de CapacitorHttp; comprobado en el Stick, devuelve `302` sin
  seguirlo. Ahora el transporte nativo sigue el `Location`, hasta 5 saltos, en
  vez de dar «The provider answer is not JSON».

> **Línea base de la Fire TV: 15,0 s de mediana** desde que arranca la app
> hasta poder elegir un canal en directo. Dentro del límite de 20 s y ~5 s por
> encima del objetivo de 10 s. Sin cierres por memoria.
>
> **Aceptada por Víctor el 2026-10-12** como línea base de la Fire TV. Es la
> referencia para comparar en las fases siguientes (la 6 repite esta
> medición con `node tools/android/stick-startup.mjs 3`).

| Ronda       | `am start` | Poder elegir canal |    PSS app | PSS renderer | Mayor hueco sin fotograma | Teclas > 250 ms |
| ----------- | ---------: | -----------------: | ---------: | -----------: | ------------------------: | --------------: |
| 1           |      5,5 s |         **17,5 s** |     156 MB |        93 MB |                     3,3 s |          1 / 91 |
| 2           |      3,9 s |         **15,0 s** |     163 MB |        92 MB |                     3,2 s |          4 / 83 |
| 3           |      4,2 s |         **13,6 s** |     153 MB |        90 MB |                     3,7 s |          1 / 77 |
| **Mediana** |  **4,2 s** |         **15,0 s** | **156 MB** |    **92 MB** |                 **3,3 s** |               — |

- Con el adelanto en su sitio, la importación recoge las categorías en ~25 ms
  y los canales en 6 ms en las rondas 1 y 3. En la ronda 2 el adelanto aún
  estaba en curso, y los canales tardaron 2,3 s.
- Lo que queda es casi todo arranque de la app: 11,0–14,3 s hasta la primera
  petición. La ronda 1 fue más lenta desde el primer fotograma de Android
  (`am start` 5,5 s).
- Se mantienen las dos congelaciones por arranque mientras se importan
  películas y series, ahora de 3,2–3,7 s (palanca F).
- Medido con una sola fuente Xtream, porque es la única configurada en el
  Stick.
- Resultados en bruto: `dist/performance/android-stick/2026-10-12T07-46-38-775Z.json`.

### Pendiente tras la línea base

Detalle y estimaciones en la tabla «Pendiente» de la sección anterior.

| #   | Palanca                                                                       | Cuándo                                                              |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| B   | Sacar los reproductores del camino de Live                                    | Solo con OK de Víctor (afecta a todos los runtimes)                 |
| C   | Quitar Video.js, ArtPlayer y Shaka del build `android`                        | **Fase 6** (Tasks 6.2/6.3)                                          |
| D2  | Conseguir caché de código para el JS de la app                                | Cuando Víctor lo pida; candidata natural de la fase 6               |
| E   | Salida ES2022 y/o quitar zone.js                                              | Solo con OK de Víctor                                               |
| F   | Repartir la normalización de películas y series para quitar las congelaciones | No: Víctor no las nota en el uso real (2026-10-12)                  |
| 2   | Catálogo por `fetch` del WebView                                              | Solo con OK expreso de Víctor (choca con la regla de CapacitorHttp) |

## Prueba de Víctor en la Fire TV (fase 3) — 2026-10-12

**Fase 3 confirmada por Víctor en el Stick:** un canal en directo y una
película se ven y se oyen bien, la carga es rápida, y las congelaciones de la
palanca F no se notan en el uso real (F queda sin aplicar).

### Mando: el foco no sale de la barra superior — punto de partida de la Task 5.2

Solo con el mando (D-pad):

- El foco **se queda en la barra superior y en el menú lateral izquierdo**.
- **No llega** a las categorías ni a las listas de canales, películas y series.

Es lo esperado antes de la fase 5: todavía no hay navegación espacial (spec
§6.4). Es el punto de partida de la **Task 5.2** (navegación espacial con el
D-pad). Al cerrarla, el mando tiene que llegar a la lista de categorías y a las
listas de canales, películas y series, y moverse por ellas.

### Fluidez al navegar — pendiente de medir (fase 4 o 5)

- La interfaz **se nota algo lenta y poco fluida al navegar**.
- Pudo influir que `chrome://inspect` estaba abierto con el _screencast_, que
  cuesta CPU en el Stick.
- **Pendiente:** medir la fluidez sin inspector abierto (fotogramas por segundo
  o tareas largas mientras se navega), con la importación ya terminada, y
  proponer causas y soluciones con su coste en la fase que corresponda (Task
  5.5 si son estilos o foco, fase 6 si es peso de JS o del render). Sin actuar
  hasta entonces.

## Fluidez de la interfaz sin inspector (fase 4) — 2026-10-12

### Condiciones

- APK debug de la fase 4 en el Fire TV Stick, sin `chrome://inspect` ni
  _screencast_. El script se conecta por DevTools solo para lanzar los
  escenarios y leer los resultados (`Runtime.evaluate`, sin capturas).
- 75 s después de abrir la app, con la importación de películas y series ya
  terminada. Ningún vídeo reproduciéndose.
- En cada escenario: `requestAnimationFrame` para contar fotogramas, y
  `PerformanceObserver('longtask')` para las tareas de más de 50 ms del hilo
  principal. 3 rondas.
- «Respuesta a la tecla»: desde el `keydown` hasta el segundo fotograma
  posterior, el primero que puede mostrar el cambio. Las teclas son reales
  (`adb shell input keyevent`), separadas 300 ms.

### Resultados (mediana de 3 rondas)

| Escenario                                                  |      fps | Fotogramas > 100 ms | Hueco más largo | Tareas largas (máx.) | Respuesta a la tecla (mediana / p90) |
| ---------------------------------------------------------- | -------: | ------------------: | --------------: | -------------------: | -----------------------------------: |
| Menú lateral con el D-pad (20 teclas)                      |     49,1 |                  35 |          217 ms |     35 (máx. 213 ms) |                     **179 / 199 ms** |
| Lista de canales: scroll de 40 filas abajo y arriba (CINE) | **31,7** |                  24 |          184 ms |     32 (máx. 132 ms) |                                    — |
| Cambiar de categoría en Directo (12 seguidas, cada 700 ms) | **22,4** |                  16 |      **401 ms** |     16 (máx. 407 ms) |                                    — |
| Cambiar de sección (Películas → Series → Directo, ×2)      |     30,2 |                   8 |      **951 ms** |     16 (máx. 832 ms) |                                    — |
| Rejilla de películas: scroll de 30 pasos                   |     53,4 |                   1 |          167 ms |      2 (máx. 175 ms) |                                    — |

En la ronda 1 la lista de canales tuvo además una pausa de 1,7 s (la primera
vez que se abrió la categoría).

### Qué significa

- **La rejilla de películas va fluida.** El problema no es el WebView en
  general.
- **Cada pulsación del D-pad genera una tarea larga de ~140–200 ms.** La
  respuesta de ~180 ms se nota: es la sensación de «algo lenta».
- **La lista de canales con «ahora / después»** se queda en ~30 fps al
  desplazarse, y **cambiar de categoría o de sección** congela la interfaz
  0,4–1 s cada vez.

### Causas probables (sin perfilar todavía) y soluciones

| #   | Causa probable                                                                                                                          | Solución                                                                                                                                                                        | Coste | Fase                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------------------------- |
| U1  | Cada `keydown` dispara la detección de cambios de toda la app (zone.js), con muchos componentes vivos y manejadores de teclado globales | Primero un perfil de CPU de una pulsación para confirmarlo. Después: sacar los manejadores de teclado de la zona y `OnPush` donde falte; a medio plazo, sin zone.js (palanca E) | M–L   | 5.2 (perfil), fase 6       |
| U2  | Efectos caros de GPU en el Stick: 34 usos de `backdrop-filter` (paneles «de cristal»), sombras y transiciones                           | En el runtime nativo, sustituir el desenfoque por fondos opacos y acortar o quitar transiciones (bajo una clase del runtime nativo, sin rediseñar)                              | S     | **5.5**                    |
| U3  | Filas de canales caras: logo, barra de progreso EPG y menú contextual en cada fila; el scroll virtual crea y destruye filas a cada paso | Logos con tamaño fijo y `decoding="async"`, menos trabajo por fila, `templateCacheSize` > 0                                                                                     | S–M   | 5.5 (estilos) / 6 (render) |
| U4  | Al cambiar de categoría o sección se crea de golpe la lista o la rejilla y su EPG en una sola tarea                                     | Pintar primero lo visible y diferir el resto (`@defer`, trocear la carga de EPG)                                                                                                | M     | fase 6                     |

- Ninguna se aplica ahora. Se miden de nuevo con este mismo método tras la Task
  5.2 (el polyfill de navegación espacial añade trabajo en cada tecla) y en la
  fase 6.

## Reproducción en el Stick (fase 4, Task 4.5) — 2026-10-12

APK debug de la fase 4 en el Fire TV Stick (AFTSSS, Fire OS 7 / Android 9,
WebView 138). Reproductor HTML5: hls.js para HLS, `<video>` nativo para VOD.
Tiempos desde el clic hasta el primer fotograma (`[perf] first-frame`). Medido
por DevTools sin inspector ni _screencast_.

### Códecs que admite MSE (`[codecs]`)

```json
{
    "avc": true,
    "hevc": true,
    "vp9": true,
    "aac": true,
    "ac3": false,
    "eac3": false
}
```

El hardware del Stick decodifica AC-3 y E-AC-3, pero el WebView no los admite
en MSE ni tiene decodificador para `<video>` (spec §6.2).

### Directo (todo HLS en este proveedor)

| Canal                       | Momento      |    Primera imagen | Resultado                                                             |
| --------------------------- | ------------ | ----------------: | --------------------------------------------------------------------- |
| GOL play FULLHD             | elegir canal |         **7,7 s** | 1080p, con audio                                                      |
| GOL PLAY SD                 | zapping      |             5,3 s | con audio                                                             |
| GOL PLAY HD                 | zapping      |             5,8 s | con audio                                                             |
| Real Madrid TV              | zapping      |                 — | sin imagen en 10 s, sin aviso                                         |
| La 1 HD / La 1 SD / La 2 HD | zapping      | 5,9 / 5,1 / 5,9 s | con audio                                                             |
| La 1 FHD / La 2 FHD         | zapping      |                 — | **no se reproducen**: `media-decode-error`, hls.js `fragParsingError` |

- Mediana de zapping en los canales que funcionan: **5,8 s** (límite 5 s,
  objetivo 3 s). Elegir canal: 7,7 s (una muestra; límite 5 s).
- Los canales FHD llevan **H.264 + 3 pistas E-AC-3 y ninguna AAC** (tabla PMT
  del primer segmento). Sin E-AC-3 en MSE, hls.js no puede montarlos.
- Los segmentos HLS pesan ~5,3 MB: la primera imagen espera a que llegue un
  segmento completo.

### Películas (`<video>` nativo)

| Película | Contenedor | Primera imagen | Resultado                                       |
| -------- | ---------- | -------------: | ----------------------------------------------- |
| 1080p    | mp4        |      **9,4 s** | con audio                                       |
| 1080p    | mkv        |          3,6 s | **sin sonido** (H.264 + AC-3, 0 bytes de audio) |
| 720p     | mkv        |          5,2 s | **sin sonido**                                  |

### «Abrir en VLC»

- El panel de error ofrece «Abrir en VLC» y lanza VLC directamente (es el único
  reproductor real; la actividad de relleno de Fire OS se descarta).
- VLC se cierra a los 2–4 s con los canales FHD: el proveedor responde a los
  clientes que no son navegador con una redirección mal formada,
  `Location: //https://servidor/…`, y VLC (igual que la pila HTTP de Java) busca
  un servidor llamado «https». El WebView recibe una redirección correcta.

### Pendiente (tras la decisión sobre ExoPlayer)

Episodio de serie, retomar una posición guardada, 30 minutos seguidos.

**Criterio de la Task 4.5: no aprobada.** Hay canales que no se reproducen
(E-AC-3), películas mkv sin sonido (AC-3) y tiempos por encima de 5 s. Propuesta
en `docs/android-exoplayer-proposal.md`.

## Seguimiento de la fase 4 — 2026-10-12

### «Abrir en VLC» tras resolver la redirección (commit `0079e7e93`)

- VLC ya reproduce los canales FHD (La 1 FHD): imagen correcta y audio
  (VLC decodifica el E-AC-3 a PCM; su `AudioPlayer` en estado `started`).
- Referencia de tiempos (no es la línea base; incluye arrancar otra app):
  desde la llamada de IPTVnator hasta que la sesión de VLC pasa a PLAYING,
  **10,1–12,0 s al elegir canal** con VLC cerrado y **~11 s en zapping** (en
  la mitad de los cambios VLC no publicó un estado nuevo y no se pudo medir).
- La línea base para Media3 es el reproductor HTML5: 7,7 s al elegir canal y
  5,1–5,9 s en zapping (sección «Reproducción en el Stick»).

### Restauración en el Stick (con copia exportada antes)

- Copia exportada: 2.921 bytes, con 3 posiciones y 10 recientes (antes del
  arreglo la copia de la PWA salía vacía: 630 bytes).
- Restaurar esa copia: «0 importadas, 1 combinada, 0 fallidas». Favoritos,
  recientes y posiciones, igual que antes (0 / 10 / 3). No se pierde nada.

### Dónde va el tiempo al navegar (traza de DevTools, hilo principal)

| Acción                               |   Total | JavaScript | Estilos (`UpdateLayoutTree`) | Pintado y capas (`Paint` + `Layerize` + `Commit`) |
| ------------------------------------ | ------: | ---------: | ---------------------------: | ------------------------------------------------: |
| Una pulsación del D-pad (media de 6) | ~230 ms |    ~100 ms |                       ~73 ms |                                            ~51 ms |
| Un cambio de categoría (media de 6)  | ~260 ms |     ~55 ms |                       ~37 ms |                                       **~128 ms** |

- **D-pad:** casi la mitad es JavaScript que corre en cada `keydown`
  (manejadores de teclado y detección de cambios de toda la app) y un tercio
  es recalcular estilos de un DOM grande. Confirma U1 y apunta a selectores
  caros.
- **Cambio de categoría:** domina el pintado y la composición de capas, lo
  que apunta a U2 (desenfoques `backdrop-filter`, sombras, capas).
