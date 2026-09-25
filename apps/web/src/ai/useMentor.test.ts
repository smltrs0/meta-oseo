import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { MENSAJE_SIN_CONEXION } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useContextoStore } from '@/stores/contextoPedagogico';
import { useProgresoStore } from '@/stores/progreso';
import { respuestaError, usuarioDePrueba } from '@/test/utils';
import type { FlujoControlable } from './pruebas';
import {
  PING,
  eventoSse,
  flujoControlable,
  respuestaSse,
  respuestaSseQueFalla,
  sseError,
  sseFin,
  sseTexto,
  sseUso,
} from './pruebas';
import type { MensajeMentor } from './useMentor';
import { MAX_CARACTERES, MAX_MENSAJES, construirHistorial, useMentor } from './useMentor';

const fetchMock = vi.fn<typeof fetch>();

function crear() {
  const auth = useAuthStore();
  auth.token = 'tok-123';
  auth.establecerUsuario(usuarioDePrueba());
  const scope = effectScope();
  const mentor = scope.run(() => useMentor())!;
  return { mentor, auth, scope };
}

/** Cuerpo JSON de la petición número `n` (0 = la primera) a /api/chat. */
function cuerpoEnviado(n = 0): {
  messages: { role: string; content: string }[];
  contexto: unknown;
} {
  return JSON.parse(String(fetchMock.mock.calls[n]![1]!.body));
}

