# App voz — Cambiador de octava (diseño)

## Contexto

"App voz" evalúa el canto comparando la nota detectada por el micrófono contra las notas del MIDI cargado. El MIDI de origen suele estar escrito para una tesitura (por ejemplo, voz femenina); cuando canta una voz masculina, las notas deben bajar una octava, y si es bajo o barítono, dos octavas, para que la comparación tenga sentido con el rango vocal real del cantante.

`state.notes` (el array de notas parseadas del MIDI, cada una `{pitch, start, duration}`) es la única fuente que usan:
- El piano roll (dibujo de rectángulos, rango vertical).
- La comparación en vivo con el micrófono (color de nota activa).
- El audio de referencia del instrumento (`playbackRateForNote` calcula la velocidad de reproducción de la muestra a partir de `note.pitch`).

Transportar esas notas hacia abajo antes de que lleguen a cualquiera de esos tres consumidores resuelve el problema en un solo lugar.

## Diseño

### Función pura nueva

En `note-utils.js` (con tests en `note-utils.test.js`):

```js
function transposeNotes(notes, semitones) {
  return notes.map(n => ({ ...n, pitch: n.pitch + semitones }));
}
```

No modifica el array original; devuelve notas nuevas con `pitch` desplazado. `start`/`duration` no cambian.

### Estado

- `state.originalNotes`: notas tal como las devuelve `parseMidi`, sin transportar. Es la fuente de verdad persistente.
- `state.notes`: se mantiene como está hoy (es lo que ya consumen piano roll, comparación en vivo e instrumento) pero ahora se **deriva** de `originalNotes` aplicando `transposeNotes` con el desplazamiento actualmente seleccionado.

### Control nuevo (HTML)

Un `<select id="voiceTypeSelect">` junto al input de MIDI:

| Opción | Semitonos |
|---|---|
| Original (sin transportar) — por defecto | 0 |
| Voz masculina (-1 octava) | -12 |
| Bajo/Barítono (-2 octavas) | -24 |

### Comportamiento

1. **Al cargar un MIDI** (`midiInput` `change`): `state.originalNotes = notes` (lo que devuelve `parseMidi`); `state.notes = transposeNotes(originalNotes, semitonosActuales)`; sigue el flujo actual (`resetNoteProgress()`, actualizar `midiStatus`, `renderPianoRoll()`).
2. **Al cambiar el selector** (`voiceTypeSelect` `change`), con un MIDI ya cargado: recalcular `state.notes` desde `state.originalNotes` con el nuevo desplazamiento, llamar `resetNoteProgress()` (limpia también `pitchHistory`, ya que la línea cantada previa ya no corresponde a las notas transportadas), y `renderPianoRoll()`. Se aplica al instante, sin necesidad de volver a cargar el archivo.
3. **Durante la reproducción activa** (`state.sourceNode` no nulo): el selector se deshabilita al iniciar `play()`, igual que ya ocurre con `#calibrateBtn`. Se vuelve a habilitar en los tres caminos que terminan una reproducción: fin natural del WAV (`node.onended`), el botón "Detener" (`stopPlayback`), y la parada automática por silencio (que también pasa por `stopPlayback`).

### Casos borde

- Si no hay MIDI cargado (`state.originalNotes` vacío o inexistente), cambiar el selector no hace nada visible más allá de quedar seleccionado para la próxima carga — mismo patrón que `instrumentReferenceNote`, que se puede configurar antes de cargar el archivo correspondiente.
- El valor por defecto (0 semitonos) no cambia ningún comportamiento existente, así que esta función es aditiva y no rompe el flujo actual para quien no la use.

## Fuera de alcance

- No se agrega un desplazamiento numérico genérico (semitono por semitono); el usuario eligió explícitamente el selector por tipo de voz con los tres presets de arriba.
- No se persiste la elección entre sesiones (mismo comportamiento que el resto de los inputs de la app: todo se resetea al recargar la página).
