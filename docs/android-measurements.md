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
| Script                   | `.superpowers/sdd/PLAN-ANDROID/perf/perf-baseline.mjs` (fuera del código de la app; no guarda credenciales)                           |

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
