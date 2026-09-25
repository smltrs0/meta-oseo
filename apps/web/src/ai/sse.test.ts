import { describe, expect, it, vi } from 'vitest';
import type { EventoSse } from './sse';
import { SseParser, leerEventosSse } from './sse';

const codificador = new TextEncoder();
const bytes = (texto: string) => codificador.encode(texto);

/** Procesa todo el texto de una vez. */
function analizar(texto: string): EventoSse[] {
  const parser = new SseParser();
  const eventos = parser.push(bytes(texto));
  parser.finish();
  return eventos;
}

/** Procesa el texto partido en los trozos de bytes indicados. */
function analizarEnTrozos(datos: Uint8Array, cortes: number[]): EventoSse[] {
  const parser = new SseParser();
  const eventos: EventoSse[] = [];
  let inicio = 0;
  for (const corte of [...cortes, datos.length]) {
    eventos.push(...parser.push(datos.slice(inicio, corte)));
    inicio = corte;
  }
  parser.finish();
  return eventos;
}

describe('SseParser: eventos básicos', () => {
  it('lee un evento con nombre y datos JSON', () => {
    expect(analizar('event: text\ndata: {"delta":"Hola"}\n\n')).toEqual([
      { event: 'text', data: '{"delta":"Hola"}' },
    ]);
  });

  it('lee varios eventos seguidos', () => {
    const eventos = analizar(
      'event: text\ndata: {"delta":"a"}\n\nevent: text\ndata: {"delta":"b"}\n\nevent: done\ndata: {"stop_reason":"end_turn"}\n\n',
    );
    expect(eventos.map((e) => e.event)).toEqual(['text', 'text', 'done']);
    expect(eventos[2]!.data).toBe('{"stop_reason":"end_turn"}');
  });

  it('un evento sin nombre se entrega como "message"', () => {
    expect(analizar('data: hola\n\n')).toEqual([{ event: 'message', data: 'hola' }]);
  });

  it('quita solo el primer espacio tras los dos puntos', () => {
    expect(analizar('data:sin espacio\n\n')[0]!.data).toBe('sin espacio');
    expect(analizar('data:  dos espacios\n\n')[0]!.data).toBe(' dos espacios');
  });

  it('une varias líneas data con salto de línea', () => {
    expect(analizar('event: text\ndata: linea 1\ndata: linea 2\ndata:\ndata: linea 4\n\n')).toEqual(
      [{ event: 'text', data: 'linea 1\nlinea 2\n\nlinea 4' }],
    );
  });

  it('una línea data vacía produce un evento con datos vacíos', () => {
    expect(analizar('data:\n\n')).toEqual([{ event: 'message', data: '' }]);
  });

  it('un campo sin dos puntos se toma como campo con valor vacío', () => {
    expect(analizar('data\n\n')).toEqual([{ event: 'message', data: '' }]);
  });

  it('el nombre del evento no se arrastra al siguiente', () => {
    const eventos = analizar('event: done\ndata: {}\n\ndata: {}\n\n');
    expect(eventos.map((e) => e.event)).toEqual(['done', 'message']);
  });
});

describe('SseParser: comentarios y campos', () => {
  it('ignora los comentarios (": ping") entre eventos y dentro de uno', () => {
    const eventos = analizar(
      ': ping\n\nevent: text\n: comentario intermedio\ndata: {"delta":"x"}\n\n: ping\n\n',
    );
    expect(eventos).toEqual([{ event: 'text', data: '{"delta":"x"}' }]);
  });

  it('un comentario suelto seguido de línea en blanco no produce evento', () => {
    expect(analizar(': ping\n\n')).toEqual([]);
  });

  it('una línea en blanco sin datos borra el nombre pendiente', () => {
    expect(analizar('event: fantasma\n\ndata: x\n\n')).toEqual([{ event: 'message', data: 'x' }]);
  });

  it('lee id y retry, y el id persiste entre eventos', () => {
    const eventos = analizar('id: 7\nretry: 3000\ndata: a\n\ndata: b\n\n');
    expect(eventos[0]).toEqual({ event: 'message', data: 'a', id: '7', retry: 3000 });
    expect(eventos[1]).toEqual({ event: 'message', data: 'b', id: '7' });
  });

  it('descarta un retry no numérico y un id con NUL', () => {
    const [evento] = analizar('retry: pronto\nid: a\u0000b\ndata: x\n\n');
    expect(evento).toEqual({ event: 'message', data: 'x' });
  });

  it('ignora campos desconocidos', () => {
    expect(analizar('foo: bar\ndata: x\n\n')).toEqual([{ event: 'message', data: 'x' }]);
  });

  it('descarta la marca BOM del inicio', () => {
    expect(analizar('﻿data: x\n\n')).toEqual([{ event: 'message', data: 'x' }]);
    const parser = new SseParser();
    expect(parser.push('﻿data: y\n\n')).toEqual([{ event: 'message', data: 'y' }]);
  });
});

