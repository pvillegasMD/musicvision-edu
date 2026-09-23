# Herramienta de evaluación en clase — App voz (diseño)

## Contexto

"App voz" (la app de práctica que usan los alumnos, publicada en GitHub Pages) reproduce una pista WAV + un MIDI guía con un reloj fijo y en tiempo real, y juzga el canto del alumno contra ese reloj mientras suena. Esa lógica no sirve para un caso de uso distinto que el usuario necesita: **evaluar en clase**, sin pista de acompañamiento (la tocan compañeros en vivo, con tempo humano variable), donde el profesor aprieta un botón, se aleja a evaluar otros instrumentos, y da la entrada de voz desde otra parte de la sala — sin ningún reloj compartido entre la grabación y el MIDI de referencia.

Esta es una **herramienta nueva y separada**, no una extensión de la app de práctica: vive en su propia rama de git (`local/evaluacion`), **nunca se fusiona ni se sube a GitHub** — es de uso exclusivo del profesor en su computador, con un nombre de archivo distinto (`evaluacion.html`) precisamente para que quede claro que es una herramienta aparte.

Durante el diseño surgió una idea más grande — un plugin/app de producción musical para detectar rápido qué voz desafinó en sesiones de muchas pistas — que se documentó por separado en `2026-09-23-plugin-correccion-pitch-produccion-vision.md` y **no forma parte de este proyecto**. El algoritmo central de esta herramienta (detección de inicio de canto + ajuste de tempo + juzgamiento de afinación) es el mismo que validaría esa idea futura, pero se construye acá primero, en su forma más simple, antes de pensar en esa escala.

## Alcance de esta primera versión

Este proyecto se decidió construir **por fases**. Esta primera versión es de **una sola señal de entrada** (un cantante/dúo grabado a la vez, con un micrófono/canal). La segunda señal simultánea (para evaluar un dúo con 2 micrófonos distintos y 2 informes por separado) es una fase futura, aparte, que reutiliza esta misma base.

Fuera de alcance de esta primera versión (y de esta herramienta en general, salvo que se indique lo contrario):
- Grabación de 2 señales simultáneas (fase futura).
- Dispositivos de audio con más de 2 canales direccionables individualmente — es una limitación real de la Web Audio API del navegador, no algo que se pueda resolver con más código (ver el documento de visión del plugin para la alternativa nativa).
- Reproducción de audio (no hay pista WAV en esta herramienta — el acompañamiento lo tocan personas en vivo).
- Informe de texto (.txt) o estadísticas separadas — el informe es únicamente el SVG.
- Piano roll en vivo, scroll, loop, banner de finalización, ni ningún otro elemento interactivo de la app de práctica — esta herramienta no tiene "reproducción", solo grabación y un informe estático al final.

## 1. Identidad y estructura de archivos

- Archivo nuevo: `App voz/evaluacion.html`, en la misma carpeta que la app de práctica.
- Rama de git nueva y separada (`local/evaluacion`), creada a partir del estado actual de `fix/filenames-in-context-docs`, que **nunca se fusiona de vuelta ni se sube a GitHub**.
- Reutiliza tal cual (mismo `<script src>`) los archivos puros que ya existen y no necesitan cambios: `midi-parser.js`, `piano-roll-geometry.js` (incluye `computeSemitoneGridLines`, ya construida para el rediseño visual), `pitch-detection.js`, `audio-level.js`, `note-tuning.js`.
- Archivos nuevos, chicos y con tests propios:
  - `evaluacion-alignment-utils.js` — detección de inicio/fin de canto por silencio, cálculo del factor de estiramiento, y la función que "estira" las notas del MIDI.
  - `evaluacion-report-svg.js` — generador de SVG separado de `report-svg.js` (la app de práctica no se toca en absoluto). Con grilla de semitonos/pulsos y borde por nota, mismo tratamiento visual que el rediseño reciente, pero con cada nota de **un solo color** (verde o rojo), no la mezcla bicolor de la app de práctica.

## 2. Flujo de uso

1. **Cargar MIDI**: selector de archivo simple (`<input type="file">`). Sin catálogo de canciones ni WAV — esta herramienta no reproduce nada.
2. **Elegir dispositivo de entrada**: selector desplegable (ver sección 3).
3. **Escribir el nombre del alumno/a** (o del archivo) en un campo de texto obligatorio.
4. **Botón "Grabar"**: deshabilitado mientras el nombre esté vacío, o mientras haya un informe generado pendiente de descargar (ver punto 7). Al apretarlo, empieza la captura continua de tono (sin reproducir nada, sin reloj de MIDI en tiempo real) — en pantalla solo se muestra "Grabando..." + tiempo transcurrido.
5. **Botón "Detener"**: para la captura. Automáticamente dispara el procesamiento (detección de inicio/fin de canto, ajuste de tempo, juzgamiento nota por nota) y muestra el informe SVG en pantalla — no hay un paso manual aparte para "generar informe".
6. Mientras el informe esté en pantalla sin descargar, **"Grabar" permanece deshabilitado** — no se puede grabar de nuevo sin antes guardar el informe anterior.
7. **Botón "Descargar informe"**: abre la ventana nativa de Chrome para elegir carpeta destino (`showSaveFilePicker`, ver sección 7), usando el nombre escrito en el paso 3 como nombre de archivo. Si se cancela esa ventana, el informe se mantiene en pantalla y se puede reintentar. Una vez guardado con éxito: se limpia el campo de nombre y el informe en pantalla, "Grabar" vuelve a quedar deshabilitado — listo para el siguiente alumno/a.

El MIDI cargado en el paso 1 se mantiene entre grabaciones — no hace falta volver a cargarlo para cada alumno/a.

