# App voz — Etapa 7: calibración de latencia + línea de canto en tiempo real

## Resumen

La Etapa 7 retoma una característica del brief original del proyecto
(`App voz/contexto-proyecto-piano-roll-canto.md`) que nunca se construyó: una
**línea de canto en tiempo real**, dibujada sobre el piano roll, que sube o baja según
el pitch que el usuario está cantando en cada instante — superpuesta a los
rectángulos de nota que ya existen (no los reemplaza). Junto con la línea, se agrega
la **calibración de latencia** que el brief original también preveía: una prueba
interactiva donde el usuario dice "Ta" siguiendo unos clicks, que mide cuánto tarda el
micrófono en reflejar lo que realmente cantó. Ese offset corrige tanto la posición de
la línea como el sistema de juicio ya existente (colores de nota de la Etapa 4, y el
conteo de pulsos silenciosos del auto-stop de la Etapa 6).

## Contexto

Ver `App voz/musicvision_contexto.md` para el estado completo del proyecto.
Relevante para esta etapa:

- El brief original (`App voz/contexto-proyecto-piano-roll-canto.md`) describía la
  línea de canto y su calibración como las Etapas 4 y 5 de un plan de 6 etapas. En el
  diseño real del proyecto, la Etapa 4 terminó implementando el coloreado del
  rectángulo de nota (verde/rojo/gris + barra bicolor) en vez de la línea — una
  decisión tomada durante ese brainstorming, que dejó la línea sin construir. La
  "calibración" pendiente que quedó anotada en `musicvision_contexto.md` (el sesgo de
  ~43ms+ del `AnalyserNode`) heredó ese nombre pero, sin la línea, no tenía nada
  visual que corregir — solo el % de la barra bicolor y, desde la Etapa 6, el conteo
  de pulsos del auto-stop.
- `note-utils.js` ya expone `frequencyToMidi(freq)` (frecuencia → MIDI fraccional,
  sin redondear) — se reusa para mapear el pitch cantado a la misma escala vertical
  que usan las notas.
- `piano-roll-geometry.js` ya expone `pitchToY(pitch, minPitch, maxPitch, canvasHeight)`
  y `computeNoteRect(note, view)` — la línea usa la misma transformación de
  coordenadas que ya usan los rectángulos, para que quede en la posición correcta
  relativa a ellos.
- `mainLoop()` (`index.html`) ya corre cada frame, calculando `detectedFrequency`
  (gateado por nivel mínimo) y pasándolo a `updateNoteProgress`. Es el único lugar
  donde se lee el pitch del micrófono — la calibración y la línea se integran ahí, no
  se agrega un segundo loop de detección.
- `state.beats` (Etapa 5) y `countUnsungBeats` (Etapa 6) ya existen para el auto-stop.

## Alcance

### 1. Línea de canto en tiempo real

Mientras hay mic activo y una canción reproduciéndose (`hasMic() && isLive`), cada
frame con `detectedFrequency` no nulo agrega un punto a `state.pitchHistory`:
`{ time, pitch }`, donde `pitch = frequencyToMidi(detectedFrequency)` (fraccional) y
`time` es el tiempo **corregido por la latencia calibrada** (ver sección 3) — no el
tiempo real del frame.

Cada frame, `renderPianoRoll` dibuja una polilínea conectando los puntos de
`state.pitchHistory`, usando la misma transformación de coordenadas que
`computeNoteRect` (mismo `playheadX`, mismo `pixelsPerSecond`) para la posición
horizontal, y `pitchToY` para la vertical. El trazo se dibuja **encima** de los
rectángulos de nota, no en su lugar — ambos coexisten. Como el punto más reciente
siempre está capturado ~ahora, visualmente queda justo en la zona del playhead: el
usuario ve en vivo si su línea está por debajo o por arriba del rectángulo de la nota
activa, y puede corregir el pitch mientras canta, no solo ver el veredicto de color
después.

Si el tiempo entre dos puntos consecutivos del historial supera 150ms (un silencio
real, no solo el intervalo entre frames), el trazo se corta ahí en vez de conectar
con una línea recta a través del silencio.