describe('SseParser: saltos de línea', () => {
  const esperado = [
    { event: 'text', data: '{"delta":"uno"}' },
    { event: 'done', data: '{}' },
  ];

  it('LF', () => {
    expect(analizar('event: text\ndata: {"delta":"uno"}\n\nevent: done\ndata: {}\n\n')).toEqual(
      esperado,
    );
  });

  it('CRLF', () => {
    expect(
      analizar('event: text\r\ndata: {"delta":"uno"}\r\n\r\nevent: done\r\ndata: {}\r\n\r\n'),
    ).toEqual(esperado);
  });

  it('CR solo', () => {
    expect(analizar('event: text\rdata: {"delta":"uno"}\r\revent: done\rdata: {}\r\r')).toEqual(
      esperado,
    );
  });

  it('mezcla de los tres', () => {
    expect(analizar('event: text\r\ndata: {"delta":"uno"}\n\revent: done\ndata: {}\r\n\n')).toEqual(
      esperado,
    );
  });

  it('un CRLF partido entre dos trozos no genera una línea en blanco de más', () => {
    const parser = new SseParser();
    // "data: a\r" | "\ndata: b\r\n" | "\r\n"  ->  un solo evento con dos líneas de datos.
    const eventos = [
      ...parser.push('data: a\r'),
      ...parser.push('\ndata: b\r\n'),
      ...parser.push('\r\n'),
    ];
    expect(eventos).toEqual([{ event: 'message', data: 'a\nb' }]);
  });

  it('un CR al final de un trozo seguido de otra línea (no LF) cuenta como terminador', () => {
    const parser = new SseParser();
    const eventos = [...parser.push('data: a\r'), ...parser.push('data: b\r\r')];
    expect(eventos).toEqual([{ event: 'message', data: 'a\nb' }]);
  });
});

