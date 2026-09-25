/**
 * Parser de Server-Sent Events, puro y sin dependencias (F1-13).
 *
 * Implementa el algoritmo de interpretación de https://html.spec.whatwg.org/multipage/server-sent-events.html
 * sobre un flujo de bytes o de texto que llega en trozos de tamaño arbitrario:
 *
 * - Los trozos pueden partir un evento, una línea o incluso un carácter UTF-8 multibyte
 *   (`TextDecoder` con `stream: true` retiene los bytes incompletos hasta el siguiente trozo).
 * - Fin de línea LF, CRLF o CR. Un CR al final de un trozo puede ser la mitad de un CRLF: se
 *   recuerda para descartar el LF que llegue después.
 * - Las líneas que empiezan por ":" son comentarios (`: ping` de keep-alive) y se ignoran.
 * - Varias líneas `data:` de un mismo evento se unen con "\n".
 * - Campos reconocidos: `event`, `data`, `id`, `retry`. Los demás se ignoran.
 * - Un evento sin `event:` se entrega con el nombre "message".
 * - Al terminar el flujo, un evento incompleto (sin la línea en blanco final) se descarta.
 *
 * `useMentor` no usa `EventSource` porque no permite POST ni cabeceras (Authorization).
 */

export interface EventoSse {
  /** Nombre del evento (`text`, `done`...). "message" si el servidor no lo indicó. */
  event: string;
  /** Cuerpo del evento; las líneas `data:` múltiples van unidas con "\n". */
  data: string;
  /** Último `id:` recibido en el flujo (persiste entre eventos, como pide la especificación). */
  id?: string;
  /** Valor de `retry:` (milisegundos) si venía en este evento. */
  retry?: number;
}

export class SseParser {
  private readonly decoder = new TextDecoder('utf-8');
  /** Texto de una línea que aún no terminó. */
  private pendiente = '';
  /** El último terminador fue un CR al final de un trozo: si el siguiente empieza por LF, se salta. */
  private saltarLf = false;
  private primerTrozo = true;

  // Evento en construcción.
  private nombre = '';
  private lineasDatos: string[] = [];
  private retry: number | undefined;
  private ultimoId = '';

  /**
   * Procesa un trozo del flujo y devuelve los eventos que quedaron completos con él
   * (posiblemente ninguno). Acepta bytes (lo normal, desde `ReadableStream`) o texto.
   */
  push(trozo: Uint8Array | string): EventoSse[] {
    let texto = typeof trozo === 'string' ? trozo : this.decoder.decode(trozo, { stream: true });

    if (this.primerTrozo && texto.length > 0) {
      this.primerTrozo = false;
      // La marca de orden de bytes (BOM) del inicio no es parte del contenido.
      if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
    }
    if (this.saltarLf && texto.length > 0) {
      this.saltarLf = false;
      if (texto.charCodeAt(0) === 0x0a) texto = texto.slice(1);
    }

    const eventos: EventoSse[] = [];
    const todo = this.pendiente + texto;
    let inicio = 0;
    for (let i = 0; i < todo.length; i++) {
      const c = todo.charCodeAt(i);
      if (c !== 0x0a && c !== 0x0d) continue;
      const linea = todo.slice(inicio, i);
      if (c === 0x0d) {
        if (i + 1 < todo.length) {
          if (todo.charCodeAt(i + 1) === 0x0a) i++; // CRLF
        } else {
          this.saltarLf = true; // CR al final del trozo: quizá el LF llega en el siguiente
        }
      }
      inicio = i + 1;
      this.procesarLinea(linea, eventos);
    }
    this.pendiente = todo.slice(inicio);
    return eventos;
  }

  /**
   * Fin del flujo: descarta lo incompleto (línea sin terminar o evento sin línea en blanco)
   * y deja el parser listo para reutilizarse.
   */
  finish(): void {
    this.decoder.decode(); // vacía los bytes multibyte retenidos
    this.pendiente = '';
    this.saltarLf = false;
    this.primerTrozo = true;
    this.reiniciarEvento();
    this.ultimoId = '';
  }

  private reiniciarEvento(): void {
    this.nombre = '';
    this.lineasDatos = [];
    this.retry = undefined;
  }

  private procesarLinea(linea: string, salida: EventoSse[]): void {
    if (linea === '') {
      this.despachar(salida);
      return;
    }
    if (linea.charCodeAt(0) === 0x3a) return; // ":" -> comentario

    const dosPuntos = linea.indexOf(':');
    let campo: string;
    let valor: string;
    if (dosPuntos === -1) {
      campo = linea;
      valor = '';
    } else {
      campo = linea.slice(0, dosPuntos);
      valor = linea.slice(dosPuntos + 1);
      if (valor.charCodeAt(0) === 0x20) valor = valor.slice(1); // un solo espacio inicial
    }

    switch (campo) {
      case 'event':
        this.nombre = valor;
        break;
      case 'data':
        this.lineasDatos.push(valor);
        break;
      case 'id':
        if (!valor.includes('\u0000')) this.ultimoId = valor;
        break;
      case 'retry':
        if (/^\d+$/.test(valor)) this.retry = Number(valor);
        break;
      default:
        break; // campo desconocido: se ignora
    }
  }

  private despachar(salida: EventoSse[]): void {
    if (this.lineasDatos.length === 0) {
      // Línea en blanco sin `data:`: no hay evento (p. ej. tras un comentario).
      this.reiniciarEvento();
      return;
    }
    const evento: EventoSse = {
      event: this.nombre || 'message',
      data: this.lineasDatos.join('\n'),
    };
    if (this.ultimoId) evento.id = this.ultimoId;
    if (this.retry !== undefined) evento.retry = this.retry;
    salida.push(evento);
    this.reiniciarEvento();
  }
}

/**
 * Lee un `ReadableStream` de bytes (el `body` de una `Response`) y produce sus eventos SSE.
 * Si quien consume abandona el bucle (`break`, `return`) o el flujo falla, se cancela el lector
 * para que la conexión se libere.
 */
export async function* leerEventosSse(
  cuerpo: ReadableStream<Uint8Array>,
): AsyncGenerator<EventoSse> {
  const lector = cuerpo.getReader();
  const parser = new SseParser();
  try {
    while (true) {
      const { done, value } = await lector.read();
      if (done) break;
      for (const evento of parser.push(value)) yield evento;
    }
  } finally {
    parser.finish();
    // Sin await: cancelar no debe poder bloquear el cierre. Si el flujo ya terminó o falló,
    // `cancel()` rechaza o no hace nada; el error no interesa.
    void lector.cancel().catch(() => undefined);
  }
}
