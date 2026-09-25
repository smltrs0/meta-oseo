// @vitest-environment node
/**
 * Prueba de integración de `useMentor` contra un servidor HTTP real (Node) que emite SSE con el
 * formato del contrato: TCP de verdad, `fetch` de verdad (undici), trozos que llegan con retraso y
 * partidos a mitad de línea y de carácter, y cancelación real con `AbortController`.
 *
 * No es el backend FastAPI (lo escribe otro agente y se prueba de extremo a extremo después);
 * comprueba que el cliente se comporta bien con un transporte real y no solo con `Response`
 * simuladas en memoria.
 */
import { createPinia, setActivePinia } from 'pinia';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { usuarioDePrueba } from '@/test/utils';
import { PING, sseFin, sseTexto, sseUso } from './pruebas';
import { useMentor } from './useMentor';

/*
 * tsconfig.app.json no incluye los tipos de Node (la app corre en el navegador) y este archivo
 * entra en su typecheck, así que `node:http` se importa de forma dinámica y se tipa con las
 * interfaces mínimas que se usan aquí, en vez de importar @types/node para toda la app.
 */
interface SocketNode {
  destroy(): void;
}
interface PeticionNode {
  headers: Record<string, string | string[] | undefined>;
  socket: SocketNode;
  on(evento: 'data', cb: (trozo: Uint8Array) => void): void;
  on(evento: 'end', cb: () => void): void;
}
interface RespuestaNode {
  writableFinished: boolean;
  writeHead(estado: number, cabeceras: Record<string, string>): void;
  write(trozo: string | Uint8Array): void;
  end(trozo?: string): void;
  on(evento: 'close', cb: () => void): void;
}
interface ServidorNode {
  listen(puerto: number, host: string, cb: () => void): void;
  address(): { port: number };
  close(cb: () => void): void;
  closeAllConnections(): void;
}
interface HttpNode {
  createServer(cb: (req: PeticionNode, res: RespuestaNode) => void): ServidorNode;
}

type Manejador = (req: PeticionNode, res: RespuestaNode, cuerpo: string) => void;

const codificador = new TextEncoder();
const decodificador = new TextDecoder();

let servidor: ServidorNode;
let base = '';
let manejador: Manejador = () => undefined;
const fetchReal = globalThis.fetch;

/** Lo que el "backend" vio en la última petición. */
const visto = { autorizacion: '', cuerpo: '' as string, clienteDesconectado: false };

beforeAll(async () => {
  const nombreModulo = 'node:http';
  const { createServer } = (await import(/* @vite-ignore */ nombreModulo)) as HttpNode;
  servidor = createServer((req, res) => {
    let cuerpo = '';
    req.on('data', (trozo) => (cuerpo += decodificador.decode(trozo, { stream: true })));
    req.on('end', () => {
      visto.autorizacion = String(req.headers.authorization ?? '');
      visto.cuerpo = cuerpo;
      // "close" en la respuesta = el cliente cortó la conexión antes de que termináramos.
      res.on('close', () => {
        if (!res.writableFinished) visto.clienteDesconectado = true;
      });
      manejador(req, res, cuerpo);
    });
  });
  await new Promise<void>((resolver) => servidor.listen(0, '127.0.0.1', resolver));
  base = `http://127.0.0.1:${servidor.address().port}`;
});

afterAll(async () => {
  servidor.closeAllConnections();
  await new Promise<void>((resolver) => servidor.close(() => resolver()));
});

beforeEach(() => {
  setActivePinia(createPinia());
  visto.autorizacion = '';
  visto.cuerpo = '';
  visto.clienteDesconectado = false;
  // El cliente usa rutas relativas ("/api/chat"); en Node hay que anteponer el origen.
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => fetchReal(base + url, init));
});

function crear() {
  const auth = useAuthStore();
  auth.token = 'jwt-real';
  auth.establecerUsuario(usuarioDePrueba());
  return effectScope().run(() => useMentor())!;
}

