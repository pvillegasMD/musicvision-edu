# App voz — Etapa 6: desintegración de notas no cantadas + parada automática

## Resumen

La Etapa 6 agrega dos comportamientos nuevos al piano roll de "App voz", condicionados
a si hay un micrófono activo (`state.voces.length > 0`) o no:

- **Con mic activo:** las notas donde el usuario nunca cantó nada (silencio total
  durante toda la nota, no solo desafinada) se desintegran visualmente en vez de
  quedar rojas, y si pasan varios pulsos del MIDI seguidos sin ninguna señal de voz
  clara, la reproducción se detiene sola.
- **Sin mic activo:** se corrige un vacío existente (reproducir sin mic pinta todo
  gris, como si el usuario estuviera fallando) — las notas quedan siempre azules y
  aparece una línea guía nueva que traza el pitch objetivo del MIDI a lo largo del
  tiempo.

Se apoya en `state.noteProgress` (Etapa 4) y `state.beats` (Etapa 5).

## Contexto

Ver `App voz/musicvision_contexto.md` para el estado completo del proyecto. Relevante
para esta etapa:

- `note-tuning.js` ya expone `noteStatus(note, currentTime) -> 'upcoming'|'active'|'past'`
  y `accumulateTuning(progress, isInTuneNow, deltaSeconds) -> {timeInTune, timeTotal}`.
- `state.noteProgress` es un array paralelo a `state.notes`, un `{timeInTune, timeTotal}`
  por nota, reseteado al cargar un MIDI nuevo y en cada "Reproducir".
- `midi-parser.js` expone `beats: number[]` — el instante en segundos de cada pulso del
  MIDI, calculado siempre al parsear, independiente de si el checkbox de metrónomo
  audible está tildado.
- El piano roll dibuja notas como rectángulos que scrollean de derecha a izquierda,
  cruzando una línea de playhead en una posición X fija del canvas, a una velocidad de
  scroll constante (`PIXELS_PER_SECOND`).
- `renderPianoRoll` hoy usa `isLive = state.sourceNode !== null` para decidir si pinta
  colores en vivo o todo azul. Esto no distingue si hay un mic conectado — si se
  reproduce una canción sin haber activado el micrófono, `liveNoteColor(null, ...)`
  devuelve `'no-signal'` (gris) para toda nota activa, lo cual se ve como que el
  usuario está fallando sin sentido. Esta etapa corrige ese vacío de paso.

## Alcance

### 1. Bifurcación según mic activo

Se define `hasMic = state.voces.length > 0`, evaluado cada frame igual que `isLive`.

- **Sin mic (`!hasMic`):** todas las notas se dibujan azules, sin importar su
  `noteStatus`. No corre el sistema de colores en vivo, no hay barra bicolor al
  terminar una nota, no hay desintegración, no hay parada automática. Se dibuja la
  línea guía (ver sección 4).
- **Con mic (`hasMic`):** el comportamiento de la Etapa 4 sigue vigente (colores en
  vivo, barra bicolor, sonido de éxito), más las dos funciones nuevas de esta etapa
  (secciones 2 y 3).

Esto reemplaza el uso de `isLive` como único gate en `renderPianoRoll` — ahora hace
falta `isLive && hasMic` para el sistema de colores/desintegración, y `!hasMic` (sin
importar `isLive`) para la línea guía.

### 2. Detección de "nota no cantada"

Una nota se considera "no cantada" si **nunca** hubo una señal de voz clara (el mismo
filtro de nivel mínimo que ya usa la detección de pitch, `peak > 0.02`, seguido de un
pitch detectado por YIN) durante toda su duración. Cantar algo, aunque esté desafinado
todo el tiempo, **no** cuenta como "no cantada" — ese caso ya se distingue con la barra
bicolor 100% roja existente.

`state.noteProgress[i]` gana un campo nuevo: `hadSignal` (booleano, `false` por
default). Se pone en `true` la primera vez que, con la nota `i` en estado `'active'`,
el frame tiene un `detectedFrequency` no nulo. Se resetea junto con el resto de
`noteProgress` al cargar un MIDI nuevo y en cada click de "Reproducir".

Función pura nueva en `note-tuning.js`:

```js
function noteWasSung(progress) {
  return progress.hadSignal === true;
}
```

### 3. Parada automática por pulsos de silencio

Unidad de conteo: **pulsos del MIDI** (`state.beats`), no notas — así una nota larga
no cuenta distinto que varias cortas, y la medida es consistente con el tempo real de
la canción.

Estado nuevo: `state.lastSignalTime` (segundos de reproducción del último frame con
señal de voz clara), reseteado a `0` en cada "Reproducir" (así el silencio inicial,
antes de que el usuario empiece a cantar, también cuenta).

Cada frame, si `hasMic` y `detectedFrequency !== null`, se actualiza
`state.lastSignalTime = currentTime`.

