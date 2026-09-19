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
- `docs/superpowers/specs/2026-09-14-app-voz-etapa6-desintegracion-autostop-design.md` —
  spec de diseño de la Etapa 6.
- `docs/superpowers/plans/2026-09-14-app-voz-etapa6-desintegracion-autostop.md` — plan
  de implementación de la Etapa 6.
- `docs/superpowers/specs/2026-09-15-app-voz-etapa7-calibracion-linea-canto-design.md` —
  spec de diseño de la Etapa 7.
- `docs/superpowers/plans/2026-09-15-app-voz-etapa7-calibracion-linea-canto.md` — plan
  de implementación de la Etapa 7.
- `docs/superpowers/specs/2026-09-15-app-voz-etapa8-reproduccion-midi-audible-design.md` —
  spec de diseño de la Etapa 8.
- `docs/superpowers/plans/2026-09-15-app-voz-etapa8-reproduccion-midi-audible.md` — plan
  de implementación de la Etapa 8.

## Estado actual (2026-09-15)
**Etapas 1 a 8 completas e implementadas — el roadmap original ya no tiene etapas
pendientes.** Reproductor + piano roll estático, captura de micrófono con fader y
medidor de nivel, detección de pitch en tiempo real, coloreado en vivo del piano roll
según afinación con resumen bicolor y sonido de éxito, mutear la pista WAV (en vivo,
sin reiniciar) y un metrónomo que clickea en cada pulso del MIDI, las notas nunca
cantadas se desintegran visualmente en vez de quedar rojas, la reproducción se detiene
sola si el usuario deja de cantar por varios pulsos seguidos, reproducir sin micrófono
activo ya no pinta las notas grises sino que muestra una línea guía sobre el pitch
objetivo, una línea de canto en tiempo real (la idea del brief original, nunca
construida hasta ahora) se dibuja sobre el piano roll mientras el usuario canta, una
calibración interactiva de latencia ("Calibrar latencia", decir "Ta" en 4 clicks)
corrige tanto esa línea como el color de las notas y el auto-stop, y ahora además: el
MIDI se puede escuchar como guía sonora — un sample de instrumento que el usuario
carga (una nota grabada real, no un oscilador) se reproduce pitch-shifteado para cada
nota de la canción.

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
romper el metrónomo). Etapa 6: 7 commits (funciones puras noteWasSung,
countSilentBeats/silence-guard.js, desintegrationProgress, seguimiento de hadSignal,
gate hasMic() + línea guía, desintegración visual, parada automática) + 1 arreglo de
la revisión final de toda la rama (la parada automática contaba cualquier pulso
silencioso, incluidos los de una introducción o interludio instrumental sin ninguna
nota; una intro de 2 compases bastaba para parar la reproducción antes de que el
usuario llegara a cantar. Se corrigió reemplazando countSilentBeats por
countUnsungBeats(beats, notes, sinceTime, uptoTime), que solo cuenta pulsos que caen
dentro de una nota y olvida la racha tras 4 pulsos seguidos en un hueco — diseño
indicado explícitamente por el usuario). Etapa 7: 5 commits (funciones puras
computeCalibrationOffset/latency-calibration.js, pitchPointX/shouldBreakLine,
judgmentTime + historial de pitch, dibujo de la línea, calibración interactiva) + 1
arreglo de la revisión final de toda la rama (localStorage sin try/catch podía tirar
abajo toda la app si el navegador lo bloqueaba; calibrar y reproducir no eran
mutuamente excluyentes; y el umbral de detección de la calibración —
detectedFrequency !== null en vez de peak > 0.02, un bug mío en el propio plan — podía
sesgar la medición o confundir el click del metrónomo con la "Ta" del usuario, resuelto
agregando una zona muerta de 50ms y usando el mismo umbral de nivel que el resto de la
app). Etapa 8: 3 commits (función pura playbackRateForNote, carga del sample de
instrumento + nota de referencia, programación/reproducción de las notas sampleadas) —
sin arreglos de revisión final, la rama quedó limpia. Los 47 tests de Node pasan.

## Archivos
- **`index.html`** — UI (inputs de MIDI/WAV/instrumento, campo de nota de referencia,
  botón Reproducir, checkbox de mutear pista, checkbox de metrónomo, checkbox
  "Reproducir MIDI", controles de micrófono — botón, fader de ganancia, medidor de
  nivel, lectura de nota detectada —, botón "Calibrar latencia" + estado de latencia,
  mensaje de estado de reproducción, `<canvas id="pianoRoll">`), carga de archivos,
  reproducción con Web Audio API, captura de micrófono, detección de pitch. Un solo
  `requestAnimationFrame` loop (`mainLoop`) maneja todo — piano roll, medidor, pitch,
  el chequeo de parada automática, el historial de pitch para la línea de canto, y los
  intentos de calibración — corriendo siempre desde que carga la página. Todo el JS de
  la app vive acá, inline (~550 líneas a esta altura).
- **`midi-parser.js`** — parser MIDI binario puro (sin DOM), `DataView` a mano, sin
  librerías. Expone `parseMidi(buffer) -> {notes: [{pitch, start, duration}], durationSec, beats}`
  (tiempos en segundos; `beats` es un array con el instante de cada pulso del MIDI,
  reusando el mapa de tempo que el parser ya calculaba internamente — respeta cambios
  de tempo si los hay). Export dual: `module.exports` en Node, global en navegador.
- **`piano-roll-geometry.js`** — matemática de coordenadas pura: `pitchRange(notes)`,
  `pitchToY(pitch, minPitch, maxPitch, canvasHeight)`, `computeNoteRect(note, view)`,
  `desintegrationProgress(currentTime, noteEndTime, scrollOutDurationSec) -> 0..1`
  (Etapa 6 — progreso de la animación de desvanecer/achicar una nota no cantada, según
  cuánto tiempo pasó desde que terminó de cruzar el playhead),
  `pitchPointX(pointTime, currentTime, pixelsPerSecond, playheadX) -> number` (Etapa 7
  — mismo mapeo tiempo→x que `computeNoteRect`, aplicado a un punto del historial de
  pitch), `shouldBreakLine(prevTime, nextTime, gapThresholdSec=0.15) -> boolean`
  (Etapa 7 — si dos puntos consecutivos de la línea de canto están separados por más
  de ese umbral, se corta el trazo en vez de conectarlos). Mismo patrón de export
  dual.