Los puntos que ya scrollearon fuera de pantalla (más viejos que
`(PLAYHEAD_X + canvasWidth) / PIXELS_PER_SECOND` segundos) se descartan cada frame,
para que el array no crezca sin límite. El historial se reinicia (`[]`) en los mismos
momentos que `state.noteProgress`: al cargar un MIDI nuevo y en cada "Reproducir".

Dos funciones puras nuevas en `piano-roll-geometry.js` (mismo archivo que ya tiene
`computeNoteRect`, mismo criterio de coordenadas):

```js
function pitchPointX(pointTime, currentTime, pixelsPerSecond, playheadX) {
  return playheadX + (pointTime - currentTime) * pixelsPerSecond;
}

function shouldBreakLine(prevTime, nextTime, gapThresholdSec = 0.15) {
  return (nextTime - prevTime) > gapThresholdSec;
}
```

`renderPianoRoll` recorre `state.pitchHistory` en orden, llama a `shouldBreakLine`
entre cada par de puntos consecutivos para decidir si arranca un nuevo trazo
(`moveTo`) o continúa el actual (`lineTo`), y usa `pitchPointX` + `pitchToY` (ya
existente) para las coordenadas de cada punto.

Sin mic activo, esta línea no aplica — se sigue mostrando la línea guía estática de la
Etapa 6 (el pitch objetivo del MIDI), que es un elemento completamente distinto.

### 2. Calibración de latencia interactiva

Botón nuevo "Calibrar latencia" (deshabilitado hasta que el mic esté activo, mismo
criterio que el resto de los controles que dependen del mic). Al apretarlo:

- Suenan 4 clicks, uno por segundo (reusando el sonido ya existente de
  `playMetronomeClick`), programados con `AudioScheduledSourceNode.start(when)` igual
  que el metrónomo — sample-accurate, sin necesitar un scheduler propio.
- El usuario dice "Ta" en cada click.
- Para cada click, `mainLoop` (que ya calcula `peak`/`detectedFrequency` cada frame)
  registra el primer instante, dentro de una ventana de 900ms después del click, en
  que `peak` supera el mismo umbral que ya usa el resto de la detección (0.02). Si no
  hay ninguna lectura por encima del umbral en esa ventana, ese intento queda como
  inválido (`null`).
- Terminados los 4 intentos, se calcula el offset final con la función pura
  `computeCalibrationOffset` (ver abajo): la mediana de los intentos válidos, siempre
  que haya al menos 2. La mediana en vez del promedio para que un "Ta" tardío o un
  ruido de fondo puntual no arruine el resultado.
- Si la calibración tiene éxito: se guarda `state.latencyOffsetSec` y se persiste en
  `localStorage` (clave `appVozLatencyOffsetSec`), para no tener que recalibrar en
  cada sesión — se recarga al abrir la página. Un texto (`#latencyStatus`) muestra el
  valor ("Latencia calibrada: 62ms"). Se puede recalibrar cuando quiera (cambio de
  auriculares/mic).
- Si falla (menos de 2 intentos válidos): mensaje de error, no se guarda nada, el
  usuario puede reintentar.
- Sin calibrar nunca, `state.latencyOffsetSec` es `0` — todo se comporta exactamente
  como hoy.

**Función pura nueva**, en un archivo nuevo `latency-calibration.js` (mismo patrón de
export dual que el resto):

```js
function computeCalibrationOffset(deltas, minValid = 2, minDelta = 0, maxDelta = 0.5) {
  const valid = deltas.filter(d => d !== null && d >= minDelta && d <= maxDelta);
  if (valid.length < minValid) return null;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}
```

`deltas` es un array de 4 valores (segundos entre el click y la detección, o `null`
si no hubo detección en la ventana) — la función no sabe nada de audio ni de DOM, solo
recibe números.

### 3. Dónde se aplica el offset

Se define `judgmentTime = currentTime - state.latencyOffsetSec`, calculado una vez
por frame en `mainLoop`. Esta es la única línea nueva de lógica de "dónde estamos" —
todo lo demás sigue usando el `currentTime` real, sin cambios:

- **`updateNoteProgress`** (Etapa 4/6: color en vivo, `hadSignal`, acumuladores de
  afinación) recibe `judgmentTime` en vez de `currentTime` como su parámetro de
  tiempo. Su propio código no cambia — ya solo usaba ese parámetro para consultar
  `noteStatus(nota, tiempo)`, nunca para dibujar nada.
