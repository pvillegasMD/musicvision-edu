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
- `docs/superpowers/plans/2026-09-11-app-voz-etapa4-colores-afinacion.md` — plan de
  implementación de la Etapa 4.
- `docs/superpowers/plans/2026-09-11-app-voz-etapa5-mute-metronomo.md` — plan de
  implementación de la Etapa 5.

## Estado actual (2026-09-12)
**Etapas 1 a 5 completas e implementadas:** reproductor + piano roll estático,
captura de micrófono con fader y medidor de nivel, detección de pitch en tiempo real,
coloreado en vivo del piano roll según afinación con resumen bicolor y sonido de
éxito, y ahora dos controles de reproducción más: mutear la pista WAV (en vivo, sin
reiniciar) y un metrónomo que clickea en cada pulso del MIDI.

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
`NOTE_NAMES` quede como variable global del navegador). Etapa 4: 3 commits
(`note-tuning.js`, seguimiento de progreso por nota, colores + sonido de éxito) + 1
arreglo de su revisión final (el piano roll pintaba colores "en vivo" incluso cuando
la reproducción no estaba realmente sonando — la primera nota aparecía gris antes de
apretar Reproducir, y cargar una canción nueva después de que otra terminara la
pintaba toda roja hasta volver a apretar Reproducir). Etapa 5: 3 commits (pulsos del
MIDI en `midi-parser.js`, mutear WAV, metrónomo) + 1 arreglo dentro de la Tarea 1
(el cálculo de pulsos perdía el último click cuando la canción no terminaba justo en
un pulso) + 1 arreglo de su revisión final (el gain de mutear no se sincronizaba con
el checkbox al recargar la página — quedaba sonando aunque se viera tildado — y
protección contra un MIDI con tempo corrupto que podía generar 100.000 pulsos y
romper el metrónomo). Los 27 tests de Node pasan.

## Archivos
- **`index.html`** — UI (inputs de MIDI/WAV, botón Reproducir, checkbox de mutear
  pista, checkbox de metrónomo, controles de micrófono — botón, fader de ganancia,
  medidor de nivel, lectura de nota detectada —, `<canvas id="pianoRoll">`), carga de
  archivos, reproducción con Web Audio API, captura de micrófono, detección de pitch.
  Un solo `requestAnimationFrame` loop (`mainLoop`) maneja todo — piano roll, medidor
  y pitch — corriendo siempre desde que carga la página. Todo el JS de la app vive
  acá, inline (~400 líneas a esta altura).
- **`midi-parser.js`** — parser MIDI binario puro (sin DOM), `DataView` a mano, sin
  librerías. Expone `parseMidi(buffer) -> {notes: [{pitch, start, duration}], durationSec, beats}`
  (tiempos en segundos; `beats` es un array con el instante de cada pulso del MIDI,
  reusando el mapa de tempo que el parser ya calculaba internamente — respeta cambios
  de tempo si los hay). Export dual: `module.exports` en Node, global en navegador.
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
  sobreafinado (agudo). Mismo patrón de export dual. Ojo: esto es distinto de
  `centsOffTarget` de `note-tuning.js` (ver abajo) — `describePitch` mide contra la
  nota más cercana, `centsOffTarget` contra la nota objetivo del MIDI. Pueden dar
  lecturas distintas al mismo tiempo (ver Pendientes).
- **`note-tuning.js`** — matemática pura del estado de afinación por nota:
  `centsOffTarget(freq, notaObjetivoMIDI)`, `isInTune(cents, tolerancia=50)`,
  `noteStatus(nota, tiempoActual) -> 'upcoming'|'active'|'past'`,
  `accumulateTuning(progreso, estáAfinadoAhora, deltaSegundos)`, `tuningRatio(progreso)`,
  `liveNoteColor(frecuencia|null, notaObjetivoMIDI) -> 'in-tune'|'out-of-tune'|'no-signal'`.
  Duplica a propósito una línea de fórmula que también está en `note-utils.js`
  (`69 + 12*log2(f/440)`) en vez de depender de ese archivo — mismo criterio que el
  `SAMPLE_MIDI_BYTES` duplicado de la Etapa 1: cada módulo puro queda independiente.
  Mismo patrón de export dual.
