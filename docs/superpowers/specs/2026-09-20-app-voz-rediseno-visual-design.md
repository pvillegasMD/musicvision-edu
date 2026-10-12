# App voz — Rediseño visual (diseño)

## Contexto

La app se armó incrementalmente, etapa por etapa, sin una pasada de diseño visual — cada control nuevo se agregó a una sola fila larga, con la paleta oscura original (fondo `#12141c`, acento azul `#4a90d9`). Ahora que se va a usar en un contexto real de aula, el usuario pidió una limpieza visual general: orden, colores, tipografía.

El diseño se validó interactivamente con mockups (herramienta de brainstorming visual) — las decisiones abajo ya fueron confirmadas por el usuario, no son propuestas abiertas.

## Diseño

### 1. Paleta y estilo general

**Colores de página** (nuevos, reemplazan los actuales en todo lo que NO sea el piano roll/forma de onda):
- Fondo de página: `#fbf9f5`
- Texto principal: `#2b2420`
- Texto secundario/etiquetas: `#a8886a`
- Bordes de tarjetas/inputs: `#eee2d3` (tarjetas), `#e3d8c8` (inputs)
- Acento primario (botón principal, ej. Reproducir): degradé `#d16f37` → `#b8571f`, con sombra `#8a4416`
- Botón secundario: fondo blanco, texto `#8a7a68`, sombra `#e3d8c8`

**Botones**: todos los botones de la app (no solo Reproducir) pasan a tener un estilo "elevado" — un borde inferior más oscuro (3px, simulando el canto de un botón físico) más una sombra proyectada difusa. El botón primario (acento naranja) se usa solo para la acción principal de cada sección (Reproducir, Ver informe dentro del aviso); el resto usa el estilo secundario (blanco).

**Tipografía**: se mantiene la fuente del sistema (`system-ui`) — no se agrega ninguna fuente externa, consistente con que la app no depende de librerías/CDNs de terceros. El cambio es de jerarquía, no de tipo de letra: etiquetas de sección en mayúscula chica y color secundario, más espacio entre grupos de controles.

**Implementación sugerida**: introducir variables CSS (`:root { --color-bg: ...; }`) como fuente única de estos valores, en vez de repetir los hex en cada regla — decisión de implementación, no cambia nada visualmente.

### 2. Reorganización de controles

La fila única de controles de hoy se divide en tres secciones con encabezado:
- **Canción** — el selector de canciones (`#songSelect`).
- **Reproducción** — Reproducir, Detener, Loop, checkboxes (Silenciar pista, Metrónomo, Reproducir MIDI).
- **Micrófono** — Activar micrófono, ganancia, medidor de nivel, Calibrar latencia.

Los inputs manuales de archivo (`#midiInput`, `#wavInput`, `#instrumentInput`, `#instrumentReferenceNote`, y el selector de tipo de voz `#voiceTypeSelect`) — que en el uso real casi nadie toca salvo para probar algo nuevo — quedan agrupados dentro de un `<details>`/`<summary>` nativo del HTML ("Cargar archivos manualmente ▾"), colapsado por defecto. Sin JavaScript adicional: el navegador ya da el comportamiento de expandir/contraer gratis.

### 3. El aviso de fin de canción reemplaza el botón "Ver informe"

`#viewReportBtn` deja de ser un botón permanente en la sección Reproducción. En su lugar: cuando una reproducción termina (por cualquiera de las 3 vías que ya existen — fin natural del WAV, "Detener", o el auto-stop por silencio — las mismas que ya llaman a `generateReport()`), aparece una franja de aviso con un resumen rápido — el porcentaje de afinación general, ya calculado en `state.lastReport.stats.inTunePercent` — y un botón "Ver informe" adentro de esa misma franja. Mientras no hay ningún informe generado, la franja no existe y no ocupa lugar. Empezar una reproducción nueva oculta la franja (mismo momento en que hoy se oculta `#reportPanel`).

### 4. Piano roll y forma de onda

Ambos canvases (`#pianoRoll`, `#waveformCanvas`) **mantienen el fondo oscuro** (`#1a1d29`) — quedan como una "pantalla" encendida dentro de la página clara, por contraste. Todos los colores funcionales existentes dentro de esos canvases — `COLOR_UPCOMING`, `COLOR_IN_TUNE`, `COLOR_OUT_OF_TUNE`, `COLOR_NO_SIGNAL`, `COLOR_PITCH_LINE`, `COLOR_WAVEFORM`, `COLOR_LOOP_MARKER` — **no cambian**, porque comunican información real (afinado/desafinado/sin señal/etc.), no son decorativos.

Se agrega:
- **Grilla horizontal tenue** en el piano roll: una línea por cada semitono entre el más grave y el más agudo de la canción cargada (usando `pitchToY` para ubicar cada línea) — como en cualquier editor de partituras.
- **Grilla vertical tenue** en el piano roll: alineada a los pulsos reales del MIDI (`state.beats`), no a un intervalo arbitrario — los mismos pulsos que ya usa el metrónomo.
- **Borde sutil en cada nota** del piano roll (`rgba(0,0,0,0.28)` aprox., ~1.5px) — para que notas seguidas del mismo tono se vean como bloques separados en vez de una sola nota continua.

Este mismo tratamiento (grilla + bordes en las notas) se extiende también a `report-svg.js`, para que el informe visual siga siendo coherente con el piano roll en vivo — es la misma razón por la que ese archivo ya reutiliza la geometría de `piano-roll-geometry.js`.

`#reportSvgContainer` (donde se muestra el SVG del informe) mantiene el fondo oscuro, por la misma lógica que el piano roll. `#reportTextView` (el texto del informe) pasa a la paleta clara de la página — es contenido de lectura, no un "escenario" visual.

## Fuera de alcance

- No es un rediseño pensado específicamente para celular (eso quedó descartado explícitamente al elegir el enfoque de "limpieza general" en vez de "mobile-first") — aunque nada de este diseño lo hace peor en pantallas chicas.
- No se agrega ninguna fuente tipográfica externa.
- No cambian los colores funcionales de piano roll/forma de onda/informe — solo se les agrega grilla y bordes.