- **`latency-calibration.js`** (Etapa 7) — lógica pura de la calibración:
  `computeCalibrationOffset(deltas, minValid=2, minDelta=0, maxDelta=0.5) -> number|null`.
  Filtra intentos nulos (sin detección) o fuera de rango, y devuelve la mediana de los
  que quedan — o `null` si sobreviven menos de `minValid`. No sabe nada de audio ni de
  DOM, solo recibe números. Mismo patrón de export dual.
- **`silence-guard.js`** (Etapa 6) — lógica pura de la parada automática:
  `countUnsungBeats(beats, notes, sinceTime, uptoTime) -> number`. Cuenta solo los
  pulsos del MIDI que caen dentro de alguna nota (donde había algo para cantar) sin
  señal de voz desde `sinceTime`; los pulsos que caen en un hueco (intro, interludio,
  outro) nunca cuentan, y una racha de 4 pulsos seguidos en un hueco borra cualquier
  conteo parcial acumulado antes de ese hueco. Mismo patrón de export dual.
- **`audio-level.js`** — matemática de nivel de audio pura: `computeLevel(byteTimeDomainData) -> {rms, peak}`,
  normalizado 0-1, a partir de los bytes que entrega `AnalyserNode.getByteTimeDomainData()`.
  Mismo patrón de export dual.
- **`pitch-detection.js`** — detección de pitch pura (sin DOM): `detectPitch(buffer, sampleRate, threshold=0.15) -> Hz | null`.
  Algoritmo YIN implementado a mano (función de diferencia, normalización acumulada,
  umbral absoluto, interpolación parabólica). Sin límites de frecuencia mín/máx
  todavía (detecta desde ~43Hz hasta ~22kHz, más allá del rango vocal real). Mismo
  patrón de export dual.
- **`note-utils.js`** — conversión pura de frecuencia a nota: `frequencyToMidi(freq)`,
  `midiToNoteName(midi)`, `describePitch(freq) -> {midi, noteName, cents}`,
  `playbackRateForNote(targetMidi, referenceMidi) -> number` (Etapa 8 —
  `2^((targetMidi-referenceMidi)/12)`, la relación de velocidad de reproducción que
  retunea un sample grabado en `referenceMidi` para que suene como `targetMidi`;
  misma técnica que cualquier sampler barato). `midi` usa la misma escala que
  `note.pitch` de `midi-parser.js`, y `cents` es positivo si está sobreafinado
  (agudo). Mismo patrón de export dual. Ojo: esto es distinto de `centsOffTarget` de
  `note-tuning.js` (ver abajo) — `describePitch` mide contra la nota más cercana,
  `centsOffTarget` contra la nota objetivo del MIDI. Pueden dar lecturas distintas al
  mismo tiempo (ver Pendientes).
- **`note-tuning.js`** — matemática pura del estado de afinación por nota:
  `centsOffTarget(freq, notaObjetivoMIDI)`, `isInTune(cents, tolerancia=50)`,
  `noteStatus(nota, tiempoActual) -> 'upcoming'|'active'|'past'`,
  `accumulateTuning(progreso, estáAfinadoAhora, deltaSegundos)`, `tuningRatio(progreso)`,
  `liveNoteColor(frecuencia|null, notaObjetivoMIDI) -> 'in-tune'|'out-of-tune'|'no-signal'`,
  `noteWasSung(progreso) -> boolean` (Etapa 6 — `true` solo si `progreso.hadSignal`
  es `true`; una nota "no cantada" es silencio total, no solo desafinada).
  Duplica a propósito una línea de fórmula que también está en `note-utils.js`
  (`69 + 12*log2(f/440)`) en vez de depender de ese archivo — mismo criterio que el
  `SAMPLE_MIDI_BYTES` duplicado de la Etapa 1: cada módulo puro queda independiente.
  Mismo patrón de export dual.
- **`tests/`** — tests de Node (`node --test`, sin instalar nada; ejecutar como
  `node --test tests/*.test.js` desde `App voz/` — `node --test tests/` a secas falla
  en Node 24 por cómo resuelve el argumento de directorio) para los ocho archivos
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

## Características implementadas (Etapa 6)
- **`hasMic()`** (`state.voces.length > 0`) pasa a ser el gate de todo el sistema de
  juicio del piano roll — antes solo se usaba `isLive` (`state.sourceNode !== null`),
  que no distinguía si había un micrófono conectado. Esto corrige un bug real: antes
  de esta etapa, reproducir una canción sin haber activado el micrófono pintaba cada
  nota gris (`liveNoteColor(null, ...)` siempre resuelve a `'no-signal'`), como si el
  usuario estuviera fallando sin sentido.
- **Sin mic activo**: las notas quedan siempre azules, sin importar su estado
  (`upcoming`/`active`/`past`), y se dibuja una **línea guía** nueva — un trazo fino
  por el centro vertical de cada rectángulo de nota, mostrando el pitch objetivo del
  MIDI a lo largo del tiempo, como referencia de "así sonaría perfecto". No hay
  desintegración ni parada automática en este modo.
