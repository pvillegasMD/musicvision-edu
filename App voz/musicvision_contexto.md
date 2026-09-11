# App voz — Contexto del Proyecto

## Descripción general
App web de uso propio para práctica de canto. El usuario (cantante o profesor) sube
dos archivos — un **WAV** (pista de audio real que se reproduce) y un **MIDI** (define
las notas que debería cantar, solo como dato para dibujar un piano roll, no suena) — y
la app muestra el piano roll avanzando en sincronía con la reproducción. En etapas
futuras, mientras el usuario canta con el micrófono, una línea de pitch en tiempo real
se superpone al piano roll y las notas cambian de color según qué tan afinado esté.

A diferencia de HarmonySync y Metalófono, esta app **no es un único archivo HTML** —
es una desviación aprobada de esa convención (ver spec de diseño) para poder testear
con Node la lógica pura (parser MIDI, matemática de coordenadas) sin depender del
navegador. Sigue sin build, sin npm, sin librerías externas — abre con doble clic.

## Documentos de referencia
- `contexto-proyecto-piano-roll-canto.md` — brief original del proyecto (pre-diseño;
  desactualizado en las librerías que sugiere — @tonejs/midi, Pitchy, ml5.js — todas
  descartadas en favor de implementaciones propias, ver más abajo).
- `docs/superpowers/specs/2026-09-09-app-voz-piano-roll-canto-design.md` — spec de
  diseño completo (arquitectura, sistema de color del piano roll, extensibilidad
  futura para multi-cantante/entrenador de vocalización/mobile).
- `docs/superpowers/plans/2026-09-09-app-voz-etapa1-reproductor-piano-roll.md` — plan
  de implementación de la Etapa 1.
- `docs/superpowers/plans/2026-09-10-app-voz-etapa2-microfono.md` — plan de
  implementación de la Etapa 2.
- `docs/superpowers/plans/2026-09-11-app-voz-etapa3-deteccion-pitch.md` — plan de
  implementación de la Etapa 3.

## Estado actual (2026-09-11)
**Etapas 1, 2 y 3 completas e implementadas:** reproductor + piano roll estático,
captura de micrófono con fader y medidor de nivel, y detección de pitch en tiempo
real con lectura de nota en vivo ("Nota detectada: A4 (440.0 Hz, +3 cents)"). Todavía
sin comparar el pitch cantado contra la nota objetivo del MIDI ni colorear el piano
roll — eso es la Etapa 4.

Vive en una rama de git separada, **no mergeada todavía**: rama `worktree-app-voz-etapa1`
(worktree en `.claude/worktrees/app-voz-etapa1`), creada sobre `fix/filenames-in-context-docs`.
Etapa 1: 4 commits + 2 arreglos de su revisión final. Etapa 2: 2 commits
(`audio-level.js` e integración de mic/fader/medidor) + 1 arreglo de su revisión final
(desactivar AGC/reducción de ruido/cancelación de eco del navegador, arreglar una
condición de carrera de doble-activación del botón de mic, mensajes de error en
español más claros). Etapa 3: 3 commits (`pitch-detection.js`, `note-utils.js`,
integración + unificación de los loops de render en uno solo) + 1 arreglo de su
revisión final (filtro de nivel mínimo antes de intentar detectar pitch — sin esto,
un micrófono real mostraba notas fantasma por ruido de fondo/zumbido; y evitar que
`NOTE_NAMES` quede como variable global del navegador). Los 18 tests de Node pasan.

## Archivos
- **`index.html`** — UI (inputs de MIDI/WAV, botón Reproducir, controles de
  micrófono — botón, fader de ganancia, medidor de nivel, lectura de nota detectada —,
  `<canvas id="pianoRoll">`), carga de archivos, reproducción con Web Audio API,
  captura de micrófono, detección de pitch. Un solo `requestAnimationFrame` loop
  (`mainLoop`) maneja todo — piano roll, medidor y pitch — corriendo siempre desde que
  carga la página. Todo el JS de la app vive acá, inline.