function mensaje(
  role: 'user' | 'assistant',
  content: string,
  status: MensajeMentor['status'] = 'completo',
) {
  return { id: `${role}-${content.slice(0, 8)}`, role, content, status } satisfies MensajeMentor;
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('construirHistorial', () => {
  it('descarta mensajes vacíos y en curso, y recorta cada texto a 8000 caracteres', () => {
    const historial = construirHistorial([
      mensaje('user', 'hola'),
      mensaje('assistant', 'x'.repeat(9000), 'interrumpido'),
      mensaje('user', 'otra'),
      mensaje('assistant', '', 'error'),
      mensaje('assistant', '   ', 'transmitiendo'),
    ]);
    expect(historial.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(historial[1]!.content).toHaveLength(MAX_CARACTERES);
  });

  it('el recorte no parte un emoji (cuenta puntos de código)', () => {
    const historial = construirHistorial([
      mensaje('assistant', '🦴'.repeat(9000)),
      mensaje('user', 'q'),
    ]);
    // El primer mensaje del mentor se quita por ir antes del primero del estudiante.
    expect(historial).toEqual([{ role: 'user', content: 'q' }]);
    const conUsuario = construirHistorial([
      mensaje('user', 'a'),
      mensaje('assistant', '🦴'.repeat(9000)),
    ]);
    expect(Array.from(conUsuario[1]!.content)).toHaveLength(MAX_CARACTERES);
    expect(conUsuario[1]!.content.endsWith('🦴')).toBe(true);
  });

  it('conserva los 40 más recientes y no empieza con una respuesta del mentor', () => {
    const muchos: MensajeMentor[] = [];
    for (let i = 0; i < 60; i++) {
      muchos.push(mensaje(i % 2 === 0 ? 'user' : 'assistant', `mensaje ${i}`));
    }
    muchos.push(mensaje('user', 'ultimo'));
    const historial = construirHistorial(muchos);
    expect(historial.length).toBeLessThanOrEqual(MAX_MENSAJES);
    expect(historial[0]!.role).toBe('user');
    expect(historial.at(-1)).toEqual({ role: 'user', content: 'ultimo' });
  });
});

describe('useMentor: respuesta correcta', () => {
  it('pasa por thinking y streaming, acumula el texto y termina en idle', async () => {
    let flujo!: FlujoControlable;
    fetchMock.mockImplementation((_url, init) => {
      flujo = flujoControlable(init?.signal);
      return Promise.resolve(flujo.respuesta);
    });
    const { mentor } = crear();

    const envio = mentor.enviar('¿Qué hacen los osteoclastos?');
    expect(mentor.fase.value).toBe('thinking');
    expect(mentor.ocupado.value).toBe(true);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Aparecen el mensaje del estudiante y el del mentor (vacío, en curso).
    expect(mentor.mensajes.value.map((m) => [m.role, m.status])).toEqual([
      ['user', 'completo'],
      ['assistant', 'transmitiendo'],
    ]);

    flujo.enviar(PING + sseTexto('Los osteoclastos '));
    await vi.waitFor(() => expect(mentor.fase.value).toBe('streaming'));
    expect(mentor.mensajes.value[1]!.content).toBe('Los osteoclastos ');
    expect(mentor.mensajes.value[1]!.status).toBe('transmitiendo');

    flujo.enviar(sseTexto('resorben hueso.') + sseUso(120, 30, 100, 20) + sseFin());
    expect(await envio).toBe(true);

    expect(mentor.fase.value).toBe('idle');
    expect(mentor.error.value).toBeNull();
    expect(mentor.mensajes.value[1]).toMatchObject({
      role: 'assistant',
      content: 'Los osteoclastos resorben hueso.',
      status: 'completo',
    });
    expect(mentor.uso.value).toEqual({
      input_tokens: 120,
      output_tokens: 30,
      cache_read_input_tokens: 100,
      cache_creation_input_tokens: 20,
    });
    expect(mentor.motivoFin.value).toBe('end_turn');
    expect(flujo.canceladoPorElCliente).toBe(true); // se libera la conexión tras el evento terminal
  });

  it('envía POST /api/chat con el token, los mensajes y el contexto pedagógico', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respuestaSse([sseTexto('ok'), sseFin()])));
    const { mentor } = crear();
    const contexto = useContextoStore();
    contexto.setModulo(3);
    contexto.setSeccion('mecanotransduccion');
    contexto.setEstructura('mandibula');
    contexto.registrarInteraccion('rotar_modelo');

    await mentor.enviar('  Explícame esto  ');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/chat');
    expect(init?.method).toBe('POST');
    const cabeceras = new Headers(init?.headers);
    expect(cabeceras.get('Authorization')).toBe('Bearer tok-123');
    expect(cabeceras.get('Content-Type')).toBe('application/json');
    expect(cabeceras.get('Accept')).toBe('text/event-stream');
    const cuerpo = cuerpoEnviado();
    expect(cuerpo.messages).toEqual([{ role: 'user', content: 'Explícame esto' }]);
    // El contexto es exactamente lo que produce el store, en camelCase.
    expect(cuerpo.contexto).toEqual(JSON.parse(JSON.stringify(contexto.toPayload())));
    expect(cuerpo.contexto).toMatchObject({
      modulo: 3,
      seccion: 'mecanotransduccion',
      estructuraSeleccionada: 'mandibula',
      interaccionesRecientes: ['rotar_modelo'],
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('las preguntas siguientes llevan el historial anterior', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(respuestaSse([sseTexto('respuesta'), sseFin()])),
    );
    const { mentor } = crear();
    await mentor.enviar('primera');
    await mentor.enviar('segunda');
    expect(cuerpoEnviado(1).messages).toEqual([
      { role: 'user', content: 'primera' },
      { role: 'assistant', content: 'respuesta' },
      { role: 'user', content: 'segunda' },
    ]);
  });

  it('reconstruye texto UTF-8 partido en cualquier byte y CRLF', async () => {
    const flujoCompleto = (sseTexto('Ñandú 🦴 ') + sseTexto('café') + sseFin()).replace(
      /\n/g,
      '\r\n',
    );
    const datos = new TextEncoder().encode(flujoCompleto);
    fetchMock.mockImplementation(() => {
      const flujo = new ReadableStream<Uint8Array>({
        start(c) {
          for (let i = 0; i < datos.length; i += 3) c.enqueue(datos.slice(i, i + 3));
          c.close();
        },
      });
      return Promise.resolve(new Response(flujo, { status: 200 }));
    });
    const { mentor } = crear();
    await mentor.enviar('hola');
    expect(mentor.mensajes.value[1]).toMatchObject({
      content: 'Ñandú 🦴 café',
      status: 'completo',
    });
  });

  it('ignora eventos desconocidos, tool_use, JSON malformado y lo que llegue tras el evento terminal', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        respuestaSse([
          eventoSse('tool_use', { id: 't1', name: 'mover_camara', input: { x: 1 } }),
          eventoSse('evento_futuro', { a: 1 }),
          'event: text\ndata: {esto no es json\n\n',
          eventoSse('text', { delta: 42 }),
          sseTexto('válido'),
          sseFin(),
          sseTexto(' NO DEBE APARECER'),
          sseError('upstream_error'),
        ]),
      ),
    );
    const { mentor } = crear();
    await mentor.enviar('hola');
    expect(mentor.mensajes.value[1]).toMatchObject({ content: 'válido', status: 'completo' });
    expect(mentor.fase.value).toBe('idle');
    expect(mentor.error.value).toBeNull();
  });

  it('done sin ningún texto se trata como fallo', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respuestaSse(sseFin())));
    const { mentor } = crear();
    await mentor.enviar('hola');
    expect(mentor.fase.value).toBe('error');
    expect(mentor.error.value).toMatch(/no devolvió una respuesta/);
    expect(mentor.mensajes.value[1]).toMatchObject({ status: 'error', content: '' });
  });
});