- **Con mic activo**: el coloreado de la Etapa 4 sigue funcionando igual, más dos
  cosas nuevas:
  - **Desintegración visual de notas no cantadas**: una nota es "no cantada" si nunca
    hubo señal de voz clara (mismo filtro de nivel + YIN que ya usaba el color en
    vivo) durante toda su duración — silencio total, no solo desafinada. Se trackea
    con `state.noteProgress[i].hadSignal` (booleano, seteado la primera vez que la
    nota está activa con un `detectedFrequency` no nulo — leído antes de que
    `accumulateTuning` reemplace el objeto y reescrito después, para que no se pierda
    en el swap). Una nota no cantada, en vez de la barra bicolor habitual, se
    desvanece (opacidad 1.0→0.15) y achica (escala 1.0→0.6, centrada) a medida que
    sigue scrolleando después de cruzar el playhead — la ventana de esa animación es
    constante (`PLAYHEAD_X / PIXELS_PER_SECOND`, el tiempo que tarda cualquier punto
    en llegar del playhead al borde izquierdo del canvas a velocidad de scroll
    constante), así que no hace falta un timer por nota.
  - **Parada automática por silencio**: si pasan 8 pulsos del MIDI (`state.beats`)
    seguidos sin señal de voz clara, la reproducción se detiene sola (mismo mecanismo
    que el fin natural de una canción — `state.frozenTime` congela el piano roll) y
    aparece un mensaje en `#playbackStatus`. La unidad es pulsos, no notas, para que
    una nota larga no cuente distinto que varias cortas. **Corrección de la revisión
    final de la rama** (ver más abajo): el conteo original contaba cualquier pulso
    silencioso, incluidos los de una introducción o interludio instrumental sin
    ninguna nota — una intro de 2 compases (8 pulsos a 120 BPM) bastaba para parar la
    reproducción antes de que el usuario llegara a cantar. Se corrigió reemplazando la
    función pura `countSilentBeats(beats, sinceTime, uptoTime)` (Tarea 2 original) por
    `countUnsungBeats(beats, notes, sinceTime, uptoTime)`: solo cuenta pulsos que caen
    dentro de alguna nota (`t >= note.start && t <= note.start + note.duration`,
    mismo criterio inclusivo que `noteStatus`), y una racha de 4 pulsos seguidos fuera
    de cualquier nota borra el conteo parcial acumulado — así una intro o interludio
    largo no arrastra ni contamina el conteo de antes/después del hueco. Diseño
    indicado explícitamente por el usuario tras la revisión final.

## Características implementadas (Etapa 7)
- **Línea de canto en tiempo real**: retoma una idea del brief original del proyecto
  (`contexto-proyecto-piano-roll-canto.md`) que se había dejado de lado durante el
  diseño de la Etapa 4 en favor del coloreado de rectángulos. `state.pitchHistory`
  (array `{time, pitch}`, `pitch` en MIDI fraccional vía `frequencyToMidi`) acumula un
  punto por frame mientras hay mic activo y reproducción en curso; `renderPianoRoll`
  la dibuja como una polilínea amarilla (`COLOR_PITCH_LINE`) **encima** de los
  rectángulos de nota, no en su lugar — ambos conviven. Un silencio real (más de
  150ms entre dos puntos consecutivos, `shouldBreakLine`) corta el trazo en vez de
  conectarlo. Los puntos que ya scrollearon fuera de pantalla se descartan cada frame.
  Se reinicia junto con `state.noteProgress` (MIDI nuevo, cada "Reproducir").
- **Calibración de latencia interactiva**: botón "Calibrar latencia" (habilitado solo
  con mic activo) hace sonar 4 clicks (reusando el sonido del metrónomo), uno por
  segundo; el usuario dice "Ta" en cada uno. `mainLoop` mide, para cada click, el
  primer instante dentro de una ventana de 900ms en que el nivel supera el mismo
  umbral que ya usa el resto de la detección (`peak > 0.02`). Con al menos 2 de 4
  intentos válidos, `computeCalibrationOffset` calcula la mediana como
  `state.latencyOffsetSec`, persistido en `localStorage`
  (`appVozLatencyOffsetSec`) para no tener que recalibrar en cada sesión.
- **`judgmentTime = currentTime - state.latencyOffsetSec`**, calculado una vez por
  frame en `mainLoop`. Es la única corrección que introduce esta etapa: se usa en
  vez de `currentTime` SOLO para decidir a qué nota/pulso le corresponde una lectura
  del micrófono (color en vivo, `hadSignal`, el auto-stop de la Etapa 6, y el
  timestamp de cada punto de la línea de canto). El scroll visual de los rectángulos,
  el playhead, y el audio del WAV siguen usando el `currentTime` real sin ningún
  offset — el WAV nunca está atrasado, solo la lectura del mic lo está, y por eso es
  la única que se corrige. Sin calibrar (`latencyOffsetSec = 0`), todo se comporta
  exactamente igual que antes de esta etapa.
- **Corrección de la revisión final de la rama** (cuatro hallazgos, un solo commit):
  (1) `localStorage.getItem`/`setItem` no tenían try/catch — si el navegador lo
  bloqueaba (Safari con `file://`, configuración de privacidad estricta), el script
  entero se cortaba al cargar la página, dejando la app completamente muerta; ahora
  ambos están protegidos, y `finishCalibration()` actualiza la pantalla ANTES de
  intentar persistir, para que el offset se vea aplicado aunque `setItem` falle. (2)
  Calibrar y reproducir no eran mutuamente excluyentes — apretar "Reproducir" durante
  una calibración en curso dejaba que las "Ta" del usuario contaminaran
  `state.pitchHistory`/`state.noteProgress` de la práctica real; ahora `play()`
  cancela cualquier calibración en curso y el botón de calibrar se ignora si ya hay
  una canción sonando. (3-4) El umbral de validación de un intento de calibración
  usaba `detectedFrequency !== null` en vez de `peak > 0.02` (un bug mío, del propio
  plan — el spec decía `peak` pero el código que escribí en el plan usaba el
  resultado de YIN, más estricto porque rechaza el ataque percusivo de la "Ta" y
  espera a que la vocal se estabilice, sesgando la medición hacia arriba), y sin una
  "zona muerta" después de cada click, el propio click del metrónomo (1000Hz, 40ms,
  por los parlantes) podía colarse por el micrófono y contarse como si fuera la "Ta"
  del usuario. Se corrigió gateando en `peak > 0.02` y agregando
  `CALIBRATION_DEAD_ZONE_SEC = 0.05` antes de que cualquier detección cuente.

