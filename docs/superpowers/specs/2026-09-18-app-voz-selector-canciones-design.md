# App voz — Selector de canciones (diseño)

## Contexto

La app se va a publicar como un único link (vía GitHub Pages) que se comparte en Google Classroom. Un alumno que entra desde cualquier curso debería poder elegir y cantar cualquier canción que el profesor haya subido — no solo la de su propio curso — sin tener que buscar y cargar manualmente el WAV y el MIDI cada vez.

El instrumento (`instrumento-default.wav`) ya se carga solo al abrir la página. Esta etapa agrega lo mismo para el WAV y el MIDI de la canción, a través de un menú desplegable.

## Diseño

### 1. Manifiesto de canciones

Nuevo archivo `App voz/canciones.json` — una lista de objetos, cada uno describiendo una canción:

```json
[
  {
    "id": "amor-completo",
    "titulo": "Amor Completo",
    "wav": "canciones/amor-completo/pista.wav",
    "midi": "canciones/amor-completo/guia.mid"
  }
]
```

Los campos `wav`/`midi` son rutas relativas a `index.html`.

### 2. Convención de carpetas

Cada canción vive en su propia carpeta: `App voz/canciones/<id>/` con su WAV y su MIDI adentro. Agregar una canción nueva en el futuro (sin tocar HTML/JS) es: crear la carpeta, poner los dos archivos, sumar una entrada a `canciones.json`.

### 3. Menú desplegable

Nuevo `<select id="songSelect">`, ubicado arriba de los inputs manuales de MIDI/WAV que ya existen. Al cargar la página, se hace `fetch('./canciones.json')` (mismo patrón que ya usa `loadDefaultInstrument()` para el instrumento) y se llenan las opciones — **ordenadas alfabéticamente por `titulo`**, sin agrupar por curso. La primera opción es un placeholder fijo ("Elige una canción...", deshabilitado/seleccionado) — no se precarga ninguna canción sola al abrir, el alumno elige.

Si `canciones.json` no existe o falla la carga, el menú queda solo con el placeholder — no rompe nada, los inputs manuales de MIDI/WAV siguen disponibles como antes.

### 4. Al elegir una canción

El evento `change` del `<select>` dispara la carga de ambos archivos (WAV y MIDI) de la canción elegida, reusando exactamente la misma lógica que ya usan los handlers de `#wavInput`/`#midiInput` hoy (decodificar el audio con `decodeAudioData`, parsear el MIDI con `parseMidi`, calcular los picos de la forma de onda, transportar según el selector de tipo de voz, resetear el progreso de notas) — la única diferencia es que los bytes vienen de un `fetch()` a la ruta del manifiesto en vez de un `File` elegido a mano.

Los inputs manuales de `#midiInput`/`#wavInput` siguen visibles y funcionando sin cambios — elegir una canción del menú los deja como si se hubieran cargado a mano, y se pueden reemplazar después con un archivo distinto para probar algo puntual.

Si falla la carga del WAV o el MIDI de la canción elegida, el error se muestra en los mismos lugares donde ya se muestran los errores de carga manual (`#wavStatus`/`#midiStatus`).

## Fuera de alcance

- No hay agrupación ni filtro por curso en el menú — lista plana, cualquier alumno ve y puede elegir cualquier canción.
- No hay una herramienta dentro de la app para agregar canciones — por ahora se agregan editando `canciones.json` y subiendo las carpetas a mano (vía git), no una interfaz de carga.