const CABECERAS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'X-Accel-Buffering': 'no',
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('useMentor sobre HTTP real', () => {
  it('recibe un stream con retrasos, ping, CRLF y un carácter multibyte partido entre escrituras', async () => {
    manejador = (_req, res) => {
      res.writeHead(200, CABECERAS);
      void (async () => {
        res.write(PING);
        await esperar(5);
        // Evento con CRLF, partido a mitad de línea.
        const primero = sseTexto('Los osteoclastos ').replace(/\n/g, '\r\n');
        res.write(primero.slice(0, 12));
        await esperar(5);
        res.write(primero.slice(12));
        await esperar(5);
        // "🦴" (4 bytes UTF-8) partido en dos escrituras TCP.
        const hueso = codificador.encode(sseTexto('resorben 🦴 y ñandú.'));
        const corte = hueso.indexOf(0xf0) + 2;
        res.write(hueso.subarray(0, corte));
        await esperar(5);
        res.write(hueso.subarray(corte));
        await esperar(5);
        res.write(sseUso(50, 12, 40, 5) + sseFin());
        res.end();
      })();
    };
    const mentor = crear();

    await mentor.enviar('¿Qué hacen los osteoclastos?');

    expect(mentor.mensajes.value[1]).toMatchObject({
      role: 'assistant',
      content: 'Los osteoclastos resorben 🦴 y ñandú.',
      status: 'completo',
    });
    expect(mentor.fase.value).toBe('idle');
    expect(mentor.error.value).toBeNull();
    expect(mentor.uso.value).toEqual({
      input_tokens: 50,
      output_tokens: 12,
      cache_read_input_tokens: 40,
      cache_creation_input_tokens: 5,
    });
    // Lo que llegó al servidor: token y cuerpo según el contrato.
    expect(visto.autorizacion).toBe('Bearer jwt-real');
    const cuerpo = JSON.parse(visto.cuerpo);
    expect(cuerpo.messages).toEqual([{ role: 'user', content: '¿Qué hacen los osteoclastos?' }]);
    expect(cuerpo.contexto).toMatchObject({ modulo: 1, nivel: 'pregrado' });
  });

  it('detener() corta la conexión de verdad: el servidor detecta la desconexión', async () => {
    manejador = (_req, res) => {
      res.writeHead(200, CABECERAS);
      res.write(sseTexto('Empiezo…'));
      // No termina nunca: la respuesta queda abierta hasta que el cliente se vaya.
    };
    const mentor = crear();
    const envio = mentor.enviar('hola');
    await vi.waitFor(() => expect(mentor.mensajes.value[1]?.content).toBe('Empiezo…'));

    mentor.detener();
    await envio;

    expect(mentor.mensajes.value[1]).toMatchObject({ content: 'Empiezo…', status: 'interrumpido' });
    expect(mentor.fase.value).toBe('idle');
    await vi.waitFor(() => expect(visto.clienteDesconectado).toBe(true), { timeout: 3000 });
  });

  it('el servidor cierra sin done ni error: queda interrumpido y reintentable', async () => {
    manejador = (_req, res) => {
      res.writeHead(200, CABECERAS);
      res.write(sseTexto('Se corta aquí'));
      res.end(); // sin evento terminal
    };
    const mentor = crear();
    await mentor.enviar('hola');
    expect(mentor.mensajes.value[1]).toMatchObject({
      content: 'Se corta aquí',
      status: 'interrumpido',
    });
    expect(mentor.fase.value).toBe('error');
    expect(mentor.puedeReintentar.value).toBe(true);
  });

  it('el servidor destruye el socket a mitad del stream: interrumpido con aviso genérico', async () => {
    manejador = (req, res) => {
      res.writeHead(200, CABECERAS);
      res.write(sseTexto('Antes del corte'));
      setTimeout(() => req.socket.destroy(), 20);
    };
    const mentor = crear();
    await mentor.enviar('hola');
    expect(mentor.mensajes.value[1]).toMatchObject({
      content: 'Antes del corte',
      status: 'interrumpido',
    });
    expect(mentor.error.value).toMatch(/se interrumpió/);
    expect(mentor.error.value).not.toMatch(/socket|terminated|fetch/i);
  });

  it('503 ia_no_configurada llega como JSON antes de abrir el stream', async () => {
    manejador = (_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ detail: { code: 'ia_no_configurada', message: 'IA no configurada' } }),
      );
    };
    const mentor = crear();
    await mentor.enviar('hola');
    expect(mentor.error.value).toBe('El mentor no está disponible por ahora.');
    expect(mentor.puedeReintentar.value).toBe(false);
    expect(mentor.mensajes.value.at(-1)).toMatchObject({ role: 'assistant', status: 'error' });
  });

  it('no se puede enviar dos veces a la vez: el servidor recibe una sola petición', async () => {
    let peticiones = 0;
    manejador = (_req, res) => {
      peticiones += 1;
      res.writeHead(200, CABECERAS);
      setTimeout(() => {
        res.write(sseTexto('listo') + sseFin());
        res.end();
      }, 30);
    };
    const mentor = crear();
    const primero = mentor.enviar('uno');
    const segundo = await mentor.enviar('dos');
    await primero;
    expect(segundo).toBe(false);
    expect(peticiones).toBe(1);
  });
});