## Características implementadas (Etapa 8)
- **Reproducción audible del MIDI**, la última característica del roadmap original
  (marcada "opcional" desde el brief inicial). En vez de sintetizar con un oscilador,
  usa un **sample real**: el usuario carga un WAV (input "Instrumento") con una nota
  grabada de un instrumento — durante el diseño se verificó con una nota de coro "ooh"
  de una librería Garritan del usuario (PCM estéreo 16 bits 44100Hz, sin header, un
  formato de sample library — se convirtió a WAV estándar con un script aparte, fuera
  de la app, antes de cargarla) — y un campo numérico ("Nota de referencia", default
  60 = C4) le dice a la app qué nota MIDI representa ese sample.
- **Checkbox "Reproducir MIDI"**, mismo comportamiento que el del metrónomo (Etapa 5):
  decidido una sola vez al apretar "Reproducir", suena siempre que esté tildado y haya
  un sample cargado, **sin importar si la pista WAV está muteada** — conecta directo a
  `audioContext.destination`, nunca pasa por `state.wavGainNode`. Al apretar
  "Reproducir" se programa una nota por cada entrada de `state.notes`, todas de una
  sola vez (mismo patrón sample-accurate que ya usa el metrónomo): cada
  `AudioBufferSourceNode` usa `playbackRateForNote(nota.pitch, notaReferencia)` para
  afinarse, y un `GainNode` por nota hace un fade-out lineal de 20ms antes del
  `stop()` para evitar el "click" de cortar el sample de golpe a mitad de ciclo.
- **`state.instrumentNodes`** se limpia y repuebla en cada "Reproducir" (mismo patrón
  que `state.metronomeNodes`), y también se limpia en `stopPlayback()` (el auto-stop
  de la Etapa 6) — así una nota sampleada no sigue sonando después de que el resto de
  la reproducción se corta por silencio.
- **No se parsea `.sfz`/`.sf2` en la app** — la nota de referencia se ingresa a mano.
  No se usan los loop points del sample (se reproduce desde el inicio y se corta a la
  duración de la nota). Un solo sample para todo el rango — pasar a varios samples
  repartidos (si el pitch-shift se nota artificial en notas muy alejadas de la
  referencia) queda como extensión aditiva futura, no un rediseño.
- **`instrumento-default.wav`** (el mismo sample de coro confirmado por oído durante
  el diseño, movido de `docs/superpowers/specs/` a la carpeta de la app) se carga
  **solo al abrir la página** (`loadDefaultInstrument()`, un `fetch` + `decodeAudioData`
  que corre una sola vez al iniciar) — ya no hace falta seleccionarlo a mano cada vez.
  Sigue pudiéndose reemplazar por otro archivo con `#instrumentInput` en cualquier
  momento. **Solo funciona si la app se abre desde un servidor (http/https)** —
  `fetch` no funciona sobre `file://`, así que abriendo el `.html` con doble click
  sigue haciendo falta cargar el instrumento a mano; el error se muestra en pantalla,
  no rompe nada. El checkbox "Reproducir MIDI" sigue sin tildar por defecto — a
  propósito, para que el usuario decida cada vez si quiere escuchar la guía.

## Características implementadas (post-roadmap: botón Detener + cambiador de octava)
El roadmap original de 8 etapas se completó y mergeó (ver "Próximos pasos" más abajo).
Estas dos características se agregaron después, a pedido del usuario, ya con la app en
uso real:
- **Botón "Detener"** junto a "Reproducir": llama a `stopPlayback(reason)` — la misma
  función que ya usaba el auto-stop por silencio (Etapa 6) — así que corta la pista
  WAV, el metrónomo y el instrumento MIDI a la vez, sin importar en qué momento se
  presione. Reutiliza código ya probado en vez de duplicar lógica de limpieza.
- **Cambiador de octava** (`docs/superpowers/specs/2026-09-15-app-voz-cambiador-octava-design.md`,
  `docs/superpowers/plans/2026-09-15-app-voz-cambiador-octava.md`): cuando canta una
  voz masculina el MIDI debe bajar una octava, y si es bajo o barítono, dos. Se agregó
  un `<select id="voiceTypeSelect">` con tres opciones (Original=0, Voz masculina=-12,
  Bajo/Barítono=-24 semitonos) y una función pura nueva `transposeNotes(notes,
  semitones)` en `note-utils.js`.
  - `state.originalNotes` guarda el MIDI tal cual lo parsea `parseMidi` (sin
    transportar); `state.notes` — que ya consumían el piano roll, la comparación en
    vivo con el micrófono, y el playback del instrumento — pasa a ser un valor
    **derivado**: `transposeNotes(state.originalNotes, semitonosElegidos)`. Como los
    tres consumidores ya leían de `state.notes`, transportar en ese único punto
    resolvió las tres cosas (visual, evaluación, audio) sin tocar nada más.
  - Cambiar el selector con un MIDI ya cargado recalcula `state.notes` al instante
    (sin volver a subir el archivo), resetea el progreso de notas, y re-dibuja.
  - El selector se deshabilita durante la reproducción activa (mismo patrón que
    `#calibrateBtn`) y se re-habilita por las 3 vías que terminan una reproducción:
    fin natural del WAV (`node.onended`), el botón "Detener", y el auto-stop por
    silencio — las dos últimas comparten la misma función `stopPlayback()`, así que
    un solo `disabled = false` ahí cubre ambas.
  - **Hallazgo de la revisión final:** una transposición uniforme de todas las notas
    deja el piano roll visualmente idéntico (el rango vertical se calcula a partir de
    las mismas notas, así que se desplaza junto con ellas) — sin ninguna señal en
    pantalla, el usuario no tenía forma de saber si el selector realmente hizo algo.
    Se corrigió agregando el tipo de voz elegido y el rango de notas resultante (en
    nombre de nota, ej. "C3–A4") al texto de `#midiStatus`, tanto al cargar el MIDI
    como al cambiar el selector.