describe('useMentor: errores del stream', () => {
  it.each([
    ['refusal', /no puede responder a esa pregunta/],
    ['max_tokens', /demasiado larga/],
    ['upstream_error', /problema para responder/],
    ['rate_limited', /muy ocupado/],
    ['codigo_inventado', /no pudo responder en este momento/],
  ])(
    'evento error "%s" -> mensaje en español, sin texto crudo del servidor',
    async (code, patron) => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(respuestaSse(sseError(code, 'Traceback (most recent call last): boom'))),
      );
      const { mentor } = crear();
      await mentor.enviar('hola');
      expect(mentor.fase.value).toBe('error');
      expect(mentor.error.value).toMatch(patron);
      expect(mentor.error.value).not.toMatch(/Traceback|boom|refusal|upstream/);
      expect(mentor.puedeReintentar.value).toBe(true);
    },
  );

  it('un error a mitad de respuesta conserva el texto parcial como interrumpido', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(respuestaSse([sseTexto('Los osteoclas'), sseError('upstream_error')])),
    );
    const { mentor } = crear();
    await mentor.enviar('hola');
    expect(mentor.mensajes.value[1]).toMatchObject({
      content: 'Los osteoclas',
      status: 'interrumpido',
    });
    expect(mentor.fase.value).toBe('error');
  });

  it('el stream se corta sin done ni error -> interrumpido y reintentable', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respuestaSse([sseTexto('Parcial'), PING])));
    const { mentor } = crear();
    await mentor.enviar('hola');
    expect(mentor.mensajes.value[1]).toMatchObject({ content: 'Parcial', status: 'interrumpido' });
    expect(mentor.fase.value).toBe('error');
    expect(mentor.error.value).toMatch(/se interrumpió/);
    expect(mentor.puedeReintentar.value).toBe(true);
  });

  it('un evento incompleto al final (sin línea en blanco) no cuenta como done', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        respuestaSse([sseTexto('Casi'), 'event: done\ndata: {"stop_reason":"end_turn"}\n']),
      ),
    );
    const { mentor } = crear();
    await mentor.enviar('hola');
    expect(mentor.mensajes.value[1]!.status).toBe('interrumpido');
    expect(mentor.fase.value).toBe('error');
  });

  it('la conexión se cae a mitad del stream -> interrumpido con mensaje genérico', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        respuestaSseQueFalla([sseTexto('Antes del corte')], new TypeError('network error')),
      ),
    );
    const { mentor } = crear();
    await mentor.enviar('hola');
    expect(mentor.mensajes.value[1]).toMatchObject({
      content: 'Antes del corte',
      status: 'interrumpido',
    });
    expect(mentor.error.value).toMatch(/se interrumpió/);
    expect(mentor.error.value).not.toMatch(/network/i);
  });
});

