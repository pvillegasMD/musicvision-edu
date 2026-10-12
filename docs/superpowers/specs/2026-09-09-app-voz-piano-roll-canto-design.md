# Diseño: App de práctica de canto con piano roll (App voz)

Fecha: 2026-09-09
Contexto original: [App voz/contexto-proyecto-piano-roll-canto.md](../../../App%20voz/contexto-proyecto-piano-roll-canto.md)

## Descripción general

App web de uso propio para práctica de canto. El usuario (cantante o profesor)
sube dos archivos:

1. **WAV** — la pista de audio real que se reproduce (voz guía, acompañamiento, etc.).
2. **MIDI** — define las notas que debería cantar el usuario (pitch, inicio, duración).
   No se reproduce como sonido, solo se usa como dato para dibujar el piano roll.

Ambos archivos están alineados en el tiempo desde el origen (mismo tempo, misma
duración), por lo que el tiempo de reproducción del WAV es la única referencia
temporal para todo (piano roll, detección de pitch, etc.).

Mientras el WAV se reproduce, el piano roll avanza mostrando las notas del MIDI
como rectángulos. Cuando el usuario activa el micrófono y canta, se dibuja en
tiempo real el pitch detectado superpuesto al piano roll, y cada nota cambia de
color según qué tan afinado esté el usuario.

## Decisiones de arquitectura

- **Un solo HTML autocontenido**, consistente con el resto del repo: sin build,
  sin npm, sin librerías externas, sin servidor. Se abre con doble clic.
- **Parser MIDI binario propio**, reutilizando el patrón ya existente en el repo
  (`DataView`, soporta formato 0/1, tempo map variable) — no `@tonejs/midi`.
- **Detección de pitch propia**, algoritmo de autocorrelación tipo YIN
  implementado a mano — no `Pitchy`/`Pitchfinder`/`ml5.js`.
- **Reloj maestro:** `AudioContext.currentTime`, con el mismo patrón de scheduler
  lookahead (setInterval 100ms / lookahead 250ms) que usan HarmonySync y
  Metalófono.
- **Testing durante desarrollo:** desktop únicamente (Chrome/Firefox), abriendo
  el archivo directo sin servidor. El acceso a micrófono desde celular requiere
  HTTPS real y se resuelve más adelante, cuando se aborde la fase de mobile.

## Componentes

### Carga y reproducción

- Dos `<input type="file">` (WAV y MIDI), leídos con `FileReader`.
- MIDI parseado a una secuencia genérica de notas: `{pitch, inicio, duración}`
  (ver "Diseño para extensibilidad futura" — esta estructura es intencionalmente
  genérica, no acoplada a "vino de un archivo subido").
- WAV decodificado con `AudioContext.decodeAudioData` y reproducido vía Web
  Audio API.

### Piano roll (Canvas)

Notas dibujadas como rectángulos en Canvas (eje X = tiempo, eje Y = pitch),
con scroll sincronizado al `currentTime` del WAV.

**Estado de color por nota, recalculado cada frame:**

- **Azul** — el playhead todavía no llegó al inicio de la nota.
- **Rojo/Verde dinámico** — mientras el playhead está dentro de
  `[inicio, fin]` de la nota, el color refleja el estado actual: verde si el
  pitch detectado está dentro de **±50 cents** del pitch objetivo, rojo si no.
  Es dinámico: puede oscilar entre rojo y verde varias veces dentro de la
  misma nota.
- **Al terminar la nota** (playhead pasa el `fin`) — la nota se congela como
  una **barra bicolor**: verde ocupando el porcentaje de tiempo que estuvo
  afinado (de izquierda a derecha), rojo el resto. Solo se necesita acumular
  dos contadores por nota (tiempo en tono / tiempo total sonando) — no hace
  falta guardar un trazo temporal completo, el resultado final es agregado,
  no secuencial.

### Captura de micrófono + detección de pitch

- `getUserMedia` → `MediaStreamAudioSourceNode` → análisis en bloques vía
  `AnalyserNode` (o `AudioWorklet` si el polling por `requestAnimationFrame`
  no da suficiente resolución).
- Autocorrelación tipo YIN implementada a mano → frecuencia detectada.
- Frecuencia → nota MIDI más cercana + desvío en cents, para comparar contra
  la nota objetivo del piano roll.

### Efecto de "éxito"

Blip sintetizado corto (oscilador + envolvente simple, no requiere el motor
GM completo de las otras apps), disparado en cada transición rojo → verde de
una nota activa.

## Diseño para extensibilidad futura

Estas tres características se pidieron para más adelante — **no se
implementan ahora**, pero cambian cómo se estructura el código desde el
día 1 para no tener que reescribir cuando lleguen:

1. **Tarjeta de sonido externa + múltiples cantantes simultáneos, cada uno en
   un canal.** En vez de asumir "un micrófono" en variables sueltas, cada
   fuente de audio se modela como un objeto **Voz** (con su propio
   `AnalyserNode`, su propio detector de pitch, su propio estado de color por
   nota, su propia línea/color en el piano roll). Etapas 1-5 solo instancian
   una Voz (el mic por defecto del navegador) en un array de un elemento —
   agregar más voces después es sumar elementos al array, no reescribir. La
   selección de dispositivo/canal (`enumerateDevices`, `deviceId`) se
   construye recién cuando llegue esa etapa.

2. **Entrenador de vocalización** (MIDI corto transpuesto por semitonos en
   loop). El piano roll y el detector de pitch consumen la secuencia genérica
   de notas `{pitch, inicio, duración}` mencionada arriba, sin depender de
   que haya venido de un archivo subido. Cuando llegue esta etapa, un
   generador que tome un MIDI corto y lo transponga semitono a semitono
   simplemente produce esa misma estructura y se la pasa al motor existente.

3. **Llevar la app a celulares.** Desde ahora: CSS con tamaños relativos y
   canvas redimensionable (no píxeles fijos), controles pensados para touch
   (sin asumir solo mouse/hover). No se resuelve HTTPS/hosting todavía.

Ninguno de estos tres puntos agrega trabajo visible en la Etapa 1 — son
decisiones de cómo se nombran/estructuran las cosas, no features nuevas.

## Plan de implementación por etapas

1. **Reproductor + piano roll estático** — cargar WAV y MIDI, reproducir el
   WAV, dibujar el piano roll con las notas en azul, sincronizado al
   `currentTime`. Sin micrófono todavía.
2. **Captura de micrófono** — pedir permiso, capturar audio en vivo.
3. **Detección de pitch en tiempo real** — autocorrelación YIN sobre el audio
   del mic.
4. **Color dinámico + bicolor final + efecto de éxito** — lógica de estado
   descrita arriba, aplicada nota por nota.
5. **Calibración de latencia** — ajustar el offset entre el momento en que la
   persona canta y el momento en que se refleja en el piano roll.
6. **(Fase 2, opcional)** — reproducción audible del MIDI como guía sonora.

El siguiente paso después de este spec es un plan de implementación detallado
para la **Etapa 1** únicamente (via writing-plans); las etapas siguientes se
planifican una vez que la anterior esté funcionando y probada.

## Preguntas abiertas / fuera de alcance de este spec

- Hosting/HTTPS para pruebas y uso en celular (etapa futura, no bloquea nada
  de lo anterior).
- Selección de dispositivo/canal de audio externo (etapa futura, "Voz" ya
  deja la puerta abierta).
- Parámetros exactos del envolvente/timbre del efecto de "éxito" (se define
  al implementar la Etapa 4).
