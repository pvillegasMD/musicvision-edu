# App voz — Etapa 8: reproducción audible del MIDI (voz de coro sampleada)

## Resumen

La Etapa 8 agrega la característica opcional que quedó anotada desde el brief original
del proyecto: poder escuchar el MIDI como guía sonora, no solo verlo en el piano roll.
En vez de sintetizar las notas con un oscilador simple, se usa un **sample real**
(una nota de coro "ooh" de la librería Garritan del usuario, convertida a WAV
estándar fuera de la app) reproducido a distinta velocidad (`playbackRate`) para cubrir
cada nota del MIDI — la misma técnica que usa cualquier sampler barato: grabás una
nota, y para las demás cambiás la velocidad de reproducción para subir o bajar el
tono.

## Contexto

Ver `App voz/musicvision_contexto.md` para el estado completo del proyecto. Relevante
para esta etapa:

- El brief original (`App voz/contexto-proyecto-piano-roll-canto.md`) marcaba esto como
  "Fase 2, opcional" desde el principio — nunca se había construido.
- El sample de origen es un archivo crudo (`60ChOohsC4_0002102C.audio`, formato PCM sin
  header, de la librería "Choir Oohs" de Garritan Instruments for Finale) verificado a
  mano durante el diseño: **PCM estéreo, 16 bits, 44100Hz**. El `.sfz` que acompaña a la
  librería confirma que esa nota corresponde a la tecla MIDI 60 (C4). La app **no
  parsea `.sfz`** — esa información se le pasa a mano a la app vía un campo numérico
  (ver más abajo); el archivo crudo se convierte a WAV estándar con un script aparte
  (fuera de la app, ya usado durante el diseño para confirmar el formato) antes de
  cargarlo.
- `midi-parser.js` ya expone `parseMidi(buffer) -> {notes: [{pitch, start, duration}], ...}`
  — la misma estructura de notas que ya usa el piano roll, reutilizada acá tal cual.
- `note-utils.js` ya tiene funciones puras de conversión de pitch (`frequencyToMidi`) —
  es el lugar natural para la nueva función pura de esta etapa.
- El patrón de "programar todo de una sola vez al apretar Reproducir" ya existe para el
  metrónomo (Etapa 5, `playMetronomeClick` + `state.metronomeNodes`) — esta etapa sigue
  exactamente el mismo patrón, sample-accurate vía Web Audio, sin scheduler propio.

## Alcance

### 1. Carga del sample de instrumento

Un input de archivo nuevo (`#instrumentInput`, acepta `.wav`) — mismo mecanismo que ya
usan los inputs de MIDI y WAV: se carga por sesión (nunca se embebe en el repositorio
ni se commitea — evita cualquier tema de licencia del contenido de Garritan, y sigue el
mismo patrón ya establecido para archivos que trae el usuario). Al cargarlo, se decodea
con `audioContext.decodeAudioData` (igual que el WAV de la pista) y se guarda en
`state.instrumentSample`.

Junto al input, un campo numérico (`#instrumentReferenceNote`, `min=0 max=127
value=60`) — le dice a la app qué nota MIDI representa el sample cargado. Por default
`60` (C4), que es la nota del sample ya verificado durante el diseño. Se guarda en
`state.instrumentReferenceMidi`.

### 2. Reproducción

Checkbox nuevo `#playMidiCheckbox` ("Reproducir MIDI"), con el mismo comportamiento que
el checkbox del metrónomo (Etapa 5): se decide una sola vez al apretar "Reproducir" —
tildarlo o destildarlo a mitad de canción no hace nada hasta el próximo "Reproducir".
Suena siempre que esté tildado y haya un `state.instrumentSample` cargado, **sin
importar si la pista WAV está muteada** — es una guía independiente, conecta directo a
`audioContext.destination`, no pasa por `state.wavGainNode` (misma independencia
estructural que ya tienen el metrónomo y el sonido de éxito).

Al apretar "Reproducir", si el checkbox está tildado y hay un sample cargado, se
programa una nota por cada entrada de `state.notes`, todas de una sola vez (mismo
patrón que el metrónomo):

```js
state.notes.forEach((note) => {
  const rate = playbackRateForNote(note.pitch, state.instrumentReferenceMidi);
  const node = playInstrumentNote(
    state.audioContext,
    state.instrumentSample,
    rate,
    state.playStartTime + note.start,
    note.duration
  );
  state.instrumentNodes.push(node);
});
```

`state.instrumentNodes` (array de `AudioBufferSourceNode`) se limpia y se detiene al
reiniciar la reproducción, exactamente igual que `state.metronomeNodes` (mismo
try/catch por si un nodo ya terminó de sonar solo).

### 3. Función pura nueva — `playbackRateForNote` (`note-utils.js`)