describe('useMentor: errores HTTP antes del stream', () => {
  it('401 cierra la sesión y la conversación no sobrevive al cierre', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respuestaError(401, 'token_invalido')));
    const { mentor, auth } = crear();
    await mentor.enviar('hola');
    // apiFetchRaw cierra la sesión; el guard del router lleva a /acceso y el mentor se vacía.
    expect(auth.token).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(mentor.mensajes.value).toEqual([]);
    expect(mentor.fase.value).toBe('idle');
  });

  it('401 sin token guardado muestra el aviso de sesión vencida', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respuestaError(401, 'token_invalido')));
    const { mentor, auth } = crear();
    auth.token = null; // la sesión ya estaba cerrada
    await nextTick(); // deja pasar el vigilante de cierre de sesión (vacía la conversación vacía)
    await mentor.enviar('hola');
    expect(mentor.error.value).toMatch(/sesión expiró/);
    expect(mentor.fase.value).toBe('error');
    expect(mentor.puedeReintentar.value).toBe(false);
  });

  it('429 pide esperar y permite reintentar', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respuestaError(429, 'demasiados_intentos')));
    const { mentor } = crear();
    await mentor.enviar('hola');
    expect(mentor.error.value).toMatch(/muchos mensajes seguidos/);
    expect(mentor.puedeReintentar.value).toBe(true);
  });

  it('503 ia_no_configurada -> "El mentor no está disponible por ahora." sin reintento', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respuestaError(503, 'ia_no_configurada')));
    const { mentor } = crear();
    await mentor.enviar('hola');
    expect(mentor.error.value).toBe('El mentor no está disponible por ahora.');
    expect(mentor.puedeReintentar.value).toBe(false);
  });

  it('422 y 500 muestran mensajes propios, nunca el cuerpo del servidor', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            detail: [{ loc: ['body', 'messages'], msg: 'List should have at most 40 items' }],
          }),
          {
            status: 422,
          },
        ),
      ),
    );
    const { mentor } = crear();
    await mentor.enviar('hola');
    expect(mentor.error.value).toMatch(/No pude procesar ese mensaje/);
    expect(mentor.error.value).not.toMatch(/List should/);

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(new Response('<html>Internal Server Error</html>', { status: 500 })),
    );
    await mentor.enviar('otra vez');
    expect(mentor.error.value).toMatch(/no pudo responder en este momento/);
    expect(mentor.error.value).not.toMatch(/html|Internal/i);
  });

  it('red caída (fetch rechaza) -> mensaje de sin conexión', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { mentor } = crear();
    await mentor.enviar('hola');
    expect(mentor.error.value).toBe(MENSAJE_SIN_CONEXION);
    expect(mentor.fase.value).toBe('error');
    expect(mentor.puedeReintentar.value).toBe(true);
    expect(mentor.mensajes.value.at(-1)).toMatchObject({
      role: 'assistant',
      status: 'error',
      content: '',
    });
  });

  it('una respuesta 200 sin cuerpo (sin stream) es un error genérico', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response(null, { status: 200 })));
    const { mentor } = crear();
    await mentor.enviar('hola');
    expect(mentor.fase.value).toBe('error');
    expect(mentor.error.value).toMatch(/no pudo responder en este momento/);
  });
});