## 3. Selección de dispositivo de audio

- Antes de mostrar el selector, se pide permiso de micrófono genérico una vez (`getUserMedia` sin `deviceId` específico) — esto desbloquea los nombres reales de los dispositivos en `enumerateDevices()` (antes de dar permiso, el navegador solo muestra nombres genéricos tipo "Micrófono 1").
- El selector desplegable lista: "Micrófono integrado" como una sola opción, y por cada dispositivo externo detectado (`kind === 'audioinput'`, excluyendo el default del sistema), **3 opciones**: "`<nombre>` — Canal 1 (L)", "`<nombre>` — Canal 2 (R)", "`<nombre>` — L+R (mezclado)".
- No se verifica de antemano si un dispositivo es realmente estéreo — siempre se ofrecen las 3 opciones para cualquier dispositivo externo (más simple, evita abrir streams de prueba solo para inspeccionar canales; si el dispositivo es mono, "Canal 2" simplemente no sirve).
- Al grabar, si se eligió "Canal 1" o "Canal 2": se pide el stream con `getUserMedia({ deviceId, channelCount: 2 })` y se separa con un `ChannelSplitterNode` de Web Audio API, usando solo el canal elegido. Si se eligió "L+R", se usa el stream tal cual, sin separar.
- Confirmado con el usuario: cubre casos reales de 2 canales (PreSonus AudioBox, Behringer XENYX X2442USB vía "USB Audio Codec"). Interfaces con más de 2 canales (ej. Focusrite Saffire Pro 24) solo entregan su par estéreo por defecto — límite real del navegador, no de esta herramienta.

## 4. Captura de grabación

No se graba audio real (no hay archivo de audio guardado ni reproducible después) — solo se captura una lista continua de `{tiempo, tono}` mientras haya señal detectada, igual al mecanismo que ya usa `state.fullPitchHistory` en la app de práctica hoy, pero sin estar atado a ningún MIDI/WAV en reproducción: el reloj es simplemente el tiempo transcurrido desde que se apretó "Grabar".

## 5. Detección de inicio y fin del canto

Después de apretar "Detener", sobre la lista completa de muestras capturadas:
- **Inicio**: el primer tramo con tono sostenido y estable (varias muestras seguidas, sin saltos bruscos de tono ni huecos largos) — para no confundir un ruido o golpe de instrumento con el inicio real del canto.
- **Fin**: mismo criterio, buscando desde el final hacia atrás.

Los valores exactos de "cuántas muestras seguidas" y "qué tan estable" son un punto de partida razonable que casi seguro va a necesitar ajuste con grabaciones reales del usuario — es la parte más experimental de todo el proyecto, y se afina después de probarla en la práctica, no algo que se pueda calibrar perfectamente de antemano.

## 6. Ajuste de tempo

Un solo factor de estiramiento global:

```
factor = (tiempo de fin del canto − tiempo de inicio del canto) ÷ duración total del MIDI original
```

Cada nota del MIDI se reposiciona:

```
nuevo_inicio = inicio_del_canto_detectado + (inicio_original_de_la_nota × factor)
nueva_duración = duración_original_de_la_nota × factor
```

Esto mantiene las proporciones rítmicas del MIDI (una negra sigue durando el doble que una corchea) pero ajusta la velocidad general a lo que efectivamente se cantó. No corrige aceleraciones/atrasos del tempo humano a mitad de la interpretación — se decidió así explícitamente por ser mucho más simple y confiable que intentar detectar cada nota cantada por separado.

## 7. Juzgamiento de notas y generación del informe

- Para la ventana de tiempo de cada nota ya reposicionada, se recogen las muestras de tono capturadas que caen ahí, y se calcula qué porcentaje estuvo afinado (mismo criterio de tolerancia de cents que ya existe en `note-tuning.js`, vía `centsOffTarget`/`isInTune`).
- **Un solo color por nota**: verde si ≥50% de las muestras en esa ventana estuvieron afinadas, rojo en caso contrario o si no hay ninguna muestra (nota no cantada) — mismo umbral que ya usa `isNoteInTune()` en la app de práctica.
- El SVG dibuja: la grilla de semitonos/pulsos y el borde por nota (igual que el rediseño visual reciente), cada nota del MIDI reposicionada en su color correspondiente, y la línea de lo efectivamente cantado superpuesta (usando el tiempo real de grabación — como las notas ya están reposicionadas en ese mismo eje de tiempo, no hace falta ninguna transformación adicional para que calcen visualmente).

## 8. Descarga del informe

- Botón "Descargar informe" usa `window.showSaveFilePicker()` (disponible en Chrome/Edge/Brave — el usuario confirmó que va a usar Chrome) para forzar la ventana de "Guardar como" cada vez, en vez de guardar silenciosamente en la carpeta de Descargas.
- El nombre de archivo sugerido es el que se escribió en el campo de nombre del alumno/a (paso 3 del flujo).
- Si el usuario cancela la ventana de guardado (`AbortError`), no pasa nada — el informe se mantiene en pantalla, "Grabar" sigue deshabilitado, se puede reintentar la descarga.

## Fuera de alcance (recapitulando)

- 2 señales simultáneas — fase futura aparte, reutilizando esta base.
- Dispositivos de más de 2 canales direccionables individualmente — limitación real del navegador.
- Catálogo de canciones, reproducción de WAV, piano roll en vivo, loop, banner de finalización, informe de texto — nada de eso aplica a esta herramienta.
- El plugin/app de producción musical para sesiones multipista — proyecto completamente aparte, documentado en `2026-09-23-plugin-correccion-pitch-produccion-vision.md`.