- **`tests/`** — tests de Node (`node --test`, sin instalar nada; ejecutar como
  `node --test tests/*.test.js` desde `App voz/` — `node --test tests/` a secas falla
  en Node 24 por cómo resuelve el argumento de directorio) para los seis archivos
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
  desincronizados. Esto lo dejaba pedido la revisión final de la Etapa 2.

## Características implementadas (Etapa 4)
- **Color en vivo por nota, mientras está sonando**: verde si el pitch cantado está a
  ±50 cents o menos de la nota objetivo del MIDI (`centsOffTarget` + `isInTune` de
  `note-tuning.js`), rojo si se detecta un pitch claro pero fuera de esa tolerancia,
  **gris** si no se detecta nada claro (silencio, muy bajo el nivel, o por debajo del
  filtro de nivel mínimo de la Etapa 3). El gris es una decisión explícita tomada con
  el usuario durante el diseño — el spec original solo tenía rojo/verde.
- **Barra bicolor al terminar cada nota**: una vez que la nota ya sonó completa,
  queda congelada mostrando verde a la izquierda (el % de su duración que estuvo
  afinada) y rojo el resto — acá el gris/silencio se cuenta como "no afinado" junto
  con el rojo, solo dos categorías en el resumen final, a diferencia del color en
  vivo que tiene tres.
- **Efecto de sonido de éxito**: un blip corto (oscilador + envolvente) suena cada vez
  que la nota activa pasa a estar afinada (desde rojo o desde gris) — puede sonar más
  de una vez en la misma nota si el usuario se desafina y vuelve a afinar.
- **Acumuladores por nota** (`state.noteProgress`, un `{timeInTune, timeTotal}` por
  nota): se resetean al cargar un MIDI nuevo y en cada click de "Reproducir", para que
  repetir la canción sea siempre un intento limpio.
- **Arreglo de "en vivo" vs. "congelado"**: la revisión final encontró que
  `renderPianoRoll` pintaba colores como si la reproducción estuviera sonando aunque
  no lo estuviera (la primera nota se veía gris antes de apretar Reproducir, y cargar
  una canción nueva después de que otra terminara pintaba todo rojo). El fix hace que
  el color "en vivo" (verde/rojo/gris) solo aplique mientras `state.sourceNode` es
  real — el resto del tiempo, una nota que no tiene progreso real acumulado se ve
  azul (todavía no cantada), no como un intento fallido.

## Características implementadas (Etapa 5)
- **Mutear la pista WAV** (checkbox "Silenciar pista"): un `GainNode` persistente
  (`state.wavGainNode`) se interpone entre cada `AudioBufferSourceNode` de
  reproducción y los parlantes — antes iba directo. El checkbox cambia el gain en
  vivo (0 o 1), sin reiniciar la reproducción. Al cargar la página también se
  sincroniza el gain con el estado del checkbox (los navegadores restauran
  checkboxes tildados al recargar; sin esto, la app podía sonar aunque el checkbox
  se viera tildado — bug encontrado en la revisión final).
- **Metrónomo** (checkbox "Metrónomo"): usa `state.beats` (los pulsos del MIDI que
  ahora expone `parseMidi`). Al apretar "Reproducir", si el checkbox está tildado, se
  programan TODOS los clicks del pulso de una sola vez con
  `oscillator.start(momento exacto)` — no hace falta un scheduler tipo "lookahead",
  Web Audio programa cada click con precisión de muestra sin importar el timing de
  JavaScript. El click suena siempre, incluso con la pista muteada (conecta directo a
  los parlantes, no pasa por `wavGainNode`) — misma independencia estructural que ya
  tenía el sonido de éxito de la Etapa 4. **Simplificación a propósito**: tildar o
  destildar el checkbox a mitad de canción no hace nada hasta el próximo "Reproducir"
  — evita tener que cancelar/reprogramar clicks ya agendados.
