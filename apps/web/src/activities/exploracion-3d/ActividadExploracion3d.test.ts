/**
 * Pruebas de ActividadExploracion3d: batería de contrato, flujo feliz, repetición y penalización,
 * estado restaurado (también tardío), teclado, modo revisar, desmontaje limpio y configuraciones
 * adversariales. La escena real (three, TresJS) se sustituye por un doble sin WebGL: lo que se prueba
 * aquí es la actividad. La escena y su integración con la actividad se prueban en
 * `src/scenes/EscenaExploracion.test.ts` y `ActividadExploracion3d.integracion.test.ts`.
 */
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropsActividadExploracion3d, ResultadoActividad } from '@/activities/types';
import { pruebasDeContratoActividad, problemasDeEmisiones } from '@/content/__fixtures__/contrato';
import type { EventosEmitidos } from '@/content/__fixtures__/contrato';
import { muestra, validar } from '@/content/__fixtures__/utiles';
import { listarActividades } from '@/content/consultas';
import { PROGRESO_INTERVALO_MIN_MS } from '@/content/constantes';
import { calcularPuntaje } from '@/content/scoring';
import type { ActividadExploracion3d } from '@/content/schema';
import Actividad from './ActividadExploracion3d.vue';
import fuenteDelComponente from './ActividadExploracion3d.vue?raw';
import { crearActividad } from './utilesPrueba';

/** Estado y contadores del doble de la escena (viven fuera de la fábrica, que se iza). */
const escena = vi.hoisted(() => ({
  estado: 'listo' as string,
  montajes: 0,
  desmontajes: 0,
  ultimasProps: null as Record<string, unknown> | null,
}));

vi.mock('@/scenes/EscenaExploracion.vue', async () => {
  const { defineComponent, h, onBeforeUnmount, onMounted } = await import('vue');
  return {
    // Sin `__esModule`, Vue tomaría el módulo entero por el componente (defineAsyncComponent).
    __esModule: true,
    default: defineComponent({
      name: 'EscenaExploracionFalsa',
      props: {
        modelo: { type: String, default: undefined },
        alt: { type: String, default: undefined },
        nodos: { type: Array, default: undefined },
        visitados: { type: Array, default: undefined },
        seleccionId: { type: String, default: undefined },
        ordenEnfoque: { type: Number, default: undefined },
      },
      emits: ['seleccionar', 'estado'],
      setup(
        props: Record<string, unknown> & { nodos: { id: string; etiqueta: string }[] },
        { emit },
      ) {
        escena.montajes += 1;
        onMounted(() => emit('estado', escena.estado));
        onBeforeUnmount(() => {
          escena.desmontajes += 1;
        });
        return () => {
          escena.ultimasProps = { ...props };
          return h(
            'div',
            {
              'data-testid': 'escena-falsa',
              'data-orden': String(props.ordenEnfoque),
              'data-seleccion': String(props.seleccionId ?? ''),
            },
            props.nodos.map((n) =>
              h(
                'button',
                { type: 'button', 'data-punto': n.id, onClick: () => emit('seleccionar', n.id) },
                `Punto ${n.etiqueta}`,
              ),
            ),
          );
        };
      },
    }),
  };
});

enableAutoUnmount(afterEach);

const modulo = validar(muestra()).modulo!;
const actividades = listarActividades(modulo)
  .map((u) => u.actividad)
  .filter((a): a is ActividadExploracion3d => a.tipo === 'exploracion-3d');
const mandibula = actividades.find((a) => a.config.modelo === 'mandibula')!;
const celulas = actividades.find((a) => a.config.modelo === 'celulas')!;

type Props = Omit<PropsActividadExploracion3d, 'modulo'> & { modulo?: 1 | 2 | 3 | 4 | 5 | 6 };

function montar(actividad: ActividadExploracion3d, extra: Partial<Props> = {}): VueWrapper {
  return mount(Actividad, {
    props: { modulo: 1, actividad, ...extra },
    attachTo: document.body,
  }) as unknown as VueWrapper;
}

async function montarListo(
  actividad: ActividadExploracion3d,
  extra: Partial<Props> = {},
): Promise<VueWrapper> {
  const w = montar(actividad, extra);
  await flushPromises();
  return w;
}

/** Botón de la lista de partes por id (los ids se comparan como texto: sin selectores). */
function parte(w: VueWrapper, id: string) {
  const encontrado = w.findAll('[data-nodo]').find((b) => b.attributes('data-nodo') === id);
  if (!encontrado) throw new Error(`No hay una parte "${id}" en la lista`);
  return encontrado;
}

async function visitar(w: VueWrapper, ...ids: string[]): Promise<void> {
  for (const id of ids) await parte(w, id).trigger('click');
}

