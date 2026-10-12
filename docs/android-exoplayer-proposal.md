# Propuesta: reproductor nativo Media3 (ExoPlayer) para Fire TV

Estado: **propuesta, sin implementar.** Requiere el OK de Víctor (CLAUDE.md,
«Reproductor»; plan, Task 4.5, paso 2). Fecha: 2026-10-12, fase 4.

## 1. Qué falla y la evidencia

Medido en el Fire TV Stick (AFTSSS, Fire OS 7 / Android 9, WebView 138) con la
fuente Xtream real. Detalle en `docs/android-measurements.md`, sección
«Reproducción en el Stick (fase 4, Task 4.5)».

| Problema                                              | Evidencia                                                                                                      | Por qué el reproductor HTML5 no puede                                        |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Canales FHD no se reproducen** (La 1 FHD, La 2 FHD) | `media-decode-error`, hls.js `fragParsingError`. PMT del primer segmento: H.264 + 3 pistas E-AC-3, ninguna AAC | El WebView no admite E-AC-3 en MSE (`[codecs]`: `eac3: false`)               |
| **Películas mkv sin sonido**                          | Se ven, pero 0 bytes de audio decodificados. Cabecera Matroska: `V_MPEG4/ISO/AVC` + `A_AC3`                    | El WebView no tiene decodificador AC-3 (`ac3: false`)                        |
| **Primera imagen lenta**                              | Zapping 5,1–5,9 s (mediana 5,8 s), elegir canal 7,7 s, película mp4 9,4 s. Límite 5 s, objetivo 3 s            | hls.js espera un segmento completo (~5,3 MB) y lo remultiplexa en JavaScript |
| **«Abrir en VLC» no sirve con este proveedor**        | VLC se cierra a los 2–4 s: «cannot resolve https». El proveedor responde `302 Location: //https://servidor/…`  | Ver §6                                                                       |

El problema de códecs **no tiene arreglo dentro del WebView**: no hay forma de
añadirle un decodificador AC-3/E-AC-3. Un decodificador en WebAssembly sería
pesado y gastaría CPU que el Stick no tiene. Los tiempos sí podrían mejorar algo
ajustando hls.js (§7), pero sin llegar al objetivo de 3 s.

## 2. AC-3 / E-AC-3 en Fire TV con MediaCodec

Comprobado en el Stick (`/vendor/etc/media_codecs_dolby_audio.xml`):

- `OMX.dolby.ac3.decoder` (`audio/ac3`)
- `OMX.dolby.eac3.decoder` (`audio/eac3`)

Media3 elige solo entre dos caminos:

1. **Passthrough.** Si la tele o la barra de sonido conectada por HDMI anuncia
   AC-3/E-AC-3 (`AudioCapabilities`), Media3 envía el audio sin decodificar y
   lo decodifica el receptor. Es lo que hacen las apps de Amazon. Soporta
   Atmos sobre E-AC-3 si el receptor lo admite.
2. **Decodificación en el Stick.** Si el receptor solo admite PCM, Media3 usa
   `OMX.dolby.*` por MediaCodec y envía PCM estéreo o multicanal. No hace falta
   la extensión FFmpeg.

En ambos casos el vídeo H.264/HEVC va por el decodificador hardware de
MediaTek, sin remultiplexar en JavaScript.

**A comprobar en el prototipo:** qué camino toma con la tele de Víctor y que el
audio suena en los dos (se puede forzar PCM desactivando el passthrough en los
ajustes de audio de Fire OS).

## 3. Tiempos esperados

Estimaciones, **a confirmar con el prototipo** usando el mismo método de
medición (clic → primer fotograma).

| Recorrido          |          HTML5 hoy |   Media3 esperado | Por qué                                                                                                                                              |
| ------------------ | -----------------: | ----------------: | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Elegir canal (HLS) |              7,7 s |           2–3,5 s | El extractor TS de Media3 empieza en cuanto hay `bufferForPlaybackMs` de medio (2,5 s por defecto, ajustable a ~1 s), sin esperar al segmento entero |
| Zapping (HLS)      |              5,8 s |           1,5–3 s | Igual, reutilizando el mismo `ExoPlayer` y la conexión HTTP                                                                                          |
| Película mp4       |              9,4 s |             2–5 s | Depende de dónde esté el índice (`moov`) del archivo; Media3 lo pide por rangos en paralelo                                                          |
| Película mkv       | 3,6 s (sin sonido) | 2–4 s, con sonido | AC-3 por passthrough o `OMX.dolby`                                                                                                                   |

Un primer fotograma ≤ 3 s en zapping es razonable con Media3 en un Stick de 3.ª
generación, pero el segmento de 5,3 MB del proveedor pone un mínimo: con Wi-Fi
lenta, el primer fotograma tarda lo que tarde en llegar ~1 s de vídeo.

