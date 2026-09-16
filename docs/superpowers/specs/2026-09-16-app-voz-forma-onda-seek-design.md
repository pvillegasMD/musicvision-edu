# App voz — Forma de onda + salto de posición (diseño)

## Contexto

"App voz" solo permite reproducir una canción de punta a punta, sin forma de ver ni cambiar en qué punto está la reproducción. El piano roll muestra una ventana deslizante de unos pocos segundos alrededor del playhead — no da una vista de toda la canción. El usuario quiere poder ubicarse visualmente en cualquier parte de la canción (por ejemplo, para practicar solo el último coro) y saltar ahí directamente, sin tener que esperar a que la reproducción llegue sola.

Los loops para practicar un pasaje específico quedan fuera de este diseño — es una segunda etapa, con su propio diseño, una vez que esto esté andando.

## Diseño

### 1. Extracción de picos de la forma de onda

Nuevo archivo puro `App voz/waveform-utils.js` (con tests):

```js
function computeWaveformPeaks(samples, width) {
  // samples: array/Float32Array plano de un solo canal
  // width: cantidad de columnas de píxel a generar
  // devuelve: [{min, max}, ...] un par por columna, min/max normalizados en [-1, 1]
}
```

Recibe un array de una sola dimensión — no sabe nada de `AudioBuffer`, estéreo, ni Web Audio. El llamador (en `index.html`) arma ese array plano a partir de `audioBuffer.getChannelData(i)`, promediando los canales si el WAV es estéreo, antes de invocar la función. Cada columna de píxel agrupa el tramo de muestras que le corresponde y devuelve su valor mínimo y máximo — la técnica estándar de downsampling que usa cualquier editor de audio para dibujar una forma de onda sin tener que pintar cada muestra individual.

### 2. Dibujo

Un `<canvas id="waveformCanvas">` nuevo, arriba del piano roll existente: ancho 900px (igual que `#pianoRoll`), alto 60px.

- **`state.waveformPeaks`**: se calcula **una sola vez**, cuando se carga un WAV (en el handler de `wavInput`), llamando a `computeWaveformPeaks` con el ancho del canvas. Se limpia (`[]`) si falla la carga.
- **`renderWaveform()`** (nueva función, junto a `renderPianoRoll()`): dibuja las barras desde `state.waveformPeaks` (ya calculados, sin recalcular) más una línea vertical en la posición `currentPlaybackTime() / durationSec * anchoCanvas`, marcando dónde está la reproducción ahora. Se llama en cada cuadro del `mainLoop`, igual que `renderPianoRoll()` — el redibujado es barato porque solo dibuja rectángulos ya calculados, no vuelve a procesar el audio.

### 3. Salto de posición — `seekTo(time)`

Hoy `play()` siempre arranca el `AudioBufferSourceNode` desde el segundo 0 — no existe la idea de "posición" en el motor de audio. Esto cambia:

**Interacción**: mousedown/mousemove/mouseup sobre `#waveformCanvas`. Mientras se arrastra, la línea de posición se mueve como vista previa nomás (no se reinicia el audio en cada micro-movimiento). Al soltar (o en un click simple sin arrastre), se llama `seekTo(time)` con `time = (mouseX / anchoCanvas) * state.durationSec`, recortado a `[0, durationSec]`.

**`seekTo(time)` — dos casos:**

- **Si `state.sourceNode` existe (sonando):** para el nodo actual y limpia `metronomeNodes`/`instrumentNodes` (mismo patrón que ya usan `play()`/`stopPlayback()`). Arranca un `AudioBufferSourceNode` nuevo con `node.start(audioContext.currentTime, time)` — el segundo argumento de `.start()` es el offset en segundos dentro del buffer donde empezar a reproducir. Recalcula `state.playStartTime = audioContext.currentTime - time`, así `currentPlaybackTime()` da `time` inmediatamente después del salto. Reprograma metrónomo e instrumento **solo para los pulsos/notas con `start >= time`** — los que ya pasaron, o que estarían a mitad de camino en el momento del salto, simplemente no se programan (evita tener que calcular reproducción parcial de una nota/click, que no aporta nada útil).
- **Si `state.sourceNode` es `null` (parada):** solo actualiza `state.frozenTime = time`. No toca audio.

**En ambos casos:** llama a `resetNoteProgress()` (limpia progreso de notas y la línea de canto, como confirmaste) y `state.lastSignalTime = time` — este último es necesario para que el auto-stop por silencio (Etapa 6) no cuente como "silencio" el tramo completo entre el punto viejo y el nuevo; sin este ajuste, saltar hacia adelante podría disparar la parada automática apenas empieza a sonar de nuevo.

**Cambio en `play()`:** en vez de arrancar siempre desde 0, arranca desde `state.frozenTime` (que empieza en `0` si nunca se saltó a ningún lado). Sin este cambio, arrastrar la forma de onda estando la reproducción parada no tendría ningún efecto al apretar "Reproducir" después.

**Disponible en cualquier momento**, sonando o parada, sin deshabilitarse ni deshabilitar otros controles — a diferencia de `#voiceTypeSelect`/`#calibrateBtn` (que si se tocan a mitad de canción generan inconsistencias y por eso se bloquean), este es justamente el mecanismo nuevo para cambiar de posición en cualquier momento.

## Fuera de alcance

- Loops para practicar un pasaje — próxima etapa, diseño aparte.
- Reproducción parcial de una nota del instrumento o de un click del metrónomo que "empezó antes" del punto de salto — se omiten enteros en vez de sonar a mitad de camino.
- Zoom o navegación distinta a "toda la canción cabe en 900px" — si una canción es muy larga, cada columna de píxel representa más tiempo y la resolución de click baja, pero no se agrega ningún control de zoom en esta etapa.