describe('SseParser: fragmentación', () => {
  const flujo =
    ': ping\n\n' +
    'event: text\r\ndata: {"delta":"Los osteoclastos "}\r\n\r\n' +
    'event: text\rdata: {"delta":"resorben hueso ñandú 🦴 y café"}\r\r' +
    'event: usage\ndata: {"input_tokens":10,\ndata: "output_tokens":5}\n\n' +
    'event: done\ndata: {"stop_reason":"end_turn"}\n\n';
  const datos = bytes(flujo);
  const completo = analizar(flujo);

  it('el flujo completo produce los cuatro eventos esperados', () => {
    expect(completo.map((e) => e.event)).toEqual(['text', 'text', 'usage', 'done']);
    expect(completo[1]!.data).toContain('ñandú 🦴 y café');
    expect(completo[2]!.data).toBe('{"input_tokens":10,\n"output_tokens":5}');
  });

  it('da el mismo resultado partiendo el flujo en cualquier byte (2 trozos)', () => {
    for (let corte = 0; corte <= datos.length; corte++) {
      expect(analizarEnTrozos(datos, [corte])).toEqual(completo);
    }
  });

  it('da el mismo resultado con trozos de 1 byte (parte también los multibyte)', () => {
    const cortes = Array.from({ length: datos.length - 1 }, (_, i) => i + 1);
    expect(analizarEnTrozos(datos, cortes)).toEqual(completo);
  });

  it('da el mismo resultado con trozos de tamaño pseudoaleatorio', () => {
    // Generador determinista para que la prueba sea reproducible.
    let semilla = 12345;
    const azar = () => {
      semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
      return semilla / 0x7fffffff;
    };
    for (let intento = 0; intento < 50; intento++) {
      const cortes: number[] = [];
      let pos = 0;
      while (pos < datos.length) {
        pos += 1 + Math.floor(azar() * 12);
        if (pos < datos.length) cortes.push(pos);
      }
      expect(analizarEnTrozos(datos, cortes)).toEqual(completo);
    }
  });

  it('un carácter UTF-8 de 4 bytes (emoji) partido en cada posición se reconstruye', () => {
    const emoji = bytes('data: 🦴\n\n');
    const inicio = emoji.indexOf(0xf0); // primer byte del emoji
    for (let corte = inicio + 1; corte < inicio + 4; corte++) {
      expect(analizarEnTrozos(emoji, [corte])).toEqual([{ event: 'message', data: '🦴' }]);
    }
  });

  it('una línea partida a mitad de palabra no emite nada hasta completarse', () => {
    const parser = new SseParser();
    expect(parser.push('event: te')).toEqual([]);
    expect(parser.push('xt\ndata: {"del')).toEqual([]);
    expect(parser.push('ta":"ok"}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ event: 'text', data: '{"delta":"ok"}' }]);
  });

  it('acepta trozos de texto además de bytes', () => {
    const parser = new SseParser();
    expect(parser.push('data: a\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ event: 'message', data: 'a' }]);
  });

  it('un trozo vacío no altera el estado', () => {
    const parser = new SseParser();
    parser.push('data: a\r');
    expect(parser.push(new Uint8Array(0))).toEqual([]);
    expect(parser.push('\n\n')).toEqual([{ event: 'message', data: 'a' }]);
  });
});

describe('SseParser: fin de flujo', () => {
  it('descarta el evento incompleto (sin línea en blanco final)', () => {
    expect(analizar('event: text\ndata: {"delta":"a"}\n\nevent: done\ndata: {}\n')).toEqual([
      { event: 'text', data: '{"delta":"a"}' },
    ]);
  });

  it('descarta también una línea sin terminador', () => {
    expect(analizar('event: text\ndata: {"delta":"a"}\n\nevent: done\ndata: {}')).toEqual([
      { event: 'text', data: '{"delta":"a"}' },
    ]);
  });

  it('finish() deja el parser limpio para reutilizarlo', () => {
    const parser = new SseParser();
    parser.push('event: text\ndata: incompleto');
    parser.finish();
    expect(parser.push('data: nuevo\n\n')).toEqual([{ event: 'message', data: 'nuevo' }]);
  });
});

describe('leerEventosSse', () => {
  function flujoDe(trozos: string[]): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      start(controlador) {
        for (const t of trozos) controlador.enqueue(bytes(t));
        controlador.close();
      },
    });
  }

  it('produce los eventos de un flujo partido en trozos', async () => {
    const eventos: EventoSse[] = [];
    const flujo = flujoDe([
      'event: te',
      'xt\ndata: {"delta":"a"}\n',
      '\n: ping\n\nevent: done\ndata: {}\n\n',
    ]);
    for await (const evento of leerEventosSse(flujo)) eventos.push(evento);
    expect(eventos.map((e) => e.event)).toEqual(['text', 'done']);
  });

  it('cancela el flujo si quien consume abandona el bucle', async () => {
    const cancelado = vi.fn();
    const flujo = new ReadableStream<Uint8Array>({
      pull(controlador) {
        controlador.enqueue(bytes('data: x\n\n'));
      },
      cancel: cancelado,
    });
    for await (const evento of leerEventosSse(flujo)) {
      expect(evento.data).toBe('x');
      break;
    }
    await vi.waitFor(() => expect(cancelado).toHaveBeenCalledTimes(1));
  });

  it('propaga el error del flujo (red caída) a quien consume', async () => {
    const flujo = new ReadableStream<Uint8Array>({
      start(controlador) {
        controlador.enqueue(bytes('data: a\n\n'));
        controlador.error(new TypeError('network error'));
      },
    });
    const eventos: EventoSse[] = [];
    await expect(
      (async () => {
        for await (const evento of leerEventosSse(flujo)) eventos.push(evento);
      })(),
    ).rejects.toThrow('network error');
  });
});
