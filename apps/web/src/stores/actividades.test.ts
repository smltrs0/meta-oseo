import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fila, resultadoDePrueba, simularApi } from '@/components/modulo/utilesPrueba';
import { respuestaError } from '@/test/utils';
import { usuarioDePrueba } from '@/test/utils';
import { useActividadesStore } from './actividades';
import { useAuthStore } from './auth';
import { useProgresoStore } from './progreso';

const actividad = { id: 'm1_quiz_repaso', tipo: 'quiz', puntaje_max: 50 } as const;

function iniciarSesion(id = 1): void {
  const auth = useAuthStore();
  auth.token = 'jwt-de-prueba';
  auth.establecerUsuario(usuarioDePrueba({ id }));
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  iniciarSesion();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('store actividades: lectura de resultados', () => {
  it('reconstruye el estado del servidor con GET /activities/results?modulo=n', async () => {
    const api = simularApi({
      filas: [
        fila('m1_capas_hueso', 1, { mejor_puntaje: 27, intentos: 2, mejor_precision: 0.9 }),
        fila('m2_otra', 2),
      ],
    });
    const store = useActividadesStore();
    await store.cargarResultados(1);

    expect(api.filtrar('GET', '/activities/results')).toHaveLength(1);
    expect(api.llamadas.find((l) => l.ruta.startsWith('/activities/results'))?.ruta).toBe(
      '/activities/results?modulo=1',
    );
    expect(store.estadoCarga[1]).toBe('listo');
    expect(store.servidorDe('m1_capas_hueso')).toEqual({
      puntaje: 27,
      intentos: 2,
      completada: true,
      precision: 0.9,
    });
    // Solo se pidió el módulo 1: la actividad del 2 no está.
    expect(store.servidorDe('m2_otra')).toBeUndefined();
    expect(store.conocidos.m1_capas_hueso).toEqual({ completada: true, mejorPrecision: 0.9 });
  });

  it('comparte una sola petición entre llamadas simultáneas y no repite una ya cargada', async () => {
    const api = simularApi();
    const store = useActividadesStore();
    await Promise.all([store.cargarResultados(1), store.cargarResultados(1)]);
    await store.cargarResultados(1);
    expect(api.filtrar('GET', '/activities/results')).toHaveLength(1);
    await store.cargarResultados(1, { force: true });
    expect(api.filtrar('GET', '/activities/results')).toHaveLength(2);
  });

  it('con la API caída usa el respaldo local y lo marca como error de carga', async () => {
    localStorage.setItem(
      'ova.actividades.resultados.1',
      JSON.stringify({
        m1_capas_hueso: { modulo: 1, completada: true, puntaje: 30, intentos: 1, precision: 1 },
        basura: { modulo: 99 },
      }),
    );
    simularApi({ fallaLectura: true });
    const store = useActividadesStore();
    await store.cargarResultados(1);

    expect(store.estadoCarga[1]).toBe('error');
    expect(store.servidorDe('m1_capas_hueso')?.puntaje).toBe(30);
    expect(store.resultados.basura).toBeUndefined();
  });

  it('un resultado local que el servidor aún no tiene no se pierde al fusionar', async () => {
    localStorage.setItem(
      'ova.actividades.resultados.1',
      JSON.stringify({
        m1_capas_hueso: { modulo: 1, completada: true, puntaje: 30, intentos: 3, precision: 1 },
      }),
    );
    simularApi({
      filas: [fila('m1_capas_hueso', 1, { completada: false, mejor_puntaje: 0, intentos: 1 })],
    });
    const store = useActividadesStore();
    await store.cargarResultados(1);
    expect(store.servidorDe('m1_capas_hueso')).toMatchObject({
      completada: true,
      puntaje: 30,
      intentos: 3,
    });
  });

  it('el respaldo local no es de otro usuario', async () => {
    localStorage.setItem(
      'ova.actividades.resultados.1',
      JSON.stringify({
        m1_capas_hueso: { modulo: 1, completada: true, puntaje: 30, intentos: 1 },
      }),
    );
    simularApi();
    iniciarSesion(2);
    const store = useActividadesStore();
    await store.cargarResultados(1);
    expect(store.resultados).toEqual({});
  });

  it('un resultado que llega tarde de otro usuario se descarta', async () => {
    let liberar: (r: Response) => void = () => undefined;
    simularApi({
      responder: (l) =>
        l.ruta.startsWith('/activities/results')
          ? new Promise<Response>((resolver) => {
              liberar = resolver;
            })
          : undefined,
    });
    const store = useActividadesStore();
    const carga = store.cargarResultados(1);
    iniciarSesion(2);
    await flushPromises();
    liberar(
      new Response(JSON.stringify({ resultados: [fila('m1_capas_hueso', 1)] }), { status: 200 }),
    );
    await carga;
    expect(store.resultados).toEqual({});
  });
});

describe('store actividades: envío de resultados', () => {
  it('envía POST /activities/{id}/result con el cuerpo exacto y actualiza HUD y logros', async () => {
    const api = simularApi({
      puntajeTotal: 100,
      logrosPorActividad: { m1_quiz_repaso: ['primer_hueso'] },
    });
    const store = useActividadesStore();
    const progreso = useProgresoStore();
    await store.registrarCompletada(actividad, 1, resultadoDePrueba(50, 1, 1));

    const posts = api.filtrar('POST', '/activities/');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.ruta).toBe('/activities/m1_quiz_repaso/result');
    expect(posts[0]?.cuerpo).toEqual({
      modulo: 1,
      tipo: 'quiz',
      puntaje: 50,
      intentos: 1,
      completada: true,
      detalle: { precision: 1 },
    });
    expect(store.pendientes).toBe(0);
    expect(progreso.puntajeTotal).toBe(150);
    expect(progreso.logros).toEqual(['primer_hueso']);
    expect(store.avisosLogro).toHaveLength(1);
    expect(store.avisosLogro[0]?.nombre).toBe('Primer hueso');
    expect(store.resultados.m1_quiz_repaso).toMatchObject({ completada: true, puntaje: 50 });
  });

  it('no avisa de un logro que el estudiante ya tenía', async () => {
    simularApi({ logrosPorActividad: { m1_quiz_repaso: ['primer_hueso'] } });
    const store = useActividadesStore();
    useProgresoStore().agregarLogros(['primer_hueso']);
    await store.registrarCompletada(actividad, 1, resultadoDePrueba(50));
    expect(store.avisosLogro).toEqual([]);
  });

  it('con la red caída deja el envío en una cola persistida y lo reintenta al volver la conexión', async () => {
    let conRed = false;
    const api = simularApi({
      responder: (l) => {
        if (l.metodo === 'POST' && !conRed) throw new TypeError('sin red');
        return undefined;
      },
    });
    const store = useActividadesStore();
    store.iniciar();
    await store.registrarCompletada(actividad, 1, resultadoDePrueba(45, 2, 0.9));

    expect(store.pendientes).toBe(1);
    expect(store.errorEnvio).toContain('lo reintentaremos');
    expect(JSON.parse(localStorage.getItem('ova.actividades.cola.1') ?? '[]')).toHaveLength(1);
    // La actividad cuenta como hecha mientras tanto: el estudiante no queda bloqueado.
    expect(store.resultados.m1_quiz_repaso?.completada).toBe(true);

    conRed = true;
    window.dispatchEvent(new Event('online'));
    await flushPromises();

    expect(store.pendientes).toBe(0);
    expect(store.errorEnvio).toBeNull();
    expect(localStorage.getItem('ova.actividades.cola.1')).toBeNull();
    const enviados = api.filtrar('POST', '/activities/').filter((l) => {
      const c = l.cuerpo as { puntaje: number };
      return c.puntaje === 45;
    });
    // Un intento fallido y uno correcto del MISMO envío; nunca dos envíos aceptados.
    expect(enviados).toHaveLength(2);
    store.detener();
  });

  it('reintenta solo con espera creciente', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    let fallos = 2;
    const api = simularApi({
      responder: (l) => {
        if (l.metodo === 'POST' && fallos-- > 0) return respuestaError(503, 'no_disponible');
        return undefined;
      },
    });
    const store = useActividadesStore();
    await store.registrarCompletada(actividad, 1, resultadoDePrueba(50));
    expect(store.pendientes).toBe(1);

    await vi.advanceTimersByTimeAsync(4_000);
    expect(api.filtrar('POST', '/activities/')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_500); // 5 s
    expect(api.filtrar('POST', '/activities/')).toHaveLength(2);
    expect(store.pendientes).toBe(1);
    await vi.advanceTimersByTimeAsync(10_500); // 10 s de espera creciente
    expect(api.filtrar('POST', '/activities/')).toHaveLength(3);
    expect(store.pendientes).toBe(0);
  });

  it('la misma actividad e intento nunca se encola dos veces', async () => {
    const api = simularApi({
      responder: (l) => (l.metodo === 'POST' ? respuestaError(503, 'no_disponible') : undefined),
    });
    const store = useActividadesStore();
    void store.registrarCompletada(actividad, 1, resultadoDePrueba(40, 1));
    void store.registrarCompletada(actividad, 1, resultadoDePrueba(50, 1));
    await flushPromises();
    expect(store.cola).toHaveLength(1);
    expect(api.filtrar('POST', '/activities/').length).toBeGreaterThanOrEqual(1);
    // Otro intento sí es otro envío.
    await store.registrarCompletada(actividad, 2, resultadoDePrueba(45, 2));
    expect(store.cola.map((x) => x.cuerpo.intentos)).toEqual([1, 2]);
  });

  it('recupera la cola guardada de una visita anterior y la envía al iniciar', async () => {
    localStorage.setItem(
      'ova.actividades.cola.1',
      JSON.stringify([
        {
          clave: '/activities/m1_quiz_repaso/result#1',
          ruta: '/activities/m1_quiz_repaso/result',
          cuerpo: {
            modulo: 1,
            tipo: 'quiz',
            puntaje: 50,
            intentos: 1,
            completada: true,
            detalle: { precision: 1 },
          },
          creado: 1,
        },
        { ruta: '/otra/cosa', cuerpo: {} },
        { ruta: '/activities/x/result', cuerpo: { modulo: 9 } },
      ]),
    );
    const api = simularApi();
    const store = useActividadesStore();
    store.iniciar();
    await flushPromises();
    expect(api.filtrar('POST', '/activities/')).toHaveLength(1);
    expect(store.pendientes).toBe(0);
    store.detener();
  });

  it('un 422 se registra y NO bloquea: la cola sigue y la actividad cuenta como hecha', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const api = simularApi({
      responder: (l) =>
        l.ruta === '/activities/m1_quiz_repaso/result'
          ? respuestaError(422, 'actividad_desconocida', 'No existe')
          : undefined,
    });
    const store = useActividadesStore();
    await store.registrarCompletada(actividad, 1, resultadoDePrueba(50));
    await store.registrarCompletada(
      { id: 'm1_capas_hueso', tipo: 'multicapa', puntaje_max: 30 },
      1,
      resultadoDePrueba(30),
    );

    expect(store.descartados).toEqual([
      expect.objectContaining({
        actividad: 'm1_quiz_repaso',
        status: 422,
        code: 'actividad_desconocida',
      }),
    ]);
    expect(aviso).toHaveBeenCalled();
    expect(store.pendientes).toBe(0);
    expect(store.errorEnvio).toBeNull();
    expect(store.resultados.m1_quiz_repaso?.completada).toBe(true);
    // No se reintenta lo rechazado de forma definitiva.
    expect(api.filtrar('POST', '/activities/m1_quiz_repaso')).toHaveLength(1);
    expect(api.filtrar('POST', '/activities/m1_capas_hueso')).toHaveLength(1);
  });

  it('un 401 conserva la cola para el siguiente ingreso', async () => {
    simularApi({
      responder: (l) => (l.metodo === 'POST' ? respuestaError(401, 'no_autenticado') : undefined),
    });
    const store = useActividadesStore();
    await store.registrarCompletada(actividad, 1, resultadoDePrueba(50));
    expect(JSON.parse(localStorage.getItem('ova.actividades.cola.1') ?? '[]')).toHaveLength(1);
  });

  it('sin localStorage sigue funcionando en memoria', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cuota');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    simularApi();
    const store = useActividadesStore();
    await store.cargarResultados(1);
    await store.registrarCompletada(actividad, 1, resultadoDePrueba(50));
    expect(store.resultados.m1_quiz_repaso?.completada).toBe(true);
  });
});

