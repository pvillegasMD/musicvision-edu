# MusicVision EDU — Contexto del Proyecto

## Descripción general
Proyecto de desarrollo de aplicaciones web educativas musicales interactivas.
App desarrollada completamente en HTML puro (sin frameworks, sin dependencias externas),
listas para abrir con doble click en cualquier navegador.


## App — HarmonySync (`harmonysync_11.html`)

### Qué es
Visualizador de acordes MIDI sincronizado con un diapasón de guitarra horizontal.
El usuario carga un MIDI, escribe acordes en una plantilla de compases, y durante
la reproducción el diapasón muestra automáticamente cómo tocar cada acorde.

### Características implementadas

#### Análisis MIDI
- Parser binario nativo (sin librerías)
- Detecta: compases totales, BPM, métricas (4/4, 3/4, 6/8, etc.), tempo map variable
- Genera plantilla de compases con slots según la métrica:
  - 4/4 → 4 slots | 3/4 → 3 | 6/8 → 2 | 9/8 → 3 | 12/8 → 4

#### Editor de acordes
- Click en slot → input de texto (Am, Fmaj7, G/B, Dsus4, etc.)
- Tab para navegar entre slots
- **Herencia de acordes**: slots vacíos heredan el último acorde ingresado (se muestra en gris punteado con ↓)
- **NC** = silencio (no chord) — muestra X en el diapasón
- Validación de acordes en tiempo real

#### Timeline
- Scroll horizontal con todos los compases
- **Centrado automático**: el compás activo siempre queda en el centro del viewport
- Primer compás centrado al cargar
- Zoom in/out

#### Diapasón de guitarra SVG
- **Orientación**: mástil horizontal, clavijero a la derecha (rotado 180°)
- **Cuerdas**: E grave arriba, e aguda abajo (perspectiva del guitarrista)
- **Clavijero** con clavijas decorativas a la derecha
- Cejuela, trastes, marcadores de posición (3,5,7,9,12)
- Cuerdas al aire (○), cuerdas muteadas (✕), notas pulsadas (●) con número de dedo
- Cejillas (barre) en azul
- **Número romano** debajo de la cejilla (relativo al capo si hay capo)
- Variantes de posición para acordes con múltiples digitaciones

#### Sistema de Capo
- Selector en topbar (Sin capo / Traste I al XI)
- Con capo: el clavijero desaparece y es reemplazado por la barra del capo (amarilla, con tornillos decorativos y número romano)
- La ventana visible del diapasón empieza en el traste del capo
- **Transposición automática**: el usuario escribe el acorde real que quiere que suene, la app calcula la forma a tocar
  - Ej: Capo 2 + acorde "B" → muestra forma "A"
  - Ej: Capo 2 + acorde "C" → muestra forma "A#" con cejilla I relativa al capo
- Etiqueta doble: nombre real + forma a tocar en amarillo
- Cuerdas al aire no se muestran con capo (el capo las cubre)
- Número romano relativo al capo (no al clavijero)

#### Reproducción
- Play/Pause/Stop
- Barra de progreso con seek por click
- Control de velocidad (0.25x a 2x)
- **Sincronización**: usa `AudioContext.currentTime` como reloj maestro para audio Y visual
- **Scheduler lookahead** (250ms) para audio preciso
- Panel de pistas con mute individual (botón 🎛 PISTAS)
- **Síntesis GM por familia**: piano, cuerdas, metales, maderas, bajo, órgano, etc.
- **Compresor dinámico** para evitar saturación

#### Exportar
- PDF: genera ventana con todos los compases y acordes lista para imprimir

### Base de datos de acordes
- ~60 acordes con digitaciones estándar (abiertos y cejilla)
- Formato: `{pos:[...], fi:[...], base:N, barre?:{fret,from,to}}`
- `pos`: posición por cuerda (-1=mute, 0=aire, N=traste)
- `fi`: número de dedo por cuerda

### Decisiones técnicas
- JS puro sin frameworks (abre directo en navegador)
- SVG construido programáticamente
- Todo el diapasón está en un `<g transform="rotate(180)">` para el giro 180°
- Los textos tienen contra-rotación individual para leerse correctamente
- `windowStart = capo > 0 ? capo : baseFret` unifica toda la lógica de posicionamiento

---

## Stack tecnológico (ambas apps)
- **HTML + CSS + JS puro** — sin React, sin Node, sin npm
- **Web Audio API** — síntesis de audio y scheduling
- **SVG** — instrumentos visuales
- **Canvas** — piano roll
- **FileReader API** — carga de archivos MIDI
- **Parser MIDI binario** propio — DataView, sin librerías

---

## Archivos del proyecto
| Archivo | Descripción |
|---|---|
| `metalofono_final_3.html` | App del metalófono completa |
| `harmonysync_11.html` | App del visualizador de acordes |
| `musicvision_contexto.md` | Este archivo de contexto |

---

## Pendiente / Ideas para continuar
- HarmonySync: agregar más acordes a la base de datos
- HarmonySync: modo de edición del diapasón (digitaciones personalizadas)
- HarmonySync: exportar video sincronizado
- HarmonySync: detectar acordes automáticamente desde las notas MIDI
- Metalófono: modo educativo con puntuación
- Metalófono: notación musical (pentagrama) sincronizada
- Integrar ambas apps en una sola plataforma

---

## Cómo retomar el trabajo
1. Pegá este archivo al inicio de la conversación
2. Adjuntá el HTML de la app que querés modificar
3. Describí el cambio que necesitás

El asistente puede leer el HTML, identificar el código relevante y hacer cambios precisos con `str_replace`.