- **Protección contra tempo corrupto**: el cálculo de `beats` ahora corta si `t` deja
  de ser un número finito, y si `ticksPerBeat` es 0 o negativo — sin esto, un MIDI con
  un tempo degenerado podía generar 100.000 pulsos y romper el metrónomo al intentar
  programar `oscillator.start(NaN)`.

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
  por la Etapa 4. Cambio cosmético de una palabra, pendiente hace tres etapas.
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
  excepción, se corta el único loop de la app entera y la UI se congela sin aviso.
  Esto ya se había anotado antes de la Etapa 4 como algo para resolver "antes de meter
  más lógica al mismo tick" — la Etapa 4 metió más lógica (`updateNoteProgress`,
  `tuningRatio`) sin agregar el `try {...} finally { requestAnimationFrame(mainLoop) }`.
  Ningún camino tira una excepción hoy (verificado en revisión), pero cada etapa que
  pasa sin este guardarraíl aumenta el riesgo. Vale la pena resolverlo pronto.
- `computeLevel()` en `audio-level.js` no tiene guarda para array vacío (da
  `rms: NaN`) — inconsistente con las guardas que sí tienen `pitchRange`/`pitchToY`
  en `piano-roll-geometry.js`. Riesgo real bajo: `AnalyserNode.getByteTimeDomainData()`
  nunca devuelve un array de largo 0.
- `pitch-detection.js` no tiene límites de frecuencia mín/máx — detecta desde ~43Hz
  hasta ~22kHz, muy por fuera del rango vocal real (~65-1100Hz). Combinado con el
  filtro de nivel, achica pero no elimina la ventana de lecturas fantasma.
- `describePitch()` en `note-utils.js` no está definida para entradas no positivas
  (`describePitch(0)` da `NaN`/nombres sin sentido) — hoy no es alcanzable porque
  `detectPitch` siempre devuelve `null` o un número finito positivo, pero podría
  volverse alcanzable si una etapa futura (calibración, un generador de secuencias)
  llama `describePitch` desde otro lado que no sea `detectPitch`.
- Los tests de `note-utils.js` (heredados tal cual del plan) nunca afirman un caso de
  `cents` claramente negativo/desafinado grave — se verificó a mano que funciona bien
  (`describePitch(430)` → -39.8 cents), pero no está fijado en un test.
- Tres llamadas a `renderPianoRoll()` quedaron redundantes desde que `mainLoop`
  renderiza todo el tiempo: la inicial antes de arrancar el loop, y las dos dentro del
  handler de carga de MIDI. Con la Etapa 4 esto pasó de ser solo "repintar 16ms antes
  de lo necesario" a potencialmente pintar con un `activeNoteIndex` del frame
  anterior — se podrían limpiar para que "un solo loop dibuja todo" sea cierto también
  en el código.