## Características implementadas (post-roadmap: informe de desempeño)
(`docs/superpowers/specs/2026-09-15-app-voz-informe-desempeno-design.md`,
`docs/superpowers/plans/2026-09-15-app-voz-informe-desempeno.md`) — a pedido del
usuario, para que quede registro de una sesión de canto en vez de que todo sea
efímero:
- **Dos datos nuevos que antes no se guardaban:** `noteProgress[i].firstSignalTime`
  (cuándo se detectó por primera vez que la nota sonó **en tono**, no solo que hubo
  algún sonido — ver el hallazgo de la revisión final más abajo) y
  `state.fullPitchHistory` (igual que `state.pitchHistory`, pero **sin podar**: la
  línea de canto en vivo solo guarda los últimos segundos para dibujarse, este nuevo
  campo guarda la canción completa para el informe).
- **`report-utils.js`** (nuevo, funciones puras): calcula 4 métricas — % de notas
  afinadas (mantuvo el tono al menos 50% de su duración), % de notas que empezaron a
  tiempo (dentro de medio pulso, calculado dinámicamente desde `state.beats`), racha
  máxima de notas afinadas seguidas, racha máxima de notas desafinadas seguidas (una
  nota nunca cantada cuenta como desafinada) — más una tabla nota por nota. Arma el
  `.txt` descargable.
- **`report-svg.js`** (nuevo, función pura): dibuja un piano roll estático de toda la
  canción (no uno que se desplaza como el en vivo) reutilizando sin cambios las
  funciones de `piano-roll-geometry.js` (`computeNoteRect`, `pitchPointX`, etc.),
  llamándolas con `currentTime: 0`/`playheadX: 0` para que la posición quede fija en
  vez de seguir un playhead. Recibe esas funciones geométricas **por parámetro**
  (`geometryFns`) en vez de importarlas — es la única excepción a la convención de
  "cada archivo .js es autocontenido, sin requires cruzados" que rige el resto de la
  app, deliberada para no duplicar la matemática de posicionamiento y arriesgar que
  el informe visual se desalinee del piano roll en vivo.
- **Panel `#reportPanel`** en la app: el SVG generado adentro de un contenedor con
  scroll horizontal nativo (además de dos flechas que hacen `scrollBy(...)` suave), el
  texto del `.txt` debajo, y botones para descargar ambos (vía `Blob` + `<a download>`
  temporal, sin librerías). Aparece automáticamente al terminar la reproducción (fin
  natural, "Detener", o auto-stop por silencio — las tres vías ya existentes) y queda
  un botón "Ver informe" para reabrirlo. Si no hay MIDI cargado, no se genera nada.
  Cargar un MIDI nuevo limpia el informe anterior (evita mostrar el reporte de una
  canción distinta).
- **Hallazgo de la revisión final (cambio de diseño, no bug de código):** la métrica
  "empezó a tiempo" originalmente se armaba con "se detectó cualquier señal", lo cual
  sobreestimaba el resultado en pasajes legato (la nota siguiente ya "tiene señal"
  desde su primer instante, por la cola de la nota anterior) y con ruido de fondo por
  encima del umbral del micrófono. Se redefinió — a pedido explícito del usuario, tras
  presentarle el problema — para que solo cuente como "señal" el primer instante en
  que la nota sonó **en tono** (reutilizando `liveNoteColor(...) === 'in-tune'`, ya
  calculado en el mismo lugar), no cualquier sonido detectado.

## Características implementadas (post-roadmap: forma de onda + salto de posición)
(`docs/superpowers/specs/2026-09-16-app-voz-forma-onda-seek-design.md`,
`docs/superpowers/plans/2026-09-16-app-voz-forma-onda-seek.md`) — a pedido del
usuario, para poder ubicarse visualmente en cualquier parte de la canción (por
ejemplo, para practicar solo el último coro) sin esperar a que la reproducción
llegue sola:
- **`waveform-utils.js`** (nuevo, función pura `computeWaveformPeaks(samples,
  width)`): reduce el WAV a un par `{min, max}` por columna de píxel — la
  técnica estándar de downsampling que usa cualquier editor de audio.
- **`#waveformCanvas`**, arriba del piano roll: dibuja la forma de onda completa
  del WAV (picos calculados una sola vez al cargar el WAV, promediando canales
  si es estéreo) más una línea de posición que se redibuja cada cuadro. Click o
  arrastre sobre el canvas saltan a cualquier punto — mientras se arrastra, la
  línea se mueve como vista previa (`state.waveformPreviewTime`) sin reiniciar
  el audio; el salto real ocurre recién al soltar (`mouseup`).
- **`seekTo(time)`** (nuevo): funciona sonando o parada. El rango de salto usa
  `state.audioBuffer.duration` (la duración real del WAV), no `state.durationSec`
  (la duración del MIDI — un valor distinto y a veces desalineado, ver pendiente
  ya anotado sobre esto). Reinicia todo el progreso de notas al saltar
  (`resetNoteProgress()`), y resetea `state.lastSignalTime` a la nueva posición
  para que el auto-stop por silencio (Etapa 6) no cuente como "silencio" el
  tramo completo entre la posición vieja y la nueva.
- **Hallazgo de la revisión final (bug real, no solo hallazgo cosmético):**
  el plan original hacía que `play()` arrancara desde `state.frozenTime` — pero
  ese campo en realidad significa "dónde se congeló el piano roll", y se
  escribe en **cualquier** parada (fin natural, "Detener", auto-stop por
  silencio), no solo al saltar con la forma de onda. Consecuencia: terminar de
  cantar una canción y apretar "Reproducir" de nuevo dejaba de reiniciar desde
  el principio — el segundo intento arrancaba cerca del final del buffer y no
  sonaba nada, rompiendo el flujo más básico de la app (cantar la misma
  canción dos veces). Se corrigió agregando un campo separado,
  **`state.pendingStartTime`**: solo lo escribe `seekTo()` cuando salta
  estando parada, y `play()` lo lee y lo limpia inmediatamente — `frozenTime`
  sigue significando exactamente lo mismo que antes de esta rama, sin tocar
  sus otros escritores. Cargar un MIDI nuevo limpia `pendingStartTime`
  (una posición saltada de una canción anterior no tiene sentido); cambiar el
  tipo de voz no lo limpia (seguís practicando la misma canción).