async function completar(w: VueWrapper, actividad: ActividadExploracion3d): Promise<void> {
  await visitar(w, ...actividad.config.requeridos);
}

function eventos(w: VueWrapper): EventosEmitidos {
  return w.emitted() as EventosEmitidos;
}

function resultados(w: VueWrapper): ResultadoActividad<'exploracion-3d'>[] {
  return (w.emitted('completada') ?? []).map((a) => a[0] as ResultadoActividad<'exploracion-3d'>);
}

function texto(w: VueWrapper, testid: string): string {
  return w.get(`[data-testid="${testid}"]`).text();
}

beforeEach(() => {
  escena.estado = 'listo';
  escena.montajes = 0;
  escena.desmontajes = 0;
  escena.ultimasProps = null;
});

/* -------------------------------------------------------------------------------------------
 * Contrato
 * ----------------------------------------------------------------------------------------- */

describe('la muestra trae las dos actividades 3D', () => {
  it('mandíbula (con nodos por pieza y por ancla) y células', () => {
    expect(mandibula.config.nodos.some((n) => n.ancla)).toBe(true);
    expect(mandibula.config.nodos.some((n) => !n.ancla)).toBe(true);
    expect(celulas.config.nodos.every((n) => !n.ancla)).toBe(true);
  });
});

for (const actividad of actividades) {
  pruebasDeContratoActividad({
    nombre: `ActividadExploracion3d (${actividad.config.modelo})`,
    actividad,
    montar: (props) =>
      mount(Actividad, { props, attachTo: document.body }) as unknown as VueWrapper,
    completar: (w) => completar(w, actividad),
    precisionEsperada: 1,
  });
}

/* -------------------------------------------------------------------------------------------
 * Flujo feliz
 * ----------------------------------------------------------------------------------------- */