- **El auto-stop de la Etapa 6** compara contra `judgmentTime` en vez de `currentTime`
  (tanto al actualizar `state.lastSignalTime` como al llamar a `countUnsungBeats`).
- **La línea de canto** graba cada punto con `judgmentTime`, no `currentTime` (sección
  1).
- **Todo lo visual que no sea la línea** (posición de los rectángulos de nota, el
  scroll del piano roll, el playhead) sigue calculándose con el `currentTime` real,
  sin ningún offset — el WAV nunca está "atrasado", solo la lectura del micrófono lo
  está, y por eso es la única que se corrige.

Sin calibrar, `judgmentTime === currentTime` (offset 0), así que nada de esto cambia
el comportamiento actual por default.

### 4. Integración con la calibración misma

La detección de los 4 "Ta" reusa el mismo `peak`/`detectedFrequency` que `mainLoop`
ya calcula cada frame — no hay un segundo loop de audio. Mientras
`state.calibration` está activo, `mainLoop` alimenta ese estado además de lo que ya
hace. La calibración no necesita que haya una canción cargada ni reproduciéndose —
solo mic activo — y como el resto del sistema de juicio y la línea de canto están
gateados por `isLive` (`state.sourceNode !== null`), no hay interferencia entre la
calibración y el resto de la app aunque corran con el mismo detector de fondo.

## Fuera de alcance (decisiones tomadas explícitamente)

- La línea no interpola pitch durante un silencio — se corta, no se conecta (sección
  1). Suficiente para el objetivo de "ver en vivo si estoy alto o bajo"; una
  interpolación suave durante silencios reales no aporta nada.
- La calibración no distingue qué parte de la latencia es del micrófono, cuál del
  altavoz/auriculares, y cuál del tiempo de reacción humano al escuchar el click y
  decir "Ta" — mide el offset total end-to-end y lo usa tal cual. Para una app de
  práctica personal (no una herramienta de medición científica), esta aproximación es
  suficiente: lo que importa es que la línea/los colores queden alineados con cómo
  ESE usuario, en ESE dispositivo, realmente canta.
- No hay corrección de octava ni suavizado (smoothing) del trazo de la línea más allá
  de lo que ya hace el filtro de nivel mínimo existente — si el detector de pitch da
  un salto de octava puntual, se ve en la línea tal cual. No es un problema nuevo de
  esta etapa (ya podía pasar en la lectura de texto "Nota detectada"), solo ahora es
  visible como un salto en el trazo.

## Testing

Tests nuevos de Node (`node --test`, sin dependencias), mismo patrón de siempre:

- `computeCalibrationOffset`: casos con todos los intentos válidos, algunos inválidos
  (null o fuera de rango), menos del mínimo requerido (devuelve `null`), array de
  longitud par e impar (para la mediana), y los límites exactos de
  `minDelta`/`maxDelta`.
- `pitchPointX`: mapeo tiempo→x (mismo criterio que ya prueba `computeNoteRect`,
  incluyendo signo correcto antes/después del playhead).
- `shouldBreakLine`: casos justo debajo del umbral (no corta), justo en el umbral y
  por encima (corta), con el default de 150ms y con un umbral custom.

Verificación manual en navegador (mismo patrón de las etapas anteriores — servidor
HTTP local + `MediaStream`/Voz sintética inyectada vía `javascript_exec`):

- Con una Voz sintética de frecuencia controlable: confirmar que `state.pitchHistory`
  acumula puntos con el pitch esperado mientras hay señal, que se vacía al cambiar de
  MIDI/reproducir, y que un hueco de silencio simulado corta el trazo en vez de
  conectarlo.
- Simular una calibración completa (4 "clicks" con detecciones controladas en
  distintos deltas) y confirmar que `state.latencyOffsetSec` y `localStorage` quedan
  con el valor esperado, y que una calibración con menos de 2 intentos válidos falla
  sin guardar nada.
- Confirmar que, con un offset distinto de cero, el color en vivo y el auto-stop usan
  `judgmentTime` (por ejemplo, verificando que una nota que termina justo cuando debería
  fallar por el offset sin corrección, no falla con la corrección aplicada).
