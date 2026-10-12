# Visión futura: plugin/app de detección rápida de desafinación para producción musical

## Estado

**Idea capturada, no en desarrollo.** Este documento existe para no perder el contexto de una conversación de brainstorming (2026-09-23) que surgió mientras se diseñaba la herramienta de evaluación en clase de "App voz" (ver `2026-09-23-app-voz-herramienta-evaluacion-design.md` — o el spec equivalente una vez escrito). Es un proyecto separado, con su propio ciclo de diseño cuando se retome. No hereda decisiones de la herramienta de evaluación más allá del algoritmo central descrito abajo.

## Origen de la idea

Al diseñar la herramienta de evaluación en clase (grabar canto en vivo sin pista de acompañamiento, con tempo humano variable, y comparar contra un MIDI de referencia estirando su tempo para que calce), surgió la pregunta: ¿podría este mismo mecanismo — comparar una interpretación cantada contra una referencia y detectar qué tan afinada estuvo cada nota — servirle a alguien que trabaja con **muchas voces grabadas a la vez** (una sesión de estudio con 8, 16 o más pistas de cantantes) para **ubicar rápidamente cuál voz desafinó**, sin tener que escuchar pista por pista a mano?

El usuario planteó específicamente: ofrecer esto a una empresa de tecnología musical, o como herramienta para productores musicales que trabajan con muchos cantantes (inputs) simultáneos y quieren hacer correcciones de pitch — la app ahorraría tiempo de escucha al señalar directamente la voz desafinada. El usuario también intuye que "hay más aplicaciones para una app como esta", sin especificar cuáles — queda abierto para explorar cuando se retome la idea.

## Por qué esto NO es una extensión de la app HTML actual

Es un producto distinto, con requisitos técnicos que el navegador web no puede cumplir:

- **Límite real de canales**: `getUserMedia`/Web Audio API da acceso confiable a como máximo ~2 canales por dispositivo de audio, sin importar cuántas entradas físicas tenga la interfaz. Una sesión de estudio con 16 pistas simultáneas está fuera de alcance para cualquier página web.
- **Integración con el flujo de trabajo real del productor**: un productor trabaja dentro de su DAW (Pro Tools, Logic, Ableton, etc.), no en una pestaña de navegador aparte. El formato natural para este producto es un **plugin de DAW (VST3/AU)**, no una app standalone ni una página web.
- **Precisión/latencia de audio**: un motor de audio nativo (Core Audio en macOS, ASIO en Windows) da latencia y precisión muy superiores a lo que el navegador puede ofrecer — relevante para un producto que se vendería como herramienta profesional.

## Comparación técnica (resumen de la conversación)

| | Web/HTML | App nativa / plugin de DAW |
|---|---|---|
| Instalación | Cero fricción — abrir en el navegador | Instalador, firma de código, posible notarización |
| Canales simultáneos | ~2 por dispositivo (límite del navegador) | Todos los que tenga la interfaz |
| Integración con DAW | Imposible | Posible como plugin VST3/AU |
| Latencia/precisión | Aceptable para uso educativo | Nivel profesional |
| Velocidad de desarrollo | Rápida (ya hay una base de código) | Lenta — otro lenguaje/ecosistema (C++/JUCE para plugin multiplataforma, o Swift solo para Mac), meses de trabajo, no sesiones |
| Credibilidad como producto profesional | Baja para venderlo a una empresa de audio | Alta — es el formato esperado por ingenieros/productores |

**Interfaces de audio mencionadas como referencia real** (contexto del usuario, útil para entender qué hardware debería soportar un futuro plugin):
- PreSonus AudioBox — 2 entradas (Input 1, Input 2)
- Focusrite Saffire Pro 24 — Input 1-4, ADAT, S/PDIF (multicanal real, solo accesible vía Core Audio nativo, no desde un navegador)
- Behringer XENYX X2442USB — mezcladora con 16 entradas físicas pero que solo manda 2 canales (L/R) por USB como "USB Audio Codec"

## El algoritmo central (lo que sí es reutilizable, sea cual sea la plataforma final)

Independiente de la plataforma, el valor central de la idea es el mismo algoritmo que se está construyendo para la herramienta de evaluación en clase de App voz:

1. **Detección automática de inicio/fin de una interpretación cantada** dentro de una grabación continua, vía análisis de silencio (sin necesidad de que alguien marque manualmente dónde empieza el canto).
2. **Ajuste de tempo entre una referencia fija (MIDI) y una interpretación humana de tempo variable** — un factor de estiramiento global que preserva las proporciones rítmicas del MIDI pero calza su duración total con lo efectivamente interpretado.
3. **Juzgamiento de afinación nota por nota** contra la referencia ajustada, reutilizando lógica de cents-de-diferencia y tolerancia (`centsOffTarget`, `isInTune` en el código actual de App voz) para determinar, por cada nota, si estuvo afinada o no.
4. **Salida visual simple**: qué nota/qué pista estuvo desafinada, de un vistazo — en la herramienta de clase es un SVG con notas en verde/rojo; en un plugin de producción probablemente sería un indicador por pista/canal (qué pista(s) tienen más notas rojas) para priorizar qué escuchar primero.

Este algoritmo se está validando primero en la herramienta de evaluación en clase (más simple, un solo canal, sin presión de tiempo real) antes de pensar en construirlo para un motor de audio nativo multicanal.

## Decisión tomada (2026-09-23)

Seguir con la herramienta de evaluación en clase en HTML (alcance de hasta 2 canales por dispositivo, cubre el caso real del usuario con la Behringer XENYX). La idea de plugin/producto comercial queda pausada, para retomarse como un proyecto de diseño completamente aparte — con su propio ciclo de brainstorming, decisión de stack (probablemente C++/JUCE para VST3/AU multiplataforma, o Swift si se limita a Mac/AU), y sin heredar código de la app HTML más allá de la lógica del algoritmo como referencia conceptual.

## Preguntas abiertas para cuando se retome

- ¿Cuáles son las "más aplicaciones" que el usuario intuye para esta idea, más allá de detectar la voz desafinada en una sesión multipista?
- ¿Plugin (VST3/AU, vive dentro de una DAW) o app standalone con acceso directo a la interfaz de audio? Cada uno tiene implicancias de distribución y esfuerzo muy distintas.
- ¿Apuntar a macOS solamente (más simple, Swift + Core Audio + AU) o multiplataforma (Windows también, lo que empuja hacia C++/JUCE y VST3)?
- ¿Es una idea para explorar como negocio propio, o para ofrecer/vender a una empresa de tecnología musical existente? Esto cambia bastante el enfoque (producto propio vs. propuesta/demo para pitchear).