```js
function playbackRateForNote(targetMidi, referenceMidi) {
  return Math.pow(2, (targetMidi - referenceMidi) / 12);
}
```

Misma fórmula que ya usa cualquier sampler: cada 12 semitonos de diferencia duplica o
divide a la mitad la velocidad de reproducción (una octava). Vive en `note-utils.js`
junto a `frequencyToMidi` — es la misma familia de conversiones de pitch, no de
programación de audio.

### 4. Reproducir una nota del sample — `playInstrumentNote` (`index.html`)

```js
const INSTRUMENT_FADE_SEC = 0.02;

function playInstrumentNote(audioContext, buffer, playbackRate, when, durationSec) {
  const source = audioContext.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  const gain = audioContext.createGain();
  source.connect(gain);
  gain.connect(audioContext.destination);
  const stopTime = when + durationSec;
  const fadeStart = Math.max(when, stopTime - INSTRUMENT_FADE_SEC);
  gain.gain.setValueAtTime(1, fadeStart);
  gain.gain.linearRampToValueAtTime(0.0001, stopTime);
  source.start(when);
  source.stop(stopTime + 0.01);
  return source;
}
```

El sample se reproduce desde su inicio (no se usan los loop points del `.sfz` — la
duración natural del sample, ~9 segundos a velocidad normal, alcanza de sobra para
cualquier nota de una canción de práctica) y se corta a la duración de la nota. El
`GainNode` por nota hace un fade-out lineal corto (20ms) antes de `stop()`, para evitar
el "click" audible de cortar una onda de golpe a mitad de ciclo — mismo problema que
ya resuelven las envolventes existentes del metrónomo y el sonido de éxito, aplicado acá
solo al final (el ataque natural del sample real ya viene suave, no hace falta fade-in).

## Fuera de alcance (decisiones tomadas explícitamente)

- **No se parsea `.sfz` en la app.** La nota de referencia se ingresa a mano en
  `#instrumentReferenceNote`. El archivo crudo (sin header) se convierte a WAV con un
  script aparte, fuera de la app — no es código de "App voz", es una herramienta de
  conversión de un solo uso para preparar el sample antes de cargarlo.
- **No se usan los loop points ni los CC de legato del `.sfz`** (`loop_start`,
  `loop_end`, `offset_oncc68`) — se reproduce el sample desde el principio y se corta a
  la duración de la nota, sin bucle. Simplificación deliberada: agregar loop real
  requeriría trackear la posición de reproducción dentro del buffer, y para una app de
  práctica personal el sample entero (9s) ya excede cualquier nota real.
- **Un solo sample de referencia para todo el rango.** Ya se habló con el usuario:
  empezar con un solo sample es de bajo riesgo porque pasar a varios samples repartidos
  en el rango (si el pitch-shift se nota artificial en notas muy alejadas de la
  referencia) es una extensión aditiva más adelante — agregar más inputs de archivo +
  una función que elija el sample más cercano — no un rediseño de
  `playInstrumentNote`/`playbackRateForNote`.
- **Sin filtro/EQ ni reverb** — el sample suena tal cual viene grabado, sin
  procesamiento adicional.
- **No hay control de volumen dedicado para el instrumento** — suena al volumen del
  sample original. Si hace falta ajustarlo, es una adición chica futura (un fader
  como el de ganancia del mic), no bloqueante para esta etapa.

## Testing

Tests nuevos de Node (`node --test`, sin dependencias), mismo patrón de siempre:

- `playbackRateForNote`: misma nota (`targetMidi === referenceMidi`) devuelve `1`, una
  octava arriba (+12 semitonos) devuelve `2`, una octava abajo (-12) devuelve `0.5`, y
  un intervalo no-octava (por ejemplo +7, quinta justa) devuelve el valor esperado por
  la fórmula (~1.4983).

Verificación manual en navegador (mismo patrón de las etapas anteriores — servidor HTTP
local + `javascript_exec`):

- Cargar un WAV de prueba como "instrumento" (puede ser cualquier WAV corto, no hace
  falta el sample real de Garritan para verificar el mecanismo), confirmar que
  `state.instrumentSample` queda seteado tras el `change` del input.
- Cargar el fixture de MIDI de siempre (`tests/fixtures/sample.mid`, dos notas), tildar
  `#playMidiCheckbox`, apretar "Reproducir", y confirmar que `state.instrumentNodes`
  tiene tantos nodos como notas, y que un `play()` posterior limpia y repuebla ese
  array (no se acumulan nodos viejos).
- Confirmar que destildar el checkbox antes de "Reproducir" resulta en
  `state.instrumentNodes.length === 0` tras `play()`.
- Confirmar que sin `state.instrumentSample` cargado (aunque el checkbox esté tildado),
  `play()` no intenta programar nada y no tira ningún error.