describe('useMentor: detener', () => {
  it('conserva el texto parcial marcado como interrumpido y cancela la petición', async () => {
    let flujo!: FlujoControlable;
    let senal: AbortSignal | null | undefined;
    fetchMock.mockImplementation((_url, init) => {
      senal = init?.signal;
      flujo = flujoControlable(init?.signal);
      return Promise.resolve(flujo.respuesta);
    });
    const { mentor } = crear();
    const envio = mentor.enviar('hola');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    flujo.enviar(sseTexto('Texto parcial'));
    await vi.waitFor(() => expect(mentor.mensajes.value[1]!.content).toBe('Texto parcial'));

    mentor.detener();

    expect(senal!.aborted).toBe(true);
    expect(mentor.fase.value).toBe('idle');
    expect(mentor.error.value).toBeNull();
    expect(mentor.mensajes.value[1]).toMatchObject({
      content: 'Texto parcial',
      status: 'interrumpido',
    });
    await envio;
    // Lo que llegue después ya no se aplica.
    expect(mentor.mensajes.value[1]!.content).toBe('Texto parcial');
    expect(mentor.fase.value).toBe('idle');
  });

  it('antes del primer texto quita el mensaje vacío del mentor', async () => {
    fetchMock.mockImplementation((_url, init) =>
      Promise.resolve(flujoControlable(init?.signal).respuesta),
    );
    const { mentor } = crear();
    const envio = mentor.enviar('hola');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    mentor.detener();
    await envio;
    expect(mentor.mensajes.value.map((m) => m.role)).toEqual(['user']);
    expect(mentor.fase.value).toBe('idle');
    // El estudiante puede pedir la respuesta de nuevo.
    expect(mentor.puedeReintentar.value).toBe(true);
  });

  it('detener mientras el fetch aún no responde cancela sin dejar error', async () => {
    let rechazar!: (e: unknown) => void;
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_res, rej) => {
          rechazar = rej;
          init?.signal?.addEventListener('abort', () =>
            rej(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const { mentor } = crear();
    const envio = mentor.enviar('hola');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    mentor.detener();
    await envio;
    expect(rechazar).toBeTypeOf('function');
    expect(mentor.error.value).toBeNull();
    expect(mentor.fase.value).toBe('idle');
  });

  it('detener sin nada en curso no hace nada', () => {
    const { mentor } = crear();
    mentor.detener();
    expect(mentor.fase.value).toBe('idle');
    expect(mentor.mensajes.value).toEqual([]);
  });
});

describe('useMentor: una sola petición activa', () => {
  it('enviar durante la respuesta se ignora (no hay segundo fetch)', async () => {
    let flujo!: FlujoControlable;
    fetchMock.mockImplementation((_url, init) => {
      flujo = flujoControlable(init?.signal);
      return Promise.resolve(flujo.respuesta);
    });
    const { mentor } = crear();
    const primero = mentor.enviar('uno');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    expect(await mentor.enviar('dos')).toBe(false);
    expect(await mentor.reintentar()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mentor.mensajes.value).toHaveLength(2);

    flujo.enviar(sseTexto('ok') + sseFin());
    await primero;
    // Terminada la primera, ya se puede enviar otra.
    fetchMock.mockImplementation(() => Promise.resolve(respuestaSse([sseTexto('b'), sseFin()])));
    expect(await mentor.enviar('dos')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('texto vacío o solo espacios no se envía', async () => {
    const { mentor } = crear();
    expect(await mentor.enviar('')).toBe(false);
    expect(await mentor.enviar('   \n ')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('un mensaje de más de 8000 caracteres no se envía y explica por qué', async () => {
    const { mentor } = crear();
    expect(await mentor.enviar('a'.repeat(MAX_CARACTERES + 1))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mentor.error.value).toMatch(/demasiado largo/);
    expect(mentor.mensajes.value).toEqual([]);
    expect(mentor.puedeReintentar.value).toBe(false);
  });

  it('exactamente 8000 caracteres sí se envía (los emoji cuentan como uno)', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respuestaSse([sseTexto('ok'), sseFin()])));
    const { mentor } = crear();
    expect(await mentor.enviar('🦴'.repeat(MAX_CARACTERES))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('useMentor: límites del contrato', () => {
  it('recorta a 40 mensajes, el último es del estudiante y ninguno pasa de 8000', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respuestaSse([sseTexto('ok'), sseFin()])));
    const { mentor } = crear();
    const previos: MensajeMentor[] = [];
    for (let i = 0; i < 60; i++) {
      previos.push(
        mensaje(i % 2 === 0 ? 'user' : 'assistant', i === 51 ? 'r'.repeat(12000) : `mensaje ${i}`),
      );
    }
    mentor.mensajes.value = previos;

    await mentor.enviar('la pregunta final');

    const { messages } = cuerpoEnviado();
    expect(messages.length).toBeLessThanOrEqual(MAX_MENSAJES);
    expect(messages.length).toBeGreaterThan(30);
    expect(messages[0]!.role).toBe('user');
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'la pregunta final' });
    expect(messages.every((m) => m.content.length >= 1 && m.content.length <= MAX_CARACTERES)).toBe(
      true,
    );
    // Se descartaron los más antiguos, no los recientes.
    expect(messages.some((m) => m.content === 'mensaje 0')).toBe(false);
    expect(messages.some((m) => m.content === 'mensaje 58')).toBe(true);
  });
});

describe('useMentor: reintentar', () => {
  it('tras un error reenvía la misma pregunta y reemplaza la respuesta fallida', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(respuestaSse([sseTexto('Par'), sseError('upstream_error')])),
    );
    const { mentor } = crear();
    await mentor.enviar('pregunta');
    expect(mentor.puedeReintentar.value).toBe(true);

    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(respuestaSse([sseTexto('Respuesta completa'), sseFin()])),
    );
    expect(await mentor.reintentar()).toBe(true);

    expect(cuerpoEnviado(1).messages).toEqual([{ role: 'user', content: 'pregunta' }]);
    expect(mentor.mensajes.value.map((m) => [m.role, m.content, m.status])).toEqual([
      ['user', 'pregunta', 'completo'],
      ['assistant', 'Respuesta completa', 'completo'],
    ]);
    expect(mentor.fase.value).toBe('idle');
    expect(mentor.error.value).toBeNull();
  });

  it('tras un fallo de red no se acumulan respuestas vacías', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { mentor } = crear();
    await mentor.enviar('pregunta');
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(respuestaSse([sseTexto('ya'), sseFin()])),
    );
    await mentor.reintentar();
    expect(mentor.mensajes.value.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(mentor.mensajes.value[1]!.content).toBe('ya');
  });

  it('si el estudiante escribe otra cosa tras un error, la respuesta vacía fallida se descarta', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { mentor } = crear();
    await mentor.enviar('primera');
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(respuestaSse([sseTexto('ok'), sseFin()])),
    );
    await mentor.enviar('segunda');
    expect(mentor.mensajes.value.map((m) => [m.role, m.content])).toEqual([
      ['user', 'primera'],
      ['user', 'segunda'],
      ['assistant', 'ok'],
    ]);
    expect(cuerpoEnviado(1).messages.map((m) => m.content)).toEqual(['primera', 'segunda']);
  });

  it('sin nada que reintentar devuelve false', async () => {
    const { mentor } = crear();
    expect(await mentor.reintentar()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mentor.puedeReintentar.value).toBe(false);
  });
});