- **Refactor incluido:** `play()` y `seekTo()` compartían ~20 líneas
  duplicadas (crear el nodo, programar metrónomo/instrumento con offset,
  `onended`) — ya anotado como pendiente desde la Etapa 8, y esta rama lo
  empeoró en vez de mejorarlo hasta que la revisión final lo marcó. Se
  extrajeron `stopAndClearScheduledNodes()` y `startSourceAt(offset)`,
  usadas por ambas funciones. `stopPlayback()` todavía no usa el primer
  helper (queda su propia versión inline) — pendiente menor, no bloqueante.

## Características implementadas (post-roadmap: loop de práctica)
(`docs/superpowers/specs/2026-09-18-app-voz-loop-practica-design.md`,
`docs/superpowers/plans/2026-09-18-app-voz-loop-practica.md`) — completa el pedido
original de "loops para estudio de algún pasaje", que había quedado explícitamente
fuera de alcance de la etapa de forma de onda + seek:
- **`loop-utils.js`** (nuevo, funciones puras, todas en segundos — nunca en
  píxeles): `computeLoopEngaged(active, position, loopStart, loopEnd)`,
  `clampLoopStart`/`clampLoopEnd` (no dejan que una línea cruce a la otra, con un
  margen mínimo de 0.1s), `hitTestLoopMarker(time, loopStart, loopEnd, tolerance)`.
- **`#loopToggleBtn`**: al activarlo por primera vez, marca todo el tema
  (`[0, duración]`); activaciones siguientes reusan el último tramo marcado —
  no se pierde al apagar el botón.
- **Dos líneas naranjas arrastrables** sobre `#waveformCanvas` (▶ inicio, ◀ fin),
  en cualquier momento, sonando o parada. A diferencia de la línea blanca de
  posición, arrastrar una línea de loop escribe directo en
  `state.loopStart`/`state.loopEnd` en cada `mousemove` — no necesita el
  mecanismo de vista previa + confirmar al soltar, porque mover una línea de loop
  no tiene ningún efecto de audio por sí solo.
- **`state.loopEngaged`**: enganche de una sola vía — se activa recién cuando la
  reproducción entra naturalmente en `[loopStart, loopEnd)`. Activar el loop
  estando ya pasado el tramo marcado no fuerza ningún salto hacia atrás (queda
  esperando a que la reproducción vuelva a esa zona por su cuenta). El salto en
  sí reusa `seekTo()` — la misma función del salto manual — heredando gratis el
  reinicio del progreso de notas y la protección contra el falso auto-stop por
  silencio.
- **Hallazgo de la revisión final (bug real, no cosmético): carrera entre el fin
  natural del audio y el salto del loop cuando el tramo cubre toda la canción**
  (el valor por defecto de la primera activación). El evento `onended` del nodo
  de audio y el chequeo de "llegó al final del tramo" del `mainLoop` podían
  dispararse en el mismo instante — si ganaba `onended`, el loop daba una sola
  vuelta y se paraba solo en vez de repetir. Se corrigió haciendo que `onended`
  chequee primero si el loop está activo y enganchado, y en ese caso delegue en
  `seekTo()` en vez de hacer la limpieza normal de "canción terminada".
- **Decisión confirmada, no un bug:** si con el loop activo saltás manualmente
  (click en la forma de onda) a un punto después del fin del tramo marcado, el
  loop queda desarmado hasta que la reproducción vuelva a entrar en esa zona por
  su cuenta — mismo criterio que activar el loop desde afuera de la zona.

## Decisiones técnicas
- **`hasMic()`** (Etapa 6) centraliza `state.voces.length > 0` en una sola función en
  vez de repetir la expresión en `renderPianoRoll` y `mainLoop` — evita que las dos
  ramas de gating (colores/desintegración por un lado, parada automática por otro)
  se desincronicen si el criterio de "hay mic" cambia en el futuro.
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
- ~~**El % de afinación de la barra bicolor no descuenta la latencia del
  micrófono.**~~ **Resuelto en la Etapa 7** vía `judgmentTime` — con la latencia
  calibrada, el % ya no está sesgado. Sigue habiendo margen de error en cuánto se
  calibra realmente (ver pendiente sobre el propio proceso de calibración más abajo),
  pero el mecanismo de corrección ya existe.
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
  explícito de la plantilla de plan, no dejarlo como costumbre. **Sigue sin resolverse
  en la Etapa 6** — el plan de la Etapa 6 tampoco lo pidió como paso explícito.
- **Mensaje de `#playbackStatus` puede quedar pegado tras una parada automática.**
  (Etapa 6) Si el usuario auto-para por silencio y después carga un WAV inválido
  (`play()` corta antes de llegar a la línea que limpia el mensaje) o un MIDI nuevo,
  el texto "Reproducción detenida..." puede seguir viéndose hasta el próximo
  "Reproducir" exitoso. Se autocorrige solo, pero sería más prolijo limpiarlo también
  en esos dos casos.
- **`hasMic()` se evalúa una vez por nota dentro del `forEach` de `renderPianoRoll`**
  (Etapa 6), en vez de una sola vez por frame como ya hace `isLive`. Barato (mismo
  cálculo que `isLive`), pero inconsistente — valdría la pena izarlo junto a `isLive`.
- **Activar el micrófono a mitad de canción desintegra notas ya pasadas
  retroactivamente.** (Etapa 6) `hadSignal` solo puede marcarse `true` mientras
  `state.sourceNode` existe, así que las notas que ya pasaron antes de activar el mic
  quedan con `hadSignal: false` y, apenas `hasMic()` pasa a `true`, se ven como "no
  cantadas". El spec acepta el cambio de modo en vivo sin reiniciar, y en la práctica
  el botón de mic queda deshabilitado tras activarse una vez (no hay ida y vuelta),
  pero el resultado visual para esas notas es engañoso.