## 4. Diseño propuesto

### 4.1 Interfaz común `NativePlayer` (TypeScript)

En `apps/web/src/app/services/native-player.ts`, sin nombres de plataforma,
igual que `native-external-player.ts`:

```ts
export interface NativePlayerItem {
    url: string;
    title?: string;
    isLive: boolean;
    startPositionMs?: number;
    headers?: Record<string, string>;
}

export interface NativePlayerRequest extends NativePlayerItem {
    /** Directo: la lista visible, para ChannelUp/Down y D-pad arriba/abajo. */
    channels?: readonly NativePlayerItem[];
    channelIndex?: number;
}

export type NativePlayerEvent =
    | { type: 'first-frame'; ms: number }
    | { type: 'position'; positionMs: number; durationMs: number | null }
    | { type: 'channel-changed'; channelIndex: number }
    | { type: 'ended' }
    | { type: 'error'; code: string; message: string }
    | { type: 'closed'; positionMs: number };

export interface NativePlayer {
    play(request: NativePlayerRequest): Promise<void>;
    stop(): Promise<void>;
    events(): Observable<NativePlayerEvent>;
}
```

- `RuntimeCapabilitiesService.supportsNativePlayer` (verdadero en el runtime
  nativo cuando el plugin existe).
- Nuevo valor `VideoPlayer.NativePlayer`, por defecto en el runtime nativo. HTML5
  queda como alternativa en Ajustes y como respaldo si el plugin falla.
- Los eventos `position` y `closed` alimentan el mismo guardado de posiciones y
  recientes que hoy usa el reproductor HTML5; `first-frame` produce la misma
  línea `[perf] first-frame` para medir.
- iOS, en el futuro: el mismo plugin con `AVPlayerViewController`.

### 4.2 Implementación Android (plugin Capacitor `NativePlayer`)

- **Opción recomendada, una actividad a pantalla completa:**
  `NativePlayerActivity` con `PlayerView` de Media3, lanzada por el plugin.
    - Controles nativos de Media3, que ya funcionan con el D-pad.
    - Atrás cierra el reproductor y vuelve a la lista.
    - ChannelUp/Down y D-pad arriba/abajo cambian de canal dentro de la propia
      actividad, con la lista recibida en `channels`.
    - Es la integración más corta y estable: superficie de vídeo hardware y nada
      de sincronizar capas con el WebView.
- **Alternativa no recomendada, vídeo nativo bajo el WebView** (`SurfaceView`
  detrás de un WebView transparente). Mantendría los controles Angular y el
  panel de canales, pero obliga a sincronizar posición, tamaño, foco y pantalla
  completa entre dos capas. Riesgo alto y mucho más código.
- Fuentes: `HlsMediaSource` para `.m3u8`, `ProgressiveMediaSource` para
  mp4/mkv/ts, con `DefaultHttpDataSource` (ver §6 para la redirección).
- Ajustes de arranque: `DefaultLoadControl` con `bufferForPlaybackMs` ~1000 y
  `bufferForPlaybackAfterRebufferMs` ~2000. Se ajustan con las mediciones.

### 4.3 Qué cambia en la interfaz

En Android, al elegir canal, película o episodio se abre el reproductor a
pantalla completa con controles nativos de Media3, en lugar del reproductor
HTML5 integrado en el panel. Es el comportamiento habitual en las apps de TV,
pero **los controles no serán los de IPTVnator**: «ahora / después» y la lista
de canales no se ven mientras se reproduce. Si Víctor quiere mantenerlos, la
alternativa es la de la capa nativa bajo el WebView, con el coste y el riesgo
indicados.

## 5. Coste

| Pieza                                                                                                                       | Trabajo                                                                   | Tamaño                                                            |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Dependencias `androidx.media3:media3-exoplayer`, `media3-exoplayer-hls`, `media3-ui` (última estable, versión exacta)       | —                                                                         | **+1,5–2,5 MB** de APK tras R8 (estimación; se mide en la fase 6) |
| Plugin `NativePlayer` + `NativePlayerActivity` (Java)                                                                       | ~350–450 líneas, tests JVM de la lógica pura (lista de canales, posición) | M                                                                 |
| Interfaz TS, capacidad, `VideoPlayer.NativePlayer`, conexión con guardado de posiciones/recientes y con los tres recorridos | ~250 líneas + tests                                                       | M                                                                 |
| Prototipo y medición en el Stick (canal FHD, mkv AC-3, zapping, 30 min, passthrough vs PCM)                                 | —                                                                         | S–M                                                               |
| **Total**                                                                                                                   | **unas 5–6 tareas** del plan, en una fase propia (4b) antes de la 5       | **M–L**                                                           |