describe('store actividades: PUT /progress/{n}', () => {
  it('envía completado:true solo después del POST de la actividad', async () => {
    const api = simularApi();
    const store = useActividadesStore();
    const progreso = useProgresoStore();
    const registro = store.registrarCompletada(actividad, 1, resultadoDePrueba(50));
    void store.solicitarCompletar(1);
    await registro;
    await flushPromises();

    const orden = api.llamadas
      .filter((l) => l.metodo === 'POST' || l.metodo === 'PUT')
      .map((l) => `${l.metodo} ${l.ruta}`);
    expect(orden).toEqual(['POST /activities/m1_quiz_repaso/result', 'PUT /progress/1']);
    expect(api.filtrar('PUT', '/progress/1')[0]?.cuerpo).toEqual({ completado: true });
    expect(progreso.estaCompletado(1)).toBe(true);
    expect(store.porCompletar).toEqual([]);
  });

  it('no envía el PUT si el POST falló y lo envía al recuperarse', async () => {
    let conRed = false;
    const api = simularApi({
      responder: (l) => {
        if (l.metodo === 'POST' && !conRed) return respuestaError(503, 'no_disponible');
        return undefined;
      },
    });
    const store = useActividadesStore();
    store.iniciar();
    await store.registrarCompletada(actividad, 1, resultadoDePrueba(50));
    await store.solicitarCompletar(1);
    expect(api.filtrar('PUT', '/progress/')).toHaveLength(0);

    conRed = true;
    window.dispatchEvent(new Event('online'));
    await flushPromises();
    expect(api.filtrar('PUT', '/progress/')).toHaveLength(1);
    store.detener();
  });

  it('un 409 modulo_incompleto deja qué falta y no se reintenta', async () => {
    const api = simularApi({
      responder: (l) => (l.metodo === 'PUT' ? respuestaJson409(['m1_capas_hueso']) : undefined),
    });
    const store = useActividadesStore();
    await store.solicitarCompletar(1);
    await flushPromises();

    expect(store.faltantesDeModulo(1)).toEqual(['m1_capas_hueso']);
    expect(store.porCompletar).toEqual([]);
    expect(useProgresoStore().estaCompletado(1)).toBe(false);
    await store.procesar();
    expect(api.filtrar('PUT', '/progress/')).toHaveLength(1);
  });

  it('enviarProgresoModulo devuelve el error con status y código', async () => {
    simularApi({ responder: () => respuestaError(422, 'valor_invalido', 'No') });
    const r = await useActividadesStore().enviarProgresoModulo(1, { tiempo_delta_seg: 30 });
    expect(r).toMatchObject({ ok: false, status: 422, code: 'valor_invalido' });
  });

  it('una respuesta lenta de un PUT anterior no vuelve a cerrar un módulo completado', async () => {
    simularApi();
    const store = useActividadesStore();
    const progreso = useProgresoStore();
    await store.enviarProgresoModulo(1, { completado: true });
    expect(progreso.estaCompletado(1)).toBe(true);
    await store.enviarProgresoModulo(1, { tiempo_delta_seg: 30 });
    expect(progreso.estaCompletado(1)).toBe(true);
  });
});