- ~~**El auto-stop de la Etapa 6 no descuenta la latencia del micrófono**~~
  **Resuelto en la Etapa 7** — el auto-stop ahora compara contra `judgmentTime`, igual
  que el color en vivo.
- **La calibración mide latencia end-to-end, sin distinguir sus componentes.** (Etapa
  7) No separa cuánto es del micrófono, cuánto del altavoz/auriculares, y cuánto es
  tiempo de reacción humano al escuchar el click y decir "Ta". Para una app de
  práctica personal esto es aceptable (lo que importa es que la línea/los colores
  queden alineados con cómo ESE usuario, en ESE dispositivo, canta realmente), pero no
  es una medición científica del retraso del hardware en sí.
- **`MAX_PITCH_HISTORY_SEC` retiene ~8× más puntos de los que pueden llegar a verse.**
  (Etapa 7) Se calculó como `(PLAYHEAD_X + CANVAS_WIDTH) / PIXELS_PER_SECOND` (6.8s),
  pero como los puntos del historial siempre están en el pasado, nunca aparecen a la
  derecha del playhead y scrollean fuera de pantalla en `PLAYHEAD_X / PIXELS_PER_SECOND`
  (0.8s). El array recorta de más, generando churn de GC innecesario en el loop de
  render (barato, pero evitable) — encontrado en la revisión final de la rama, no
  bloqueante.
- **El offset persistido en `localStorage` no se valida contra el rango que la propia
  calibración ya respeta.** (Etapa 7) `computeCalibrationOffset` nunca deja pasar un
  valor fuera de `[0, 0.5]`, pero el valor cargado al iniciar solo pasa por
  `Number.isFinite` — un valor editado a mano en `localStorage` (o corrupto) se
  aplicaría igual. Riesgo bajo (nadie edita `localStorage` de esta app a mano en el
  uso normal), pero sería más consistente reusar esos mismos límites al cargar.
- **Nuevas cadenas en voseo agregadas en la Etapa 7** (`'Calibrando... decí "Ta"...'`,
  `'... Intentá de nuevo.'`) — la app ya tenía una cadena en voseo desde la Etapa 2
  (`'Revisá los permisos...'`), así que esto es consistente con lo existente, pero
  sigue en conflicto con la preferencia explícita del usuario por español neutro/
  mexicano. Candidato para una pasada de limpieza de todo el archivo, no solo lo nuevo
  de esta etapa.
- **Parpadeo gris breve al empezar cada nota, con mic activo.** (Etapa 7)
  `state.activeNoteIndex` ahora se calcula con `judgmentTime`, pero `renderPianoRoll`
  sigue eligiendo la nota "activa" a dibujar con `noteStatus(nota, currentTime)` (el
  reloj real, a propósito — el scroll visual no debe correrse). Durante los primeros
  `latencyOffsetSec` segundos de cada nota, el rectángulo recién activo tiene
  `i !== state.activeNoteIndex` todavía y cae en gris un instante, aunque el usuario
  ya esté cantando afinado. Con valores típicos de latencia (50-150ms) esto son unos
  pocos píxeles a 150px/s, probablemente imperceptible — anotado como consecuencia
  emergente del diseño (correcto según el spec), no como bug a resolver ahora.
- **La línea de canto no tiene límites de pitch — una nota muy desafinada (por
  ejemplo, una octava de más) puede dibujarse fuera del canvas.** (Etapa 7)
  `pitchToY()` no recorta su salida; `pitchRange()` solo acolchona ±2 semitonos
  alrededor de las notas del MIDI, así que un canto muy fuera de rango hace que la
  línea "desaparezca" en vez de mostrar claramente que el usuario está muy
  desafinado — visualmente ambiguo con "el mic está apagado". Se podría fijar la
  línea al borde del canvas en vez de dejarla salir. Pendiente de baja prioridad,
  función preexistente (`pitchToY`), afectada solo indirectamente por esta etapa.
- `play()` sigue acumulando líneas en el mismo tramo (limpieza de nodos del
  metrónomo, reset de progreso, `state.lastSignalTime`, limpieza de
  `#playbackStatus`, conexión del nuevo nodo) — ya se había anotado esto en la Etapa 5
  con `state.frozenTime = null;`, la Etapa 6 agregó dos líneas más al mismo tramo, y la
  Etapa 8 sumó la limpieza de `state.instrumentNodes` justo al lado de la de
  `state.metronomeNodes`.
- **El mismo desalineamiento WAV/MIDI (ver pendiente de arriba) ahora tiene un tercer
  síntoma audible.** (Etapa 8) Si el WAV es más corto que el MIDI, además del piano
  roll congelado y el metrónomo que sigue clickeando, ahora la guía sampleada también
  sigue "cantando" hasta el final del MIDI — las notas del instrumento se programan
  contra la duración del MIDI, no del WAV, y solo `stopPlayback()`/el próximo
  "Reproducir" las cortan (el `onended` natural del WAV no las toca). Mismo pendiente
  de fondo, un síntoma más.
- **El patrón de "limpiar y resetear" un array de nodos programados
  (`metronomeNodes`, `instrumentNodes`) está duplicado 4 veces** (Etapa 8) — dos
  arrays × dos lugares que terminan una reproducción (`play()` al reiniciar y
  `stopPlayback()`). Cada bloque es idéntico salvo el array. Una función
  `stopAndClearNodes(nodes)` los colapsaría a una línea cada uno — encontrado en la
  revisión final de la rama, no bloqueante, candidato para la próxima vez que se
  toque ese tramo de `play()`/`stopPlayback()`.
- **`#instrumentReferenceNote` no valida su rango en tiempo de ejecución.** (Etapa 8)
  `min="0" max="127"` en el HTML es solo una sugerencia para el input numérico — nada
  impide escribir a mano un valor como `999`, lo que produce un `playbackRate`
  absurdo. No revienta nada (el usuario lo escucha y lo corrige al toque), pero un
  `Math.min(127, Math.max(0, valor))` lo dejaría prolijo.
