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