- **`midi-parser.js`** — parser MIDI binario puro (sin DOM), `DataView` a mano, sin
  librerías. Expone `parseMidi(buffer) -> {notes: [{pitch, start, duration}], durationSec}`
  (tiempos en segundos). Export dual: `module.exports` en Node, global en navegador.
- **`piano-roll-geometry.js`** — matemática de coordenadas pura: `pitchRange(notes)`,
  `pitchToY(pitch, minPitch, maxPitch, canvasHeight)`, `computeNoteRect(note, view)`.
  Mismo patrón de export dual.
- **`audio-level.js`** — matemática de nivel de audio pura: `computeLevel(byteTimeDomainData) -> {rms, peak}`,
  normalizado 0-1, a partir de los bytes que entrega `AnalyserNode.getByteTimeDomainData()`.
  Mismo patrón de export dual.
- **`pitch-detection.js`** — detección de pitch pura (sin DOM): `detectPitch(buffer, sampleRate, threshold=0.15) -> Hz | null`.
  Algoritmo YIN implementado a mano (función de diferencia, normalización acumulada,
  umbral absoluto, interpolación parabólica). Sin límites de frecuencia mín/máx
  todavía (detecta desde ~43Hz hasta ~22kHz, más allá del rango vocal real). Mismo
  patrón de export dual.
- **`note-utils.js`** — conversión pura de frecuencia a nota: `frequencyToMidi(freq)`,
  `midiToNoteName(midi)`, `describePitch(freq) -> {midi, noteName, cents}`. `midi` usa
  la misma escala que `note.pitch` de `midi-parser.js`, y `cents` es positivo si está
  sobreafinado (agudo) — pensado para que la Etapa 4 compare directo contra
  `state.notes` sin conversión de unidades. Mismo patrón de export dual.
- **`tests/`** — tests de Node (`node --test`, sin instalar nada; ejecutar como
  `node --test tests/*.test.js` desde `App voz/` — `node --test tests/` a secas falla
  en Node 24 por cómo resuelve el argumento de directorio) para los cinco archivos
  puros de arriba, más `tests/fixtures/` con generadores de un MIDI y un WAV de prueba
  (`make-midi-fixture.js`, `make-wav-fixture.js`) y sus salidas ya generadas
  (`sample.mid`, `sample.wav`) — dos notas de 0.5s cada una, usadas tanto en los tests
  automáticos como en la verificación manual en navegador.

## Características implementadas (Etapa 1)
- Carga de WAV y MIDI vía `FileReader` / `File.arrayBuffer()`.
- Parser MIDI propio: soporta formato 0/1, running status, tempo map variable,
  nota-on con velocity 0 tratada como nota-off.
- Reproducción del WAV con Web Audio API (`AudioBufferSourceNode`), reloj maestro
  `AudioContext.currentTime` (sin scheduler lookahead en esta etapa — no aplica
  porque se reproduce un único buffer continuo, no notas discretas programadas).
- Piano roll en Canvas: rectángulos por nota, todos azules, con línea de playhead fija
  y las notas scrolleando de derecha a izquierda en sincronía exacta con la
  reproducción (verificado por píxeles: el desplazamiento medido coincide con
  `Δt × PIXELS_PER_SECOND` con precisión de ~2px).
- Manejo de errores: archivo MIDI o WAV inválido muestra un mensaje de error en
  español y resetea el estado (no deja datos del archivo anterior mostrados como si
  fueran del nuevo).
- `AudioContext.resume()` antes de reproducir, para evitar fallos silenciosos en
  navegadores que crean el contexto suspendido (Firefox/Safari) sin gesto de usuario
  previo — un click de "Reproducir" no garantiza por sí solo que el contexto arranque.
- Reinicio limpio: apretar "Reproducir" mientras ya está sonando detiene el nodo
  anterior y arranca uno nuevo sin overlap de audio ni pérdida de sincronía del piano
  roll (bug de condición de carrera encontrado y arreglado en revisión).

