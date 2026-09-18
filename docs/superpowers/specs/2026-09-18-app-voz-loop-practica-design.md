# App voz — Loop de práctica (diseño)

## Contexto

Con la forma de onda y el salto de posición ya implementados, el usuario puede navegar la canción libremente pero tiene que repetir manualmente cada pasaje que quiera practicar. Esta etapa agrega la posibilidad de marcar un tramo y hacer que se repita solo, sin intervención manual entre pasadas.

Queda explícitamente fuera de alcance de este diseño: cualquier agregación de resultados entre pasadas del loop — cada vuelta reinicia el progreso de notas igual que un salto manual, así que el informe (si se genera al final) solo refleja la última pasada.

## Diseño

### 1. Marcar y ajustar el tramo

**`#loopToggleBtn`**: botón deshabilitado hasta que haya un WAV cargado. Alterna `state.loopActive` (booleano).

- **Primera activación** (`state.loopStart === null`): inicializa `state.loopStart = 0` y `state.loopEnd = state.audioBuffer.duration`.
- **Activaciones siguientes**: reusa `state.loopStart`/`state.loopEnd` tal cual quedaron — no se reinician al desactivar el botón.
- **Cada activación** resetea `state.loopEngaged = false` (ver sección 3).

**Líneas visuales**: dibujadas por `renderWaveform()` sobre `#waveformCanvas`, solo cuando `state.loopActive` es `true`. Línea de inicio con un triángulo apuntando a la derecha (▶) en la parte superior, línea de fin con triángulo apuntando a la izquierda (◀), ambas en un color naranja (`#ff9800`) — distinto del blanco de la línea de posición y de los colores ya usados en el piano roll/línea de canto.

**Arrastre**: en `mousedown` sobre `#waveformCanvas`, si `state.loopActive`, primero se hace hit-test contra las dos líneas de loop (tolerancia de unos pocos píxeles, en cualquier punto de su alto — no hace falta acertarle al triángulo). Si el click cae cerca de una de las dos, arranca un arrastre de esa línea en particular; si no, sigue el comportamiento ya existente (arrastre de la línea de posición). Arrastrar una línea de loop actualiza `state.loopStart`/`state.loopEnd` **en vivo**, en cada `mousemove` — a diferencia de la línea de posición, mover una línea de loop no disminuye ni dispara ningún salto de audio, así que no necesita el mecanismo de "vista previa + confirmar al soltar". Cada línea se recorta para no cruzar a la otra, dejando un margen mínimo de 0.1s entre inicio y fin.

### 2. Reutiliza `seekTo()` para el salto del loop

Cuando el loop "engancha" y llega al final del tramo, se llama `seekTo(state.loopStart)` — exactamente la misma función que ya usa el salto manual. Esto significa que cada vuelta del loop ya hereda gratis: reinicio del progreso de notas, reprogramación del metrónomo/instrumento desde el nuevo punto, y el ajuste de `state.lastSignalTime` que evita un falso auto-stop por silencio justo después de saltar.

### 3. `state.loopEngaged` — cuándo el loop "engancha"

Nuevo campo transitorio (no persistido, se recalcula todo el tiempo): representa si la reproducción está actualmente *dentro* del tramo marcado.

- Se recalcula cada vez que la posición de reproducción cambia por cualquier vía (`seekTo()`, y el arranque inicial en `play()`): `loopEngaged = loopActive && posición >= loopStart && posición < loopEnd`.
- En cada cuadro del `mainLoop`, mientras `state.loopActive` y haya reproducción activa:
  - Si todavía no está enganchado y la posición actual entra en `[loopStart, loopEnd)` → pasa a enganchado.
  - Si ya está enganchado y la posición actual llega a `loopEnd` → `seekTo(loopStart)` (el salto), y como la nueva posición es exactamente `loopStart`, queda enganchado de nuevo automáticamente.
- Activar el botón de loop en medio de una reproducción que ya pasó el tramo marcado **no fuerza ningún salto** — sin haber entrado nunca a la zona, nunca engancha, así que nunca salta, tal como confirmaste.
- Desactivar el botón simplemente apaga el chequeo (`state.loopActive` en `false`) — la canción sigue sonando normal hasta el final real, sin más saltos.
- Apretar "Reproducir" con el loop activo arranca directamente en `state.loopStart` (ya confirmado en la Parte 1) — como esa posición ya cae en `[loopStart, loopEnd)`, queda enganchado desde el primer cuadro.

## Fuera de alcance

- No se agregan resultados acumulados entre pasadas del loop — cada vuelta es un intento fresco, igual que un salto manual.
- No hay límite a la cantidad de vueltas ni un contador visible de "pasada N".
- El loop no interactúa con el informe de desempeño más allá de lo ya descrito: si en algún momento se aprieta "Detener", el informe generado refleja solo la última pasada.