Función pura nueva (en un archivo nuevo, `silence-guard.js`, mismo patrón de export
dual que el resto):

```js
function countSilentBeats(beats, sinceTime, uptoTime) {
  return beats.filter(t => t > sinceTime && t <= uptoTime).length;
}
```

Si `hasMic` y `countSilentBeats(state.beats, state.lastSignalTime, currentTime) >= 8`,
se dispara la parada automática:

- Se detiene el `AudioBufferSourceNode` y los nodos del metrónomo (mismo mecanismo que
  ya existe para reiniciar reproducción — `onended = null` antes de `.stop()`).
- Se captura `state.frozenTime` igual que en el fin natural de una canción, para que
  el piano roll quede congelado mostrando el resultado hasta ese punto.
- Se muestra un mensaje cerca del botón "Reproducir" (reusando el estilo de `#status`):
  algo como *"Reproducción detenida: no se detectó canto durante varios pulsos."*

El umbral (8 pulsos) es una constante nombrada, fácil de ajustar después.

### 4. Desintegración visual

Cuando una nota "no cantada" (según la sección 2) pasa a `noteStatus === 'past'` — es
decir, termina de cruzar el playhead — deja de dibujarse roja/gris y en vez de eso
empieza a **desvanecerse y achicarse** progresivamente a medida que sigue scrolleando
hacia la izquierda, hasta casi desaparecer justo antes de salir del canvas.

Como el playhead está en una posición X fija y el scroll es a velocidad constante, el
tiempo que tarda una nota en cruzar toda la distancia entre el playhead y el borde
izquierdo del canvas es siempre el mismo (`playheadX / PIXELS_PER_SECOND`). Esto
permite calcular el progreso de la animación con una función pura de tiempo, sin
necesidad de trackear un timer por nota:

Función pura nueva en `piano-roll-geometry.js`:

```js
function desintegrationProgress(currentTime, noteEndTime, scrollOutDurationSec) {
  if (scrollOutDurationSec <= 0) return 1;
  const elapsed = currentTime - noteEndTime;
  return Math.max(0, Math.min(1, elapsed / scrollOutDurationSec));
}
```

`renderPianoRoll` usa este progreso (0 → 1) para interpolar linealmente la opacidad
del rectángulo de 1.0 a 0.15 (no a 0 total, para que quede un rastro visible de que
"algo pasó ahí" incluso casi desvanecida) y su escala de 1.0 a 0.6, aplicada desde el
centro del rectángulo (no desde una esquina, para que se achique de forma pareja).

### 5. Línea guía (sin mic)

Cuando `!hasMic`, además de dibujar cada rectángulo de nota en azul, se dibuja un trazo
fino horizontal por el centro vertical de cada rectángulo, abarcando el mismo rango de
tiempo que la nota (sin línea durante silencios/pausas entre notas). No requiere lógica
nueva de posición — reusa las mismas coordenadas que ya calcula `computeNoteRect` para
dibujar el rectángulo.

## Fuera de alcance (decisiones tomadas explícitamente)

- No hay histeresis en el umbral de 8 pulsos — una sola señal clara reinicia el
  contador a cero, igual que hoy no la tiene el efecto de sonido de éxito (pendiente ya
  anotado en el contexto, no se resuelve acá).
- No se descuenta la latencia del micrófono en ningún cálculo de esta etapa (mismo
  pendiente ya anotado para la Etapa de calibración).
- La línea guía no interpola entre notas (no hay portamento/glissando visual) — son
  segmentos planos por nota, con huecos en los silencios. Suficiente para el objetivo
  de "mostrar cómo sonaría perfecto" sin agregar complejidad de interpolación.
- Tildar/destildar el mic a mitad de canción cambia el modo (`hasMic`) en vivo, sin
  reiniciar la reproducción — consistente con cómo ya se comporta el resto del estado
  reactivo de la app.

## Testing

Tests nuevos de Node (`node --test`, sin dependencias), mismo patrón que los 27 tests
existentes:

- `countSilentBeats`: casos con 0, algunos, y todos los pulsos en el rango; límites
  exactos (`t === sinceTime`, `t === uptoTime`); array de `beats` vacío.
- `noteWasSung`: `hadSignal` true/false/default.
- `desintegrationProgress`: antes de que termine la nota (negativo → clamp a 0),
  progreso intermedio, después de salir de pantalla (clamp a 1), `scrollOutDurationSec`
  no positivo.

Verificación manual en navegador (mismo patrón de las etapas anteriores — servidor
HTTP local + `MediaStream` sintética inyectada vía `javascript_exec`):

- Con Voz sintética: una nota completamente en silencio se desintegra visualmente al
  pasar el playhead; silencio sostenido por 8+ pulsos detiene la reproducción y muestra
  el mensaje.
- Sin ninguna Voz en `state.voces`: reproducir una canción deja todas las notas
  azules, muestra la línea guía, y nunca se detiene sola aunque dure toda la canción.