## Características implementadas (Etapa 2)
- Botón "Activar micrófono" → pide permiso (`getUserMedia`) y arma la cadena de audio
  del micrófono. Pide explícitamente `echoCancellation: false, noiseSuppression: false,
  autoGainControl: false` — sin esto, el control automático de ganancia del navegador
  pelea con el fader de la app (el nivel se reajusta solo por su cuenta), y la
  cancelación de eco/reducción de ruido degradarían la señal que va a analizar la
  futura detección de pitch (Etapa 3).
- **Objeto "Voz"** (`createVoz(stream, audioContext)`): arma
  `MediaStreamAudioSourceNode → GainNode → AnalyserNode` y devuelve
  `{stream, source, gainNode, analyser, setGain(valor), getLevel()}`. Vive en
  `state.voces`, un **array** (no una variable suelta) — Etapa 2 solo usa el índice 0,
  pero la estructura ya queda lista para que una etapa futura empuje más Voces (una
  por cantante).
- **Fader de ganancia** (slider 0%–200%): controla el `GainNode`, que está *antes* del
  `AnalyserNode` en la cadena — así, si el medidor muestra que la señal satura, bajar
  el fader desde la app corrige lo que ve el medidor, sin tener que entrar a la
  configuración de sonido del sistema operativo.
- **Medidor de nivel en tiempo real**: barra que sube/baja con el `peak` (0–1) leído
  del `AnalyserNode` cada frame, con tres zonas de color (verde <70%, ámbar 70–90%,
  rojo >90%) para avisar de saturación.
- Botón de mic protegido contra doble-activación: se deshabilita como primer paso del
  handler de click (antes del `await getUserMedia`), no después — apretarlo dos veces
  rápido ya no crea dos Voces.
- Mensajes de error en español según el tipo de falla real (`NotAllowedError` →
  permiso denegado, `NotFoundError` → sin micrófono conectado, API no disponible →
  aviso de que hace falta `https://` o `http://localhost`), en vez de pasar el texto
  crudo en inglés del navegador.

## Características implementadas (Etapa 3)
- **Detección de pitch en tiempo real**: `Voz.getPitch()` (mismo patrón que
  `getLevel()`) lee los datos de tiempo real del `AnalyserNode` y corre YIN sobre
  ellos, cada frame del `mainLoop`. Verificado con precisión sub-0.02% en senos puros
  de 110 a 880Hz, y con más de 15 frecuencias fuera de las probadas en los tests, más
  armónicos.
- **Lectura de nota en vivo**: texto "Nota detectada: A4 (440.0 Hz, +0 cents)" que se
  actualiza cada frame; muestra "—" cuando no hay pitch claro (silencio, ruido, o
  ahora señal por debajo del umbral de nivel mínimo).
- **Filtro de nivel mínimo**: no se intenta detectar pitch si el nivel (`peak` del
  medidor) está por debajo de ~0.02 — sin esto, YIN es completamente ciego al volumen
  (detecta igual de bien una señal a todo volumen que una casi inaudible), y como la
  Etapa 2 desactivó a propósito la reducción de ruido del navegador, un micrófono real
  mostraba notas fantasma por zumbido/ruido de fondo cuando nadie cantaba. Encontrado
  en la revisión final porque la verificación con oscilador sintético (silencio total
  o tono limpio) no podía reproducir el caso real de "ruido de fondo bajito pero
  periódico".
- **Un solo loop de render** (`mainLoop`, reemplaza los `renderLoop`/`micLevelLoop`
  sueltos de las Etapas 1 y 2): corre siempre desde que carga la página, y en cada
  frame actualiza el piano roll, y si hay una Voz activa, el medidor de nivel y la
  lectura de pitch — los tres leen el mismo instante, no relojes independientes
  desincronizados. Esto lo dejaba pedido la revisión final de la Etapa 2, y de yapa
  resolvió el pendiente del "último frame no determinístico" de la Etapa 1 (ahora el
  piano roll siempre se asienta en t=0 después de terminar la reproducción, en vez de
  saltar o congelarse según el timing exacto de `onended`).

## Decisiones técnicas
- **Sin dependencias externas** en ningún archivo, ni siquiera en las utilidades de
  test/fixtures — todo Node built-in (`node:test`, `node:assert`, `fs`, `path`).