describe('flujo feliz', () => {
  it('muestra el título, las instrucciones y una parte por nodo con nombre accesible', async () => {
    const w = await montarListo(mandibula);
    expect(w.get('h3').text()).toBe(mandibula.titulo);
    expect(w.text()).toContain(mandibula.instrucciones.slice(0, 20));
    const botones = w.findAll('[data-nodo]');
    expect(botones).toHaveLength(mandibula.config.nodos.length);
    botones.forEach((b, i) => {
      expect(b.element.tagName).toBe('BUTTON');
      expect(b.attributes('type')).toBe('button');
      expect(b.text()).toContain(mandibula.config.nodos[i]!.etiqueta);
    });
    expect(w.get('section').attributes('aria-labelledby')).toBeTruthy();
  });

  it('tocar una parte abre su ficha, emite selecciona_nodo y enfoca la cámara', async () => {
    const w = await montarListo(mandibula);
    const ordenAntes = w.get('[data-testid="escena-falsa"]').attributes('data-orden');
    await parte(w, 'rama').trigger('click');
    expect(texto(w, 'ficha')).toContain('Rama');
    expect(texto(w, 'ficha')).toContain('Porción vertical');
    expect(w.emitted('interaccion')).toEqual([[{ accion: 'selecciona_nodo', objeto: 'rama' }]]);
    expect(parte(w, 'rama').attributes('aria-current')).toBe('true');
    expect(w.get('[data-testid="escena-falsa"]').attributes('data-seleccion')).toBe('rama');
    expect(w.get('[data-testid="escena-falsa"]').attributes('data-orden')).not.toBe(ordenAntes);
  });

  it('tocar un punto del modelo (la escena) equivale a tocar la parte de la lista', async () => {
    const w = await montarListo(mandibula);
    await w.get('[data-punto="condilo"]').trigger('click');
    expect(parte(w, 'condilo').attributes('data-visitado')).toBe('true');
    expect(w.emitted('interaccion')).toEqual([[{ accion: 'selecciona_nodo', objeto: 'condilo' }]]);
  });

  it('marca las partes exploradas y cuenta solo las requeridas', async () => {
    const w = await montarListo(mandibula);
    expect(texto(w, 'avance')).toContain('0 de 3 partes requeridas');
    await visitar(w, 'rama'); // opcional
    expect(texto(w, 'avance')).toContain('0 de 3');
    await visitar(w, 'condilo');
    expect(texto(w, 'avance')).toContain('1 de 3');
    expect(parte(w, 'condilo').text()).toContain('Explorada');
    expect(parte(w, 'condilo').text()).toContain('Requerida');
    expect(parte(w, 'rama').text()).toContain('Opcional');
    const barra = w.get('[role="progressbar"]');
    expect(barra.attributes('aria-valuenow')).toBe('1');
    expect(barra.attributes('aria-valuemax')).toBe('3');
    expect(w.find('[data-testid="resultado"]').exists()).toBe(false);
  });

  it('al visitar todos los requeridos emite UNA vez completada con precisión 1 y detalle', async () => {
    const w = await montarListo(mandibula);
    await visitar(w, 'angulo', 'rama', 'condilo', 'cuerpo');
    const [r] = resultados(w);
    expect(resultados(w)).toHaveLength(1);
    expect(r).toEqual({
      puntaje: 30,
      intentos: 1,
      precision: 1,
      detalle: { visitados: ['angulo', 'rama', 'condilo', 'cuerpo'] },
    });
    expect(problemasDeEmisiones(eventos(w), mandibula)).toEqual([]);
  });

  it('muestra el resultado con la retroalimentación del contenido y pasa el foco al encabezado', async () => {
    const w = await montarListo(mandibula);
    await completar(w, mandibula);
    await flushPromises();
    const resultado = w.get('[data-testid="resultado"]');
    expect(resultado.text()).toContain('Exploración completada');
    expect(resultado.text()).toContain('Muy bien');
    expect(resultado.text()).toContain('30 de 30');
    expect(resultado.attributes('role')).toBe('group');
    const encabezado = resultado.get('h4');
    expect(encabezado.attributes('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(encabezado.element);
    expect(texto(w, 'anuncio')).toContain('Exploración completada');
  });

  it('tocar una parte NO roba el foco (R6) y nada lo roba al cargar', async () => {
    const w = await montarListo(mandibula);
    expect(
      document.body.contains(document.activeElement) && document.activeElement !== document.body,
    ).toBe(false);
    const boton = parte(w, 'rama');
    (boton.element as HTMLElement).focus();
    await boton.trigger('click');
    expect(document.activeElement).toBe(boton.element);
  });

  it('seguir explorando después de completar es libre: no vuelve a completar ni a emitir progreso', async () => {
    const w = await montarListo(mandibula);
    await completar(w, mandibula);
    const progresoAntes = (w.emitted('progreso') ?? []).length;
    await visitar(w, 'rama', 'linea_milohioidea', 'condilo');
    expect(resultados(w)).toHaveLength(1);
    expect((w.emitted('progreso') ?? []).length).toBe(progresoAntes);
    expect(w.emitted('interaccion')).toHaveLength(mandibula.config.requeridos.length + 3);
    expect(texto(w, 'ficha')).toContain('Cóndilo');
    expect(resultados(w)[0]!.detalle.visitados).toEqual(mandibula.config.requeridos);
  });

  it('la actividad de células (sin ancla) se completa igual y su lista no muestra la atribución CC BY-SA', async () => {
    const w = await montarListo(celulas);
    expect(w.find('[data-testid="atribucion"]').exists()).toBe(false);
    await completar(w, celulas);
    expect(resultados(w)[0]!.puntaje).toBe(celulas.puntaje_max);
  });

  it('la mandíbula muestra la atribución del modelo', async () => {
    const w = await montarListo(mandibula);
    const atribucion = w.get('[data-testid="atribucion"]');
    expect(atribucion.text()).toMatch(/CC BY-SA/i);
    expect(atribucion.text().length).toBeGreaterThan(20);
  });
});

/* -------------------------------------------------------------------------------------------
 * progreso (limitador, instantánea)
 * ----------------------------------------------------------------------------------------- */

describe('progreso', () => {
  afterEach(() => vi.useRealTimers());

  it('emite a la primera con avance, intentos e instantánea por índices; no repite el mismo nodo', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const w = await montarListo(mandibula);
    await visitar(w, 'condilo', 'condilo');
    // Ni ahora ni cuando vence el limitador: revisitar un nodo no cambia nada que guardar.
    await vi.advanceTimersByTimeAsync(PROGRESO_INTERVALO_MIN_MS * 3);
    expect(w.emitted('progreso')).toHaveLength(1);
    const [p] = w.emitted('progreso')![0] as [Record<string, unknown>];
    expect(p).toEqual({ avance: 1 / 3, intentos: 1, instantanea: { visitados: [0] } });
  });

  it('agrupa las emisiones seguidas y emite la última al pasar el intervalo', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const w = await montarListo(mandibula);
    await visitar(w, 'condilo', 'rama'); // 1.ª sale ya; la 2.ª queda pendiente
    expect(w.emitted('progreso')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PROGRESO_INTERVALO_MIN_MS + 5);
    expect(w.emitted('progreso')).toHaveLength(2);
    const ultimo = w.emitted('progreso')![1]![0] as { instantanea: unknown };
    expect(ultimo.instantanea).toEqual({ visitados: [0, 1] });
  });

  it('el progreso pendiente al completar se cancela: nada llega después de completada', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const w = await montarListo(mandibula);
    await visitar(w, 'condilo', 'angulo'); // el segundo queda pendiente
    const antes = (w.emitted('progreso') ?? []).length;
    await visitar(w, 'cuerpo'); // completa
    expect(resultados(w)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(PROGRESO_INTERVALO_MIN_MS * 5);
    expect((w.emitted('progreso') ?? []).length).toBe(antes);
    // El orden de los eventos: ningún progreso posterior a completada.
    const orden = w.emitted();
    expect(orden.completada).toHaveLength(1);
  });

  it('al desmontar a medias emite el último progreso pendiente y libera el temporizador', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const alProgreso = vi.fn();
    const w = await montarListo(mandibula, { onProgreso: alProgreso } as Partial<Props>);
    await visitar(w, 'condilo', 'rama');
    expect(alProgreso).toHaveBeenCalledTimes(1);
    w.unmount();
    expect(alProgreso).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(PROGRESO_INTERVALO_MIN_MS * 5);
    expect(alProgreso).toHaveBeenCalledTimes(2);
  });

  it('desmontar tras completar no emite nada y no deja temporizadores', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const alProgreso = vi.fn();
    const w = await montarListo(mandibula, { onProgreso: alProgreso } as Partial<Props>);
    await visitar(w, 'condilo', 'angulo', 'cuerpo');
    const antes = alProgreso.mock.calls.length;
    w.unmount();
    expect(alProgreso.mock.calls.length).toBe(antes);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('con 12 nodos la instantánea sigue muy por debajo del tope de 8 KB', async () => {
    const actividad = crearActividad({ nodos: 12, requeridos: 12 });
    const w = await montarListo(actividad);
    await visitar(w, ...actividad.config.nodos.map((n) => n.id).slice(0, 11));
    const ultimo = (w.emitted('progreso') ?? []).at(-1)![0] as { instantanea: unknown };
    expect(JSON.stringify(ultimo.instantanea).length).toBeLessThan(200);
    expect(problemasDeEmisiones(eventos(w), actividad)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------------------------
 * Repetir e intentos
 * ----------------------------------------------------------------------------------------- */

describe('repetir y penalización', () => {
  it('repetir empieza otro intento: limpia, emite reinicia_actividad y reabre el progreso', async () => {
    const w = await montarListo(mandibula);
    await completar(w, mandibula);
    await w.get('[data-testid="repetir"]').trigger('click');
    await flushPromises();
    expect(w.emitted('interaccion')!.at(-1)).toEqual([{ accion: 'reinicia_actividad' }]);
    expect(w.find('[data-testid="resultado"]').exists()).toBe(false);
    expect(texto(w, 'avance')).toContain('0 de 3');
    expect(w.findAll('[data-visitado="true"]')).toHaveLength(0);
    expect(w.get('[data-testid="escena-falsa"]').attributes('data-seleccion')).toBe('');
    // El foco pasa a la lista de partes (no queda en un botón que desapareció).
    expect(document.activeElement?.textContent).toContain('Partes del modelo');
    const antes = (w.emitted('progreso') ?? []).length;
    await visitar(w, 'condilo');
    expect((w.emitted('progreso') ?? []).length).toBe(antes + 1);
    const p = w.emitted('progreso')!.at(-1)![0] as { intentos: number };
    expect(p.intentos).toBe(2);
  });

  it('el segundo intento puntúa con la penalización por defecto (90 %)', async () => {
    const w = await montarListo(mandibula);
    await completar(w, mandibula);
    await w.get('[data-testid="repetir"]').trigger('click');
    await completar(w, mandibula);
    const [r1, r2] = resultados(w);
    expect(r1!.puntaje).toBe(30);
    expect(r2!.intentos).toBe(2);
    expect(r2!.puntaje).toBe(calcularPuntaje(mandibula, { precision: 1, intentos: 2 }));
    expect(r2!.puntaje).toBe(27);
    expect(w.get('[data-testid="resultado"]').text()).toContain('Intento 2');
  });

  it('respeta una penalización propia y su piso', async () => {
    const actividad = crearActividad({
      puntaje_max: 100,
      penalizacion: { por_intento: 0.5, piso: 0.2 },
    });
    const w = await montarListo(actividad);
    for (let i = 0; i < 4; i++) {
      await completar(w, actividad);
      if (i < 3) await w.get('[data-testid="repetir"]').trigger('click');
    }
    expect(resultados(w).map((r) => r.puntaje)).toEqual([100, 50, 20, 20]);
    expect(resultados(w).map((r) => r.intentos)).toEqual([1, 2, 3, 4]);
  });

  it('con intentos previos en el servidor arranca en el siguiente y lo dice', async () => {
    const w = await montarListo(mandibula, {
      estadoPrevio: { servidor: { puntaje: 30, intentos: 2, completada: true } },
    });
    expect(texto(w, 'aviso-previo')).toContain('mejor puntaje: 30 de 30');
    await completar(w, mandibula);
    expect(resultados(w)[0]!.intentos).toBe(3);
    expect(resultados(w)[0]!.puntaje).toBe(24);
  });

  it('sin completada previa en el servidor no se muestra el aviso', async () => {
    const w = await montarListo(mandibula, {
      estadoPrevio: { servidor: { puntaje: 0, intentos: 1, completada: false } },
    });
    expect(w.find('[data-testid="aviso-previo"]').exists()).toBe(false);
  });
});

/* -------------------------------------------------------------------------------------------
 * Estado restaurado
 * ----------------------------------------------------------------------------------------- */

describe('estado restaurado', () => {
  const progreso = (visitados: number[], intentos = 1) => ({
    avance: 0.3,
    intentos,
    instantanea: { visitados },
  });

  it('restaura las partes visitadas y el número de intento de la instantánea', async () => {
    const w = await montarListo(mandibula, { estadoPrevio: { progreso: progreso([0, 2], 3) } });
    expect(parte(w, 'condilo').attributes('data-visitado')).toBe('true');
    expect(parte(w, 'angulo').attributes('data-visitado')).toBe('true');
    expect(texto(w, 'avance')).toContain('2 de 3');
    await visitar(w, 'cuerpo');
    expect(resultados(w)[0]!.intentos).toBe(3);
    expect(resultados(w)[0]!.detalle.visitados).toEqual(['condilo', 'angulo', 'cuerpo']);
  });

  it('una instantánea de otro contenido (índices fuera de rango) se ignora', async () => {
    const w = await montarListo(mandibula, { estadoPrevio: { progreso: progreso([40, -2, 7]) } });
    expect(w.findAll('[data-visitado="true"]')).toHaveLength(0);
    expect(texto(w, 'avance')).toContain('0 de 3');
  });

  it('llegada tardía de estadoPrevio (antes de interactuar) recoge lo restaurado y recalcula intentos', async () => {
    const w = await montarListo(mandibula);
    await w.setProps({
      estadoPrevio: {
        servidor: { puntaje: 30, intentos: 4, completada: true },
        progreso: progreso([0]),
      },
    } as never);
    await flushPromises();
    expect(parte(w, 'condilo').attributes('data-visitado')).toBe('true');
    await visitar(w, 'angulo', 'cuerpo');
    expect(resultados(w)[0]!.intentos).toBe(5);
  });

  it('llegada tardía DESPUÉS de interactuar no pisa lo que el estudiante ya hizo', async () => {
    const w = await montarListo(mandibula);
    await visitar(w, 'condilo');
    await w.setProps({
      estadoPrevio: { servidor: { puntaje: 30, intentos: 6, completada: true } },
    } as never);
    await flushPromises();
    expect(parte(w, 'condilo').attributes('data-visitado')).toBe('true');
    await visitar(w, 'angulo', 'cuerpo');
    expect(resultados(w)[0]!.intentos).toBe(1);
  });
});

/* -------------------------------------------------------------------------------------------
 * Modo revisar
 * ----------------------------------------------------------------------------------------- */

describe('modo revisar', () => {
  it('lee las fichas y mueve la cámara pero no cuenta, no puntúa ni emite eventos', async () => {
    const w = await montarListo(mandibula, {
      modo: 'revisar',
      estadoPrevio: { servidor: { puntaje: 30, intentos: 1, completada: true } },
    });
    expect(texto(w, 'aviso-revision')).toContain('solo lectura');
    expect(w.find('[data-testid="avance"]').exists()).toBe(false);
    for (const nodo of mandibula.config.nodos) await parte(w, nodo.id).trigger('click');
    expect(texto(w, 'ficha')).toContain(mandibula.config.nodos.at(-1)!.etiqueta);
    expect(w.find('[data-testid="resultado"]').exists()).toBe(false);
    expect(w.findAll('[data-visitado="true"]')).toHaveLength(0);
    expect(w.emitted('interaccion')).toBeUndefined();
    expect(w.emitted('progreso')).toBeUndefined();
    expect(w.emitted('completada')).toBeUndefined();
    expect(escena.ultimasProps?.visitados).toEqual([]);
    expect(texto(w, 'anuncio')).toContain(mandibula.config.nodos.at(-1)!.etiqueta);
  });

  it('en revisar, repetir() (expuesto) no hace nada', async () => {
    const w = await montarListo(mandibula, { modo: 'revisar' });
    (w.vm as unknown as { repetir: () => void }).repetir();
    await flushPromises();
    expect(w.emitted('interaccion')).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------------------------
 * Degradación: la lista siempre completa la actividad
 * ----------------------------------------------------------------------------------------- */

describe('degradación del visor 3D', () => {
  it.each(['sin_webgl', 'error'])(
    'con la escena en "%s" se completa solo con la lista',
    async (estado) => {
      escena.estado = estado;
      const w = await montarListo(mandibula);
      const aviso = w.get('[data-testid="aviso-sin-3d"]');
      expect(aviso.text()).toContain('lista de partes');
      await completar(w, mandibula);
      expect(resultados(w)).toHaveLength(1);
      expect(resultados(w)[0]!.puntaje).toBe(30);
    },
  );

  it('en revisar el aviso habla de leer fichas, no de completar', async () => {
    escena.estado = 'sin_webgl';
    const w = await montarListo(mandibula, { modo: 'revisar' });
    expect(texto(w, 'aviso-sin-3d')).toContain('leer las fichas');
  });

  it('con la escena lista no hay aviso de degradación', async () => {
    const w = await montarListo(mandibula);
    expect(w.find('[data-testid="aviso-sin-3d"]').exists()).toBe(false);
  });
});

/* -------------------------------------------------------------------------------------------
 * Teclado y accesibilidad
 * ----------------------------------------------------------------------------------------- */

describe('teclado y lector de pantalla', () => {
  it('la lista son botones nativos en orden, alcanzables con Tab y con nombre accesible', async () => {
    const w = await montarListo(mandibula);
    const botones = w.findAll('[data-nodo]');
    for (const b of botones) {
      expect(b.attributes('tabindex')).toBeUndefined();
      expect(b.attributes('disabled')).toBeUndefined();
      expect(b.text().trim().length).toBeGreaterThan(2);
    }
    expect(botones.map((b) => b.attributes('data-nodo'))).toEqual(
      mandibula.config.nodos.map((n) => n.id),
    );
  });

  it('activar una parte con Enter o Espacio (teclado nativo: click) completa igual', async () => {
    const w = await montarListo(mandibula);
    for (const id of mandibula.config.requeridos) {
      const b = parte(w, id);
      (b.element as HTMLElement).focus();
      await b.trigger('keydown', { key: 'Enter' });
      // Un <button> nativo convierte Enter/Espacio en click; happy-dom no lo hace: se emula.
      await b.trigger('click');
    }
    expect(resultados(w)).toHaveLength(1);
  });

  it('expone una única región aria-live="polite" y anuncia sin depender del color', async () => {
    const w = await montarListo(mandibula);
    const vivas = w.findAll('[aria-live]');
    expect(vivas).toHaveLength(1);
    expect(vivas[0]!.attributes('aria-live')).toBe('polite');
    await visitar(w, 'condilo');
    expect(texto(w, 'anuncio')).toMatch(/Cóndilo.*Explorada.*Llevas 1 de 3/s);
    await visitar(w, 'condilo');
    expect(texto(w, 'anuncio')).toContain('Ya la habías explorado');
  });

  it('el estado "explorada" lleva texto (no solo color o icono) y los iconos son decorativos', async () => {
    const w = await montarListo(mandibula);
    await visitar(w, 'condilo');
    expect(parte(w, 'condilo').text()).toContain('Explorada');
    for (const svg of w.findAll('svg')) expect(svg.attributes('aria-hidden')).toBe('true');
  });

  it('las partes tienen al menos 44 px de alto (clase min-h-11) y la barra usa motion-safe', async () => {
    const w = await montarListo(mandibula);
    for (const b of w.findAll('[data-nodo]')) expect(b.classes()).toContain('min-h-11');
    expect(w.get('[role="progressbar"] > div').classes().join(' ')).toContain('motion-safe:');
  });

  it('el título de la lista y el del resultado son enfocables por programa pero no por Tab', async () => {
    const w = await montarListo(mandibula);
    const titulo = w.findAll('h4').find((h) => h.text() === 'Partes del modelo')!;
    expect(titulo.attributes('tabindex')).toBe('-1');
  });
});

/* -------------------------------------------------------------------------------------------
 * Configuraciones adversariales
 * ----------------------------------------------------------------------------------------- */

describe('configuraciones adversariales', () => {
  it('el mínimo del esquema: 2 nodos y un solo requerido', async () => {
    const actividad = crearActividad({ nodos: 2, requeridos: 1 });
    const w = await montarListo(actividad);
    expect(w.findAll('[data-nodo]')).toHaveLength(2);
    await visitar(w, actividad.config.requeridos[0]!);
    expect(resultados(w)).toHaveLength(1);
    expect(resultados(w)[0]!.detalle.visitados).toEqual(actividad.config.requeridos);
  });

  it('el máximo: 12 nodos, todos requeridos, en orden inverso', async () => {
    const actividad = crearActividad({ nodos: 12, requeridos: 12 });
    const w = await montarListo(actividad);
    const ids = actividad.config.nodos.map((n) => n.id).reverse();
    await visitar(w, ...ids.slice(0, 11));
    expect(w.emitted('completada')).toBeUndefined();
    await visitar(w, ids[11]!);
    expect(resultados(w)).toHaveLength(1);
    expect(problemasDeEmisiones(eventos(w), actividad)).toEqual([]);
  });

  it('un solo requerido entre varios: los demás son opcionales y no bloquean', async () => {
    const actividad = crearActividad({ nodos: 5, requeridos: 1 });
    const w = await montarListo(actividad);
    await visitar(w, actividad.config.nodos[4]!.id, actividad.config.nodos[3]!.id);
    expect(w.emitted('completada')).toBeUndefined();
    await visitar(w, actividad.config.requeridos[0]!);
    expect(resultados(w)).toHaveLength(1);
  });

  it('textos en el límite (etiqueta de 60, descripción de 500) no rompen y se pueden partir', async () => {
    const actividad = crearActividad({
      nodos: 3,
      requeridos: 3,
      etiqueta: (i) => `Etiqueta larguísima ${i} ${'x'.repeat(60)}`.slice(0, 60),
      descripcion: () => `Texto largo ${'palabra '.repeat(70)}`.slice(0, 500),
    });
    const w = await montarListo(actividad);
    await visitar(w, actividad.config.nodos[0]!.id);
    expect(texto(w, 'ficha')).toContain('Texto largo');
    expect(parte(w, actividad.config.nodos[0]!.id).find('.break-words').exists()).toBe(true);
  });

  it('ids de 64 caracteres: la interacción respeta el tope de 64 y la lista funciona', async () => {
    const actividad = crearActividad({
      nodos: 2,
      requeridos: 2,
      id: (i) => `n${i}_${'a'.repeat(61)}`,
    });
    const w = await montarListo(actividad);
    await completar(w, actividad);
    expect(problemasDeEmisiones(eventos(w), actividad)).toEqual([]);
    expect(resultados(w)).toHaveLength(1);
  });

  it('ids que coinciden con propiedades de Object no confunden a la actividad', async () => {
    const actividad = crearActividad({
      nodos: 3,
      requeridos: 3,
      id: (i) => ['constructor', 'proto_x', 'to_string'][i]!,
    });
    const w = await montarListo(actividad);
    await completar(w, actividad);
    expect(resultados(w)[0]!.detalle.visitados).toEqual(['constructor', 'proto_x', 'to_string']);
  });

  it('caracteres Unicode (acentos, ñ, emoji, escritura no latina) se muestran tal cual', async () => {
    const actividad = crearActividad({
      nodos: 2,
      requeridos: 2,
      etiqueta: (i) => ['Cóndilo Ñandú 🦴', 'Ω 骨 عظم'][i]!,
      descripcion: (i) => ['Ángulo y niño: «comillas» — raya.', '日本語のテキストと עברית ok.'][i]!,
    });
    const w = await montarListo(actividad);
    await visitar(w, actividad.config.nodos[1]!.id);
    expect(texto(w, 'ficha')).toContain('日本語');
    expect(parte(w, actividad.config.nodos[0]!.id).text()).toContain('Ñandú 🦴');
  });

  it('el HTML en los textos nunca se interpreta (markdown sin html)', async () => {
    const actividad = crearActividad({ nodos: 2, requeridos: 2 });
    // El esquema rechazaría este contenido; aquí se fuerza para comprobar la defensa del componente.
    for (const nodo of actividad.config.nodos) {
      nodo.etiqueta = `Nodo <b>x</b> <img src=x onerror=alert(1)>`;
      nodo.descripcion =
        'Texto <script>alert(1)</script> con <img src=x onerror="alert(1)"> dentro.';
    }
    actividad.instrucciones =
      'Instrucciones <iframe src="https://malo.example"></iframe> y **negrita**.';
    const w = await montarListo(actividad);
    await visitar(w, actividad.config.nodos[0]!.id);
    expect(w.find('script').exists()).toBe(false);
    expect(w.find('iframe').exists()).toBe(false);
    expect(w.find('img').exists()).toBe(false);
    expect(w.find('[onerror]').exists()).toBe(false);
    expect(w.find('strong').exists()).toBe(true);
    // El anuncio es solo texto (no crea elementos), y la etiqueta de la lista también.
    expect(w.get('[data-testid="anuncio"]').element.children).toHaveLength(0);
    expect(parte(w, actividad.config.nodos[0]!.id).find('img').exists()).toBe(false);
  });

  it('el Markdown restringido de la descripción se renderiza (negrita y cursiva)', async () => {
    const actividad = crearActividad({
      nodos: 2,
      requeridos: 2,
      descripcion: () => 'Se inserta el **masetero** y el *pterigoideo* medial aquí.',
    });
    const w = await montarListo(actividad);
    await visitar(w, actividad.config.nodos[0]!.id);
    const ficha = w.get('[data-testid="ficha"]');
    expect(ficha.find('strong').text()).toBe('masetero');
    expect(ficha.find('em').text()).toBe('pterigoideo');
    expect(texto(w, 'anuncio')).toContain('masetero');
    expect(texto(w, 'anuncio')).not.toContain('**');
  });

  it('ids repetidos en el contenido (esquema saltado): no duplica claves ni cuenta dos veces', async () => {
    const actividad = crearActividad({ nodos: 3, requeridos: 3 });
    actividad.config.nodos[2]!.id = actividad.config.nodos[0]!.id;
    actividad.config.requeridos = [actividad.config.nodos[0]!.id, actividad.config.nodos[1]!.id];
    const w = await montarListo(actividad);
    expect(w.findAll('[data-nodo]')).toHaveLength(2);
    await completar(w, actividad);
    expect(resultados(w)).toHaveLength(1);
  });

  it('requeridos que no existen (esquema saltado): exige todos los nodos y no se completa al vacío', async () => {
    const actividad = crearActividad({ nodos: 3, requeridos: 3 });
    actividad.config.requeridos = ['fantasma'];
    const w = await montarListo(actividad);
    await visitar(w, actividad.config.nodos[0]!.id);
    expect(w.emitted('completada')).toBeUndefined();
    await visitar(w, actividad.config.nodos[1]!.id, actividad.config.nodos[2]!.id);
    expect(resultados(w)).toHaveLength(1);
  });

  it('puntaje_max mínimo (1) y máximo (1000) se respetan con la fórmula común', async () => {
    for (const puntaje_max of [1, 1000]) {
      const actividad = crearActividad({ puntaje_max });
      const w = await montarListo(actividad);
      await completar(w, actividad);
      expect(resultados(w)[0]!.puntaje).toBe(puntaje_max);
      w.unmount();
    }
  });

  it('cambiar de modelo (props) vuelve a montar la escena', async () => {
    const w = await montarListo(mandibula);
    expect(escena.montajes).toBe(1);
    await w.setProps({ actividad: celulas } as never);
    await flushPromises();
    expect(escena.montajes).toBe(2);
    expect(escena.desmontajes).toBe(1);
  });
});

/* -------------------------------------------------------------------------------------------
 * Desmontaje y reglas del código
 * ----------------------------------------------------------------------------------------- */

describe('desmontaje', () => {
  it('desmontar libera la escena y no lanza ni escribe errores en la consola', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const w = await montarListo(mandibula);
    await visitar(w, 'condilo');
    expect(() => w.unmount()).not.toThrow();
    expect(escena.desmontajes).toBe(1);
    expect(error).not.toHaveBeenCalled();
    expect(aviso).not.toHaveBeenCalled();
  });

  it('desmontar antes de que cargue el visor no falla', async () => {
    const w = montar(mandibula);
    expect(() => w.unmount()).not.toThrow();
    await flushPromises();
  });
});

describe('reglas del código fuente (contrato)', () => {
  it('no importa three ni TresJS ni la escena de forma estática (carga perezosa)', () => {
    expect(fuenteDelComponente).not.toMatch(/from\s+['"]three/);
    expect(fuenteDelComponente).not.toMatch(/from\s+['"]@tresjs/);
    expect(fuenteDelComponente).not.toMatch(/import\s+EscenaExploracion\s+from/);
    expect(fuenteDelComponente).toMatch(/import\(['"]@\/scenes\/EscenaExploracion\.vue['"]\)/);
  });

  it('no usa v-html (el texto va por @/content/markdown) ni calcula el puntaje a mano', () => {
    expect(fuenteDelComponente).not.toContain('v-html');
    expect(fuenteDelComponente).toContain('calcularPuntaje');
    expect(fuenteDelComponente).toContain('crearEmisorProgreso');
  });

  it('usa los interfaces concretos del contrato', () => {
    expect(fuenteDelComponente).toContain('PropsActividadExploracion3d');
    expect(fuenteDelComponente).toContain('EmitsActividadExploracion3d');
  });
});