## 6. Redirección rota del proveedor (`//https://`)

Comprobado en el Stick con el canal La 1 FHD, sin seguir redirecciones:

| User-Agent enviado         | Respuesta                                                |
| -------------------------- | -------------------------------------------------------- |
| El del WebView (navegador) | `302` a `http://<ip>:<puerto>/…/hls/….m3u8?…` (correcta) |
| `VLC/3.0.18 LibVLC/3.0.18` | `302 Location: //https://<host>/…` (mal formada)         |
| `ExoPlayerLib/…`           | `302 Location: //https://<host>/…` (mal formada)         |
| Ninguno (Java por defecto) | `302 Location: //https://<host>/…` (mal formada)         |

`//https://host/…` es una URL relativa al esquema cuyo «servidor» es `https`.
Java, VLC y Media3 la resuelven literalmente y fallan. El WebView no la ve
porque recibe otra respuesta.

- **Para ExoPlayer:** `DefaultHttpDataSource.Factory` con el User-Agent del
  WebView (`WebSettings.getDefaultUserAgent`) y
  `setAllowCrossProtocolRedirects(true)`. Además, como defensa, un
  `ResolvingDataSource` que normalice un `Location` del tipo `//http(s)://…` a
  `http(s)://…` antes de seguirlo. Coste S, dentro de la fase de Media3.
- **Para VLC (independiente de ExoPlayer):** VLC no permite fijar el User-Agent
  desde el intent. El plugin `ExternalPlayer` resolvería antes la redirección por
  su cuenta: una petición sin seguir redirecciones con el User-Agent del WebView
  y normalización de `//https://`, hasta 5 saltos, y entregaría a VLC la URL
  final. Riesgo: esa URL lleva un token que puede caducar o estar ligado a la
  IP; se resuelve justo antes de abrir VLC. Coste S, con tests JVM de la
  normalización.
- **Riesgo general:** depender del User-Agent del navegador es un acuerdo
  implícito con este proveedor. Puede cambiar sin aviso; la normalización de
  `Location` cubre parte de ese riesgo.

## 7. Sin ExoPlayer: qué se podría mejorar en HTML5

Solo afecta a los tiempos, no a los códecs:

- hls.js con cargador `fetch` progresivo, `startFragPrefetch` y un buffer
  inicial menor: quizá −1 s. Coste S.
- Ni AC-3 ni E-AC-3 tienen solución: los canales FHD seguirían sin reproducirse
  y las mkv seguirían sin sonido. «Abrir en VLC» (con el arreglo de §6) sería la
  única salida para ese contenido.

## 8. Riesgos

- **Passthrough:** con algunos receptores HDMI, el passthrough de E-AC-3 se
  anuncia pero falla (silencio). Mitigación: opción «Forzar audio PCM» en los
  ajustes del reproductor nativo.
- **Memoria:** el WebView sigue vivo detrás de la actividad. Media3 añade
  ~40–80 MB con un 1080p. El Stick tiene ~200 MB libres y la app ronda 250 MB
  PSS entre proceso y renderer. Hay que medir que no haya cierres por memoria
  en 30 minutos y al volver a la lista.
- **WebView en segundo plano:** mientras se reproduce, el JavaScript queda
  limitado. Guardar posiciones y recientes debe hacerse con los eventos del
  plugin al volver, no con temporizadores del WebView.
- **Interfaz distinta** a la de escritorio mientras se reproduce (§4.3).
- **Subtítulos y pistas de audio:** Media3 los gestiona, pero hay que exponer la
  elección de pista de audio (los canales FHD traen tres).
- **Tamaño de la APK:** +1,5–2,5 MB, contra el criterio de «ligera». Se
  compensa en parte con la fase 6, que quita Video.js, ArtPlayer y Shaka del
  build Android.
- **Mantenimiento:** una segunda vía de reproducción solo para Android (y
  después iOS).

## 9. Recomendación

1. Aprobar Media3 con la **actividad a pantalla completa** (§4.2) como fase 4b,
   antes de la fase 5. La fase 5 (mando) depende de cómo se reproduzca.
2. Empezar por un **prototipo medido**: canal FHD con E-AC-3, una mkv con AC-3,
   zapping de 3 canales y 30 minutos. Si no mejora los tiempos de §3, se
   replantea antes de integrarlo en los tres recorridos.
3. Arreglar ya la **redirección para VLC** (§6, coste S): sirve con o sin
   ExoPlayer y es la salida para el contenido AC-3 mientras tanto.

Nada de esto se implementa sin el OK de Víctor.
