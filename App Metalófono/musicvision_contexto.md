# MusicVision EDU — Contexto del Proyecto

## Descripción general
Proyecto de desarrollo de aplicaciones web educativas musicales interactivas.
Dos apps desarrolladas completamente en HTML puro (sin frameworks, sin dependencias externas),
listas para abrir con doble click en cualquier navegador.

---

## App 1 — Metalófono (`metalofono_final_3.html`)

### Qué es
Simulador interactivo de un metalófono cromático de 25 notas, rango C5–A6.

### Características implementadas
- **Layout tipo instrumento real**: dos filas como un metalófono físico.
  - Fila inferior: notas naturales (Do, Re, Mi, Fa, Sol, La, Si)
  - Fila superior: notas sostenidas/bemoles, centradas entre sus naturales vecinas, igual que teclas negras de piano
- **Nombres en solfa** dentro de cada placa en bold (Do, Re, Mi...)
  - Placas sostenidas: nombre sostenido arriba (Do♯) y nombre bemol abajo (Reb), ambos dentro de la placa
- **SVG puro** para el instrumento (no Canvas ni DOM)
- **Baqueta animada** con CSS keyframes que golpea el centro de cada placa
- **Síntesis de audio** con Web Audio API: osciladores que simulan el timbre de metalófono (fundamental + armónicas 2.756x, 5.404x, 8.933x) + reverb procedural
- **Piano Roll** en Canvas que muestra notas en tiempo real
- **Carga de archivos MIDI**: parser binario nativo (sin librerías)
  - Soporta formato 0 y 1, múltiples pistas, tempo map variable
  - Lista de pistas con checkbox de mute individual
  - Botones TODAS / NINGUNA
  - Selector de pista asignada al metalófono (🎵)
  - Otras pistas suenan con síntesis GM (piano, cuerdas, etc.)
- **Scheduler lookahead** para reproducción precisa (ventana de 250ms)
- **Compresor dinámico** para evitar saturación con muchas notas
- **Teclado de computadora**: naturales en fila home (A S D F...), sostenidos en fila superior (W E T Y...)
- **Controles**: volumen, decay (resonancia), velocidad de reproducción
- **Panel inferior**: notas activas, velocidad por nota, hints de teclado

### Decisiones técnicas
- JS puro sin React ni Babel (abre directo en navegador sin internet)
- El SVG del instrumento se construye programáticamente con `createElementNS`
- La baqueta usa `transform-origin` + CSS animation con clase `.hitting` que se remueve/agrega para re-trigger
- El lookahead scheduler usa `setInterval(100ms)` + `AudioContext.currentTime` como reloj maestro

