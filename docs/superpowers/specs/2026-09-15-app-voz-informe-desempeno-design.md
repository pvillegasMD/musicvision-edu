# App voz — Informe de desempeño (diseño)

## Contexto

Hoy "App voz" muestra el desempeño del cantante solo en vivo, mientras suena la canción: el piano roll dibuja rectángulos coloreados por nota (afinado/desafinado/sin señal) y una línea amarilla con el pitch cantado, pero todo eso es efímero — nada queda registrado. `state.pitchHistory` (la línea) se poda cada cuadro para solo conservar los últimos segundos (ventana deslizante para el dibujo en vivo), y `state.noteProgress` se resetea en cada `play()`.

El usuario quiere un **informe posterior a cantar**: datos (porcentajes, rachas) descargables como `.txt`, y una visualización tipo "polígrafo/sismógrafo" — todo el desempeño de la canción de punta a punta, no una ventana que se desplaza — visible dentro del navegador con scroll horizontal, y descargable.

## Diseño

### 1. Datos nuevos que hay que empezar a registrar

**`state.noteProgress[i].firstSignalTime`** (nuevo campo, agregado al objeto que ya existe `{timeInTune, timeTotal, hadSignal}`): el `judgmentTime` exacto de la primera vez que se detecta señal de canto dentro de esa nota. Se asigna una sola vez, en `mainLoop`, en el mismo lugar donde hoy se actualiza `hadSignal` — la primera vez que `hadSignal` pasa de `false` a `true` para esa nota. Queda en `null` si la nota nunca se cantó.

**`state.fullPitchHistory`**: un array `{time, pitch}[]` idéntico en forma a `state.pitchHistory`, alimentado en el mismo punto de `mainLoop` (cada cuadro con señal detectada durante reproducción+mic activos), pero **sin podar** — se conserva toda la canción. Se reinicia (queda vacío) únicamente al arrancar una reproducción nueva, en `resetNoteProgress()`.

### 2. Cálculo del informe — `App voz/report-utils.js` (nuevo, funciones puras, con tests)

```js
function isNoteInTune(progress, threshold = 0.5) {
  return tuningRatio(progress) >= threshold;
}

function beatDurationAt(beats, time) {
  // busca el par de pulsos consecutivos que contiene `time` (o el par más
  // cercano si `time` cae antes del primero o después del último) y
  // devuelve su intervalo en segundos.
}

function startedOnTime(progress, note, beats) {
  if (progress.firstSignalTime === null) return false;
  const tolerance = beatDurationAt(beats, note.start) / 2;
  return Math.abs(progress.firstSignalTime - note.start) <= tolerance;
}

function longestStreak(values, target) {
  // longitud de la racha más larga de `target` (true/false) consecutivos en `values`
}

function computeReportStats(notes, noteProgress, beats) {
  // devuelve:
  // {
  //   totalNotes, inTuneCount, inTunePercent,
  //   onTimeCount, onTimePercent,
  //   longestInTuneStreak, longestOutOfTuneStreak,
  //   perNote: [{ index, start, pitch, noteName, inTune, onTime, sung }]
  // }
}

function formatReportText(stats, meta) {
  // arma el string completo del .txt: resumen de 4 métricas + tabla nota por nota
}
```

- `isNoteInTune`: una nota está "afinada" si mantuvo el tono al menos el 50% de su duración (reutiliza `tuningRatio` de `note-tuning.js`).
- `beatDurationAt`: la tolerancia de "empezó a tiempo" es **medio pulso**, calculado dinámicamente a partir de `state.beats` (se ajusta solo si el tempo del MIDI cambia).
- `startedOnTime`: una nota nunca cantada (`firstSignalTime === null`) siempre cuenta como que NO empezó a tiempo.
- Rachas: recorridas en el orden de `notes` (ya vienen ordenadas por `start`). Una nota nunca cantada cuenta como "desafinada" para la racha de desafinadas.
- `computeReportStats` es la función agregadora — pura, no toca DOM ni `state` directamente (recibe `notes`/`noteProgress`/`beats` como argumentos).