describe('useMentor: limpiar y ciclo de vida', () => {
  it('limpiar durante un stream lo cancela y vacía la conversación', async () => {
    let flujo!: FlujoControlable;
    fetchMock.mockImplementation((_url, init) => {
      flujo = flujoControlable(init?.signal);
      return Promise.resolve(flujo.respuesta);
    });
    const { mentor } = crear();
    const envio = mentor.enviar('hola');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    flujo.enviar(sseTexto('algo'));
    await vi.waitFor(() => expect(mentor.mensajes.value[1]!.content).toBe('algo'));

    mentor.limpiar();
    await envio;

    expect(mentor.mensajes.value).toEqual([]);
    expect(mentor.fase.value).toBe('idle');
    expect(mentor.error.value).toBeNull();
    expect(mentor.uso.value).toBeNull();
  });

  it('cerrar sesión borra la conversación', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respuestaSse([sseTexto('ok'), sseFin()])));
    const { mentor, auth } = crear();
    await mentor.enviar('hola');
    expect(mentor.mensajes.value).toHaveLength(2);
    auth.logout();
    await nextTick();
    expect(mentor.mensajes.value).toEqual([]);
  });

  it('al destruir el ámbito (desmontar el panel) se cancela la petición en curso', async () => {
    let senal: AbortSignal | null | undefined;
    fetchMock.mockImplementation((_url, init) => {
      senal = init?.signal;
      return Promise.resolve(flujoControlable(init?.signal).respuesta);
    });
    const { mentor, scope } = crear();
    const envio = mentor.enviar('hola');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    scope.stop();
    await envio;
    expect(senal!.aborted).toBe(true);
  });

  it('el contexto del progreso viaja actualizado', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(respuestaSse([sseTexto('ok'), sseFin()])));
    const { mentor } = crear();
    const progreso = useProgresoStore();
    progreso.puntajeTotal = 250;
    await mentor.enviar('hola');
    expect(cuerpoEnviado().contexto).toMatchObject({ progreso: { puntajeTotal: 250 } });
  });
});
