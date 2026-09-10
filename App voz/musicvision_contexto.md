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
  de implementación de la Etapa 1 (el único implementado hasta ahora).

## Estado actual (2026-09-10)
**Etapa 1 completa e implementada:** reproductor + piano roll estático. Sin
micrófono, sin detección de pitch, sin colores por nota todavía — todas las notas se
dibujan en azul.

Vive en una rama de git separada, **no mergeada todavía**: rama `worktree-app-voz-etapa1`
(worktree en `.claude/worktrees/app-voz-etapa1`), creada sobre `fix/filenames-in-context-docs`.
6 commits: los 4 de las tareas del plan + 2 arreglos que salieron en revisión de código
(condición de carrera al reiniciar la reproducción; manejo de archivos inválidos +
reanudación de `AudioContext` suspendido). Los 7 tests de Node pasan.

## Archivos
- **`index.html`** — UI (dos `<input type="file">` para MIDI/WAV, botón Reproducir,
  `<canvas id="pianoRoll">`), carga de archivos, reproducción con Web Audio API,
  render loop del piano roll. Todo el JS de la app vive acá, inline.
- **`midi-parser.js`** — parser MIDI binario puro (sin DOM), `DataView` a mano, sin
  librerías. Expone `parseMidi(buffer) -> {notes: [{pitch, start, duration}], durationSec}`
  (tiempos en segundos). Export dual: `module.exports` en Node, global en navegador.
- **`piano-roll-geometry.js`** — matemática de coordenadas pura: `pitchRange(notes)`,
  `pitchToY(pitch, minPitch, maxPitch, canvasHeight)`, `computeNoteRect(note, view)`.
  Mismo patrón de export dual.
- **`tests/`** — tests de Node (`node --test`, sin instalar nada) para los dos archivos
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
  (`audioContext, audioBuffer, notes, durationSec, sourceNode, playStartTime`) — capa
  de estado mínima para esta etapa.
- **WAV de prueba generado a mano** (sin librerías, header PCM de 44 bytes escrito con
  `Buffer`), con tonos que coinciden en frecuencia y tiempo con las notas del MIDI de
  prueba, para que la verificación manual ("el rectángulo cruza el playhead cuando
  empieza su tono") sea una prueba real y no una sensación.

## Pendientes / decisiones diferidas (no bloquean la Etapa 1, pero quedan anotadas)
- **Canvas no responsivo** (tamaño fijo 900×240px, sin DPR scaling) — el spec de
  diseño pedía esto desde el día 1 como preparación para mobile, pero el plan de la
  Etapa 1 no lo incluyó (hueco de planificación). Se decidió (2026-09-09) dejarlo para
  la etapa futura de soporte mobile, no es bloqueante ahora.
- Último frame tras terminar la reproducción es no determinístico (puede "saltar" a
  t=0 o congelarse en el último frame según el timing exacto del evento `onended`).
  Cosmético hoy, pero vale la pena resolverlo antes de la Etapa 4 (barras bicolor),
  que se apoya en el estado final de cada nota.
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
  anotado pero no resuelto.

## Próximos pasos (según el spec, etapas 2–6)
1. ~~Reproductor + piano roll estático~~ ✅ (Etapa 1, completa)
2. Captura de micrófono (`getUserMedia`)
3. Detección de pitch en tiempo real (autocorrelación tipo YIN, implementada a mano)
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