### 3. El `.txt`

`formatReportText` arma:
1. Encabezado con metadata (duración, cantidad de notas).
2. Las 4 métricas: % de notas afinadas, % de notas que empezaron a tiempo, racha máxima de afinadas seguidas, racha máxima de desafinadas seguidas.
3. Tabla nota por nota: hora de inicio, nombre de nota (vía `midiToNoteName`), si empezó a tiempo (sí/no), si quedó afinada (sí/no).

### 4. El informe visual — `App voz/report-svg.js` (nuevo, función pura, con tests)

```js
function buildReportSvg(notes, noteProgress, fullPitchHistory, options) {
  // options: { pixelsPerSecond, rowHeight, colors: {inTune, outOfTune, noSignal, pitchLine} }
  // devuelve el SVG completo como string
}
```

Reutiliza sin cambios las funciones ya existentes en `piano-roll-geometry.js` (`pitchRange`, `computeNoteRect`, `pitchToY`, `pitchPointX`, `shouldBreakLine`), llamándolas con `currentTime: 0` y `playheadX: 0` — con eso la posición horizontal de cada nota deja de seguir al playhead y queda fija: `x = note.start * pixelsPerSecond`. El ancho total del SVG es `durationSec * pixelsPerSecond`.

Por nota:
- Nunca cantada (`!hadSignal`) → un rectángulo sólido color `colors.noSignal` (gris) — sin animación de desintegración, no aplica en un dibujo estático.
- Cantada → barra bicolor: `colors.inTune` para el ancho proporcional a `tuningRatio`, `colors.outOfTune` para el resto — mismo criterio que ya usa el piano roll en vivo para una nota pasada.

Encima de todo, una `<polyline>` (o varias, cortadas donde `shouldBreakLine` da `true`) con el trazo de `fullPitchHistory`, en `colors.pitchLine`.

### 5. Interfaz — cambios en `App voz/index.html`

**Panel nuevo** (`#reportPanel`, oculto por defecto):
- `#reportSvgContainer`: `<div style="overflow-x:auto">` con el SVG generado adentro.
- `#reportScrollLeftBtn` / `#reportScrollRightBtn`: llaman `container.scrollBy({left: ±N, behavior:'smooth'})`. El scroll nativo (trackpad, scrollbar) también funciona directamente sobre el contenedor.
- `#reportTextView`: un `<pre>` con el texto de `formatReportText`.
- `#downloadTxtBtn` / `#downloadSvgBtn`: arman un `Blob` y disparan la descarga vía un `<a download>` temporal — sin librerías.
- `#closeReportBtn`: oculta el panel.

**Botón `#viewReportBtn`** en los controles principales: reabre el panel con el último informe generado (`state.lastReport`). Deshabilitado hasta que exista un informe.

**Cuándo se genera el informe**: en los 3 puntos donde ya termina una reproducción — fin natural (`node.onended`), `stopPlayback()` manual (botón "Detener"), y auto-stop por silencio (que ya llama a `stopPlayback()`) — se calcula `computeReportStats` + `formatReportText` + `buildReportSvg`, se guarda en `state.lastReport = {stats, text, svg}`, se habilita `#viewReportBtn`, y se abre el panel automáticamente. Si `state.notes.length === 0` (no hay MIDI cargado), no se genera nada.

## Fuera de alcance

- No se marca visualmente en el SVG si una nota empezó a tarde/a tiempo (esa métrica queda solo en el `.txt`) — el SVG replica el lenguaje visual del piano roll en vivo (afinado/desafinado/sin señal + línea de pitch), no agrega elementos nuevos.
- No se persisten informes entre sesiones — se pierden al recargar la página, igual que el resto del estado de la app.
- El informe de una reproducción anterior no se borra al iniciar una nueva reproducción — el botón "Ver informe" sigue mostrando el último informe generado hasta que uno nuevo lo reemplace.