- **Dos "cents" distintos, mostrados a la vez, medidos contra referencias distintas.**
  `updatePitchDisplay` usa `describePitch` de `note-utils.js` (cents contra la nota
  *más cercana*); el color en vivo usa `centsOffTarget` de `note-tuning.js` (cents
  contra la nota *objetivo* del MIDI). Si el usuario canta una quinta justa de más,
  puede leer "Nota detectada: G4 (+2 cents)" — se ve bien afinado — mientras la barra
  está roja. Ninguna de las dos funciones está mal, es una inconsistencia de UX entre
  dos features que ahora conviven en pantalla. Candidato para resolver en la Etapa de
  calibración (mostrar "cents respecto al objetivo" en vez de "respecto a la más
  cercana" cuando hay una nota activa).
- **El efecto de sonido no tiene histeresis ni intervalo mínimo entre disparos.** Si
  el pitch detectado oscila justo en el borde de ±50 cents o del umbral de nivel
  (0.02), cada frame que vuelve a entrar en "afinado" dispara un blip nuevo — en el
  peor caso, decenas por segundo. La verificación con oscilador sintético no lo
  detecta porque un oscilador estable no tiembla así; solo aparece con un micrófono
  real. El spec y el plan permiten explícitamente el re-disparo dinámico, así que esto
  no es un bug — pero valdría la pena un mínimo de ~250ms entre blips en una pasada
  futura.
- **`deltaSeconds` no tiene techo.** Si la pestaña queda en segundo plano,
  `requestAnimationFrame` se frena (a veces a ~1fps o menos) pero el audio y el reloj
  siguen avanzando: al volver, un solo frame puede tener un `deltaSeconds` de varios
  segundos, que se le atribuye entero a la nota activa en ese instante, mientras las
  notas salteadas en el medio nunca acumulan nada y quedan rojas. Un
  `Math.min(delta, 0.1)` acotaría el error. Prioridad baja para una app de uso propio.
- **El % de afinación de la barra bicolor no descuenta la latencia del micrófono.**
  El `AnalyserNode` entrega ~43ms de audio ya pasado (buffer de 2048 muestras a
  44100Hz) más la latencia del dispositivo — cada muestra "afinada" se atribuye al
  instante de reproducción ~40-60ms *después* de que el usuario realmente cantó esa
  nota. No afecta mayor cosa al color en vivo, pero sesga el % final que se muestra
  como resultado. La Etapa de calibración de latencia es el lugar natural para
  corregir esto — por ahora, el número que se ve no es 100% objetivo.
- **`state.durationSec` (del MIDI) vs. `audioBuffer.duration` (del WAV) — el mismo
  pendiente de arriba, pero ahora con un síntoma audible.** Si el WAV es más corto
  que el MIDI, el piano roll se congela (`frozenTime`) mientras el metrónomo sigue
  clickeando hasta el final del MIDI; si es más largo, el metrónomo para antes de
  tiempo. Antes este desalineamiento fallaba en silencio; ahora se escucha.
- `state.frozenTime = null;` en `play()` es redundante — `resetNoteProgress()`,
  llamado justo después, ya lo hace. Inofensivo, viene de la Etapa 4, pero ahora
  convive con varias otras cosas en el mismo tramo de `play()` (limpieza de nodos del
  metrónomo, reset de progreso, conexión del nuevo nodo) — sacar la línea redundante
  haría ese tramo más fácil de leer la próxima vez que se le agregue algo.
- **Proceso: la recomendación de "actualizar `musicvision_contexto.md` en cada plan"
  nunca se escribió en ningún plan.** La revisión final de la Etapa 5 lo marcó: se
  buscó en los 5 archivos de plan y ninguno menciona este archivo — la doc se
  mantiene al día porque el controlador se acuerda de hacerlo después de cada
  revisión final, no porque el plan se lo pida. Vale la pena convertirlo en un paso
  explícito de la plantilla de plan, no dejarlo como costumbre.

## Próximos pasos
El plan original del spec (6 etapas) se reordenó durante el diseño de la Etapa 4,
cuando el usuario pidió sumar mutear el WAV, un metrónomo, y un efecto de
"desintegración" de notas no cantadas + parar la reproducción tras fallar varias
seguidas. Se decidió partir esto en etapas más chicas en vez de meterlo todo junto en
la Etapa 4, para poder revisar y tocar cada pieza por separado más adelante:

1. ~~Reproductor + piano roll estático~~ ✅ (Etapa 1, completa)
2. ~~Captura de micrófono~~ ✅ (Etapa 2, completa — falta que un humano con
   micrófono real confirme el flujo real de permiso del navegador, que ninguna
   herramienta puede automatizar)
3. ~~Detección de pitch en tiempo real~~ ✅ (Etapa 3, completa — mismo pendiente:
   falta confirmar con un micrófono real, sobre todo que el filtro de nivel mínimo
   funcione bien contra ruido de fondo real, no solo el simulado)
4. ~~Color dinámico por nota (azul/verde/rojo/gris) + barra bicolor al terminar cada
   nota + efecto de sonido en la transición a afinado~~ ✅ (Etapa 4, completa)
5. ~~Mutear el WAV + metrónomo~~ ✅ (Etapa 5, completa)
6. Desintegración visual de notas no cantadas + parar la reproducción tras varias
   notas seguidas sin cantar — se apoya en `state.noteProgress` de la Etapa 4 (una
   nota "no cantada" es una donde nunca hubo señal, no solo desafinada).
7. Calibración de latencia mic↔piano roll (compensaría también el sesgo de latencia
   anotado arriba, en el % de la barra bicolor)
8. (Opcional) Reproducción audible del MIDI como guía sonora

El diseño ya deja lugar para, más adelante: múltiples cantantes/tarjeta de sonido
externa (modelado como un array de objetos "Voz", uno por fuente de audio), un
entrenador de vocalización (MIDI corto transpuesto por semitonos, reusando el mismo
motor de piano roll/pitch), y soporte para celulares (pendiente de resolver
HTTPS/hosting para el acceso al micrófono desde el teléfono).