describe('store actividades: instantáneas y usuario', () => {
  const progresoValido = { avance: 0.5, intentos: 2, instantanea: { paso: 1 } };

  it('guarda y recupera la instantánea de un intento a medias', () => {
    const store = useActividadesStore();
    expect(store.guardarProgreso('m1_capas_hueso', progresoValido)).toBe(true);
    expect(store.leerInstantanea('m1_capas_hueso')).toEqual(progresoValido);
    store.borrarInstantanea('m1_capas_hueso');
    expect(store.leerInstantanea('m1_capas_hueso')).toBeUndefined();
  });

  it('descarta un progreso que llega tarde, tras completar el mismo intento', async () => {
    simularApi();
    const store = useActividadesStore();
    await store.registrarCompletada(actividad, 1, resultadoDePrueba(50, 2));
    expect(store.guardarProgreso('m1_quiz_repaso', { ...progresoValido, intentos: 2 })).toBe(false);
    expect(store.leerInstantanea('m1_quiz_repaso')).toBeUndefined();
  });

  it('ignora una instantánea corrupta o demasiado grande', () => {
    const store = useActividadesStore();
    localStorage.setItem('ova.actividades.instantanea.1.m1_x', '{no es json');
    expect(store.leerInstantanea('m1_x')).toBeUndefined();
    expect(
      store.guardarProgreso('m1_x', {
        avance: 0.2,
        intentos: 1,
        instantanea: { grande: 'x'.repeat(40_000) },
      }),
    ).toBe(false);
  });

  it('al cambiar de usuario olvida lo del anterior', async () => {
    simularApi();
    const store = useActividadesStore();
    await store.registrarCompletada(actividad, 1, resultadoDePrueba(50));
    expect(Object.keys(store.resultados)).toHaveLength(1);

    useAuthStore().logout();
    await flushPromises();
    expect(store.resultados).toEqual({});
    expect(store.cola).toEqual([]);
    expect(store.avisosLogro).toEqual([]);
  });

  it('descartarAviso quita solo ese aviso y se conservan como máximo tres', () => {
    const store = useActividadesStore();
    store.avisarLogros(['a', 'b', 'c', 'd']);
    expect(store.avisosLogro).toHaveLength(3);
    const primero = store.avisosLogro[0]!;
    store.descartarAviso(primero.clave);
    expect(store.avisosLogro).toHaveLength(2);
  });
});

function respuestaJson409(faltantes: string[]): Response {
  return new Response(
    JSON.stringify({
      detail: { code: 'modulo_incompleto', message: 'Faltan resultados', faltantes },
    }),
    { status: 409, headers: { 'Content-Type': 'application/json' } },
  );
}
