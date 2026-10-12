# Proyecto: App de práctica de canto con piano roll

## Descripción general
App web para cantantes/profesores de canto. Permite cargar un archivo de audio (WAV)
con la pista de referencia y un archivo MIDI con las notas que debe cantar el usuario.
La app muestra un piano roll (como el de Logic/DAW) con las notas del MIDI como
rectángulos, y mientras el usuario canta (usando el micrófono), se dibuja una línea
en tiempo real que sube o baja según el tono cantado. Si el usuario afina, la línea
pasa justo por encima del rectángulo de la nota correspondiente. Si canta más grave
o más agudo, la línea se dibuja más abajo o más arriba.

## Aclaraciones clave
- El WAV es la pista de audio real que se reproduce (voz guía, pista de acompañamiento, etc.).
- El MIDI **no se reproduce como sonido** (al menos no en la primera versión). Solo se usa
  para extraer las notas (pitch, tiempo de inicio, duración) y dibujar el piano roll.
- El WAV y el MIDI están alineados desde el origen: mismo tempo y duración.
- Reproducir el MIDI como guía sonora queda como posible característica de una segunda etapa.

## Uso previsto
Herramienta de uso propio, para cantante/profesor de canto (no es un producto a
lanzar/vender por ahora). Plataforma: **app web** (navegador), para tener acceso simple
a micrófono en desktop y celular sin pasar por tiendas de apps.

## Plan de desarrollo por etapas

1. **Reproductor + Piano roll estático**
   - Cargar WAV y MIDI.
   - Reproducir el WAV.
   - Parsear el MIDI (ej. con `@tonejs/midi`) y dibujar los rectángulos de notas.
   - Sincronizar el scroll/avance del piano roll con el tiempo de reproducción del WAV.

2. **Captura de micrófono**
   - Pedir permiso de micrófono.
   - Capturar audio en vivo con Web Audio API.

3. **Detección de pitch en tiempo real**
   - Correr un algoritmo de detección de tono (ej. YIN, librería Pitchy o Pitchfinder)
     sobre el audio del micrófono para obtener la frecuencia cantada en cada instante.

4. **Dibujo de la línea de canto**
   - Convertir frecuencia (Hz) a posición vertical, usando la misma escala que las
     notas del piano roll (escala logarítmica, tipo semitonos).
   - Dibujar la línea en tiempo real, superpuesta a los rectángulos del piano roll.

5. **Calibración / latencia**
   - Ajustar el offset entre el momento en que la persona canta y el momento en que
     se dibuja la línea, para que caiga justo sobre el rectángulo correcto al afinar.

6. **(Fase 2, opcional)**
   - Reproducir también el MIDI como guía sonora, si se decide agregar más adelante.

## Notas técnicas / librerías sugeridas
- Parseo de MIDI: `@tonejs/midi`
- Detección de pitch: `Pitchy`, `Pitchfinder`, o `ml5.js`
- Reproducción de audio: elemento `<audio>` nativo o Web Audio API
- Dibujo del piano roll y la línea: Canvas o SVG

## Siguiente paso
Abrir este contexto en Claude Code y comenzar por la Etapa 1.