- **Forma de nota genérica** `{pitch, start, duration}` (tiempos en segundos, no ticks
  ni ms) — deliberadamente desacoplada de "vino de un archivo MIDI subido", para que
  el futuro entrenador de vocalización (MIDI corto transpuesto en loop) pueda
  alimentar la misma canalización sin tocar el piano roll ni la detección de pitch.
- **Export dual** (`module.exports` + global) en los dos archivos `.js` puros, para
  poder testear con Node y cargar con `<script src>` en el navegador sin build.
- **`state` como objeto global único** en `index.html`
  (`audioContext, audioBuffer, notes, durationSec, sourceNode, playStartTime, voces`)
  — capa de estado mínima, extendida en Etapa 2 solo con el array `voces`.
- **La misma `AudioContext` se comparte** entre la reproducción del WAV (Etapa 1) y la
  captura de mic (Etapa 2). El `AnalyserNode` del mic nunca se conecta a
  `audioContext.destination` — no hay bucle de retroalimentación mic→parlante
  posible mientras se reproduce el WAV.
- **WAV de prueba generado a mano** (sin librerías, header PCM de 44 bytes escrito con
  `Buffer`), con tonos que coinciden en frecuencia y tiempo con las notas del MIDI de
  prueba, para que la verificación manual ("el rectángulo cruza el playhead cuando
  empieza su tono") sea una prueba real y no una sensación.

## Pendientes / decisiones diferidas (no bloquean lo implementado, pero quedan anotadas)
- **Canvas no responsivo** (tamaño fijo 900×240px, sin DPR scaling) — el spec de
  diseño pedía esto desde el día 1 como preparación para mobile, pero el plan de la
  Etapa 1 no lo incluyó (hueco de planificación). Se decidió (2026-09-09) dejarlo para
  la etapa futura de soporte mobile, no es bloqueante ahora.
- Botón "Reproducir" no se deshabilita cuando no hay WAV cargado (el CSS
  `button:disabled` ya existe pero no se usa).
- `pitchRange()` se recalcula en cada frame del render loop en vez de una sola vez al
  cargar el MIDI — barato para un MIDI vocal típico, pero redundante.
- `state.durationSec` (duración del MIDI) se guarda pero nunca se compara contra
  `audioBuffer.duration` — el diseño asume que ambos archivos están alineados, pero un
  par desalineado hoy falla en silencio.
- `SAMPLE_MIDI_BYTES` está duplicado (a propósito) entre el test y el generador de
  fixture — decisión deliberada para que el test no dependa del script generador.
- `play()` ahora es `async` y hace `await audioContext.resume()` sin try/catch — si
  ese `resume()` rechaza, la falla vuelve a ser silenciosa. Caso de baja probabilidad,
  anotado pero no resuelto. (Notar la inconsistencia: el `resume()` del botón de mic
  sí está en un try/catch con mensaje en español — sería fácil alinear `play()` al
  mismo patrón si se retoma este punto.)
- `<h1>App voz — Etapa 1</h1>` quedó desactualizado — dice Etapa 1 pero la app ya va
  por la Etapa 3. Cambio cosmético de una palabra, pendiente hace dos etapas.
- El comentario de `NOTE_COLOR` ("Etapa 1 has no pitch detection yet") también quedó
  viejo — ya hay detección de pitch, solo que todavía no está conectada al color del
  piano roll (eso sigue siendo Etapa 4). Cambio cosmético, se puede hacer junto con el
  del `<h1>`.
- `#micStatus` y `#pitchDisplay` no heredan el estilo de `#status` (quedan con
  tamaño/opacidad de texto normal en vez del estilo tenue de los otros mensajes de
  estado) — ya son tres líneas de estado con dos pesos visuales distintos, vale la
  pena resolverlo en una sola pasada.
- No hay forma de desactivar el micrófono ni manejar que se desconecte el dispositivo
  o se revoque el permiso a mitad de sesión (`track.onended`) — el botón queda
  deshabilitado para siempre tras activarse una vez, y si el mic se cae el medidor
  simplemente se queda en 0 sin explicación, sin manera de recuperarse sin recargar
  la página (lo que hace perder el MIDI/WAV ya cargados).
- `mainLoop()` sigue corriendo siempre mientras la página esté abierta, incluso sin
  archivos cargados ni mic activo — decisión a propósito del plan de la Etapa 3
  (verificado barato: `renderPianoRoll()` con `state.notes` vacío es solo un
  `clearRect` + una línea). Si algo dentro de `mainLoop` llegara a tirar una
  excepción, se corta el único loop de la app entera y la UI se congela sin aviso —
  no hay ningún camino que tire hoy, pero valdría la pena envolver el loop en
  `try {...} finally { requestAnimationFrame(mainLoop) }` antes de que la Etapa 4
  meta más lógica (comparación de nota, cambios de estado) adentro del mismo tick.
- `computeLevel()` en `audio-level.js` no tiene guarda para array vacío (da
  `rms: NaN`) — inconsistente con las guardas que sí tienen `pitchRange`/`pitchToY`
  en `piano-roll-geometry.js`. Riesgo real bajo: `AnalyserNode.getByteTimeDomainData()`
  nunca devuelve un array de largo 0.
- `pitch-detection.js` no tiene límites de frecuencia mín/máx — detecta desde ~43Hz
  hasta ~22kHz, muy por fuera del rango vocal real (~65-1100Hz). Combinado con el
  filtro de nivel ya agregado, achica pero no elimina la ventana de lecturas
  fantasma. Agregar parámetros `minFrequency`/`maxFrequency` que acoten la búsqueda
  de `tau` sería el lugar natural cuando llegue la Etapa 4.
- `describePitch()` en `note-utils.js` no está definida para entradas no positivas
  (`describePitch(0)` da `NaN`/nombres sin sentido) — hoy no es alcanzable porque
  `detectPitch` siempre devuelve `null` o un número finito positivo, pero podría
  volverse alcanzable si una etapa futura (calibración, un generador de secuencias)
  llama `describePitch` desde otro lado que no sea `detectPitch`.
- Los tests de `note-utils.js` (heredados tal cual del plan) nunca afirman un caso de
  `cents` claramente negativo/desafinado grave — se verificó a mano en revisión que
  funciona bien (`describePitch(430)` → -39.8 cents), pero no está fijado en un test.
  Vale la pena sumarlo antes de la Etapa 4, que depende del signo de `cents` en los
  dos sentidos.
- Tres llamadas a `renderPianoRoll()` quedaron "muertas" (redundantes, no rompen nada)
  desde que `mainLoop` renderiza todo el tiempo: la inicial antes de arrancar el loop,
  y las dos dentro del handler de carga de MIDI. Repintan ~16ms antes de lo necesario,
  nada más — se podrían limpiar para que "un solo loop dibuja todo" sea cierto también
  en el código, no solo en el diseño.

## Próximos pasos (según el spec, etapas 4–6)
1. ~~Reproductor + piano roll estático~~ ✅ (Etapa 1, completa)
2. ~~Captura de micrófono~~ ✅ (Etapa 2, completa — falta que un humano con
   micrófono real confirme el flujo real de permiso del navegador, que ninguna
   herramienta puede automatizar)
3. ~~Detección de pitch en tiempo real~~ ✅ (Etapa 3, completa — mismo pendiente:
   falta confirmar con un micrófono real, sobre todo que el filtro de nivel mínimo
   funcione bien contra ruido de fondo real, no solo el simulado)
4. Color dinámico por nota (azul → rojo/verde según afinación) + barra bicolor al
   terminar cada nota (% de tiempo afinado) + efecto de sonido en la transición
   rojo→verde
5. Calibración de latencia mic↔piano roll
6. (Opcional) Reproducción audible del MIDI como guía sonora

El diseño ya deja lugar para, más adelante: múltiples cantantes/tarjeta de sonido
externa (modelado como un array de objetos "Voz", uno por fuente de audio), un
entrenador de vocalización (MIDI corto transpuesto por semitonos, reusando el mismo
motor de piano roll/pitch), y soporte para celulares (pendiente de resolver
HTTPS/hosting para el acceso al micrófono desde el teléfono).