- **Sin atenuación por voz en la guía sampleada.** (Etapa 8) Cada nota programada
  suena a ganancia 1 — un MIDI polifónico (varias notas sonando a la vez) sumado a la
  pista WAV podría saturar la salida. El spec ya dejó anotado un control de volumen
  dedicado para el instrumento como extensión futura no bloqueante; queda más
  relevante ahora que con el metrónomo (que era monofónico, un solo click a la vez).
- **El informe visual (`report-svg.js`) puede recortar los puntos de la línea de
  canto si `latencyOffsetSec` es positivo.** (Informe de desempeño) La corrección de
  latencia puede restar tiempo a un punto muy temprano de la canción y darle una
  coordenada X negativa, fuera del `viewBox` — encontrado en la revisión final de la
  rama, deliberadamente no arreglado en esa misma ronda (requiere decidir si se
  desplaza todo el dibujo o se recorta el eje, y no afecta el caso típico sin
  calibración agresiva). El ancho del SVG sí se corrigió para no recortar el otro
  extremo (canto que sigue después de la última nota).
- **`isNoteInTune` en `report-utils.js` reimplementa el cálculo de `tuningRatio`
  en vez de reusar la función de `note-tuning.js`.** (Informe de desempeño) El spec de
  diseño original decía "reutiliza `tuningRatio`", pero el plan de implementación lo
  cambió deliberadamente a una duplicación de una línea, siguiendo la convención ya
  establecida en esta app de "cada archivo .js es autocontenido, sin requires
  cruzados" (documentado en las Restricciones Globales del plan). La revisión final lo
  marcó como triplicación de lógica (aparece también en `report-svg.js`), pero se
  decidió dejarlo así por ser una decisión de arquitectura deliberada, no un defecto —
  el spec de diseño quedó desactualizado en ese punto.
- **Click derecho/click del medio sobre la forma de onda también dispara un salto.**
  (Forma de onda + seek) El handler de `mousedown` no chequea qué botón se usó —
  cualquier botón inicia el arrastre. Un `if (e.button !== 0) return;` lo arregla.
- **Si el mouse se suelta fuera de la ventana durante un arrastre, `isDraggingWaveform`
  queda trabado en `true`.** (Forma de onda + seek) El marcador sigue al mouse sin
  ningún botón apretado, y el próximo click en cualquier parte del documento dispara
  un salto no intencional. Solución más simple: chequear `e.buttons === 0` en el
  handler de `mousemove` y cancelar el arrastre si no hay ningún botón presionado.
- **`waveformXToTime` (y su inversa, el cálculo de la posición del marcador) no son
  funciones puras testeadas**, a diferencia de la geometría equivalente del piano
  roll (`piano-roll-geometry.js`). Es la única lógica nueva de esta etapa sin
  cobertura de tests — candidato para extraer a `waveform-utils.js` si se vuelve a
  tocar este código.
- **Saltar de posición estando parada deja el texto de estado ("Reproducción
  detenida...") y el panel de informe visibles, sin actualizarse.** (Forma de onda +
  seek) Arrastrar el marcador a otro punto no limpia `#playbackStatus` ni cierra
  `#reportPanel`, así que el informe visible ya no corresponde a la nueva posición.
- **Cada vuelta del loop reprograma metrónomo/instrumento hasta el final de la
  canción, no solo hasta el fin del tramo marcado.** (Loop de práctica)
  `startSourceAt` filtra solo `note.start < offset` — no conoce `loopEnd` — así
  que un loop de 4 segundos sobre un MIDI de 3 minutos programa (y después
  destruye) todas las notas restantes de la canción en cada vuelta. No revienta
  nada, pero es trabajo de más; con un loop muy corto (cerca del mínimo de 0.1s)
  arrastrando la línea de fin durante la reproducción, podría notarse. Solución:
  cuando `state.loopActive`, filtrar también `note.start >= state.loopEnd`.
- **Las líneas del loop en los extremos (0 o el final de la canción) quedan
  recortadas por el borde del canvas.** (Loop de práctica) Mismo problema que ya
  tenía la línea blanca de posición (no usa el ajuste de medio píxel que sí usan
  las barras de la forma de onda) — los triángulos de dirección siguen visibles,
  así que no es grave, solo cosmético.
- **`#loopToggleBtn` no tiene `aria-pressed`** — su estado activo/inactivo se
  distingue solo por color. Un candidato fácil de accesibilidad si se retoma este
  código.

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
6. ~~Desintegración visual de notas no cantadas + parar la reproducción tras varios
   pulsos seguidos sin cantar~~ ✅ (Etapa 6, completa)
7. ~~Calibración de latencia mic↔piano roll + línea de canto en tiempo real (idea
   original del brief, retomada)~~ ✅ (Etapa 7, completa)
8. ~~Reproducción audible del MIDI como guía sonora~~ ✅ (Etapa 8, completa — el
   roadmap original ya no tiene etapas pendientes)

Post-roadmap, ya con la app en uso real, se agregaron varias características más a
pedido del usuario: ~~botón "Detener"~~ ✅, ~~cambiador de octava (voz
masculina/bajo/barítono)~~ ✅, ~~informe de desempeño (datos + visual tipo
sismógrafo)~~ ✅, ~~forma de onda + salto de posición~~ ✅, y ~~loop de
práctica~~ ✅ — ver las secciones de características arriba. Con esto se completó
el pedido original de "una barra de progreso + loops para estudio de algún
pasaje" en dos etapas separadas.

El diseño ya deja lugar para, más adelante: múltiples cantantes/tarjeta de sonido
externa (modelado como un array de objetos "Voz", uno por fuente de audio), un
entrenador de vocalización (MIDI corto transpuesto por semitonos, reusando el mismo
motor de piano roll/pitch), y soporte para celulares (pendiente de resolver
HTTPS/hosting para el acceso al micrófono desde el teléfono).
