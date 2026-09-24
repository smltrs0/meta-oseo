import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useProgresoStore } from '@/stores/progreso';
import { useContextoStore } from './contextoPedagogico';
import type { ContextoPedagogico } from './contextoPedagogico';

/**
 * El contrato (docs/api-contract.md) exige validar el contexto en ambos lados. Este schema
 * transcribe sus restricciones y comprueba que toPayload() siempre las cumple.
 */
const texto64 = z.string().max(64);
const contextoSchema = z.strictObject({
  modulo: z.number().int().min(1).max(6),
  seccion: texto64,
  actividadActual: z
    .strictObject({
      id: texto64,
      tipo: z.enum([
        'multicapa',
        'arrastre-molecular',
        'relacion-columnas',
        'quiz',
        'video-texto',
        'exploracion-3d',
      ]),
      intentos: z.number(),
      completada: z.boolean(),
    })
    .optional(),
  estructuraSeleccionada: texto64.optional(),
  moleculaSeleccionada: texto64.optional(),
  nivel: z.enum(['pregrado', 'posgrado']),
  tiempoEnSeccionSeg: z.number().int().min(0),
  interaccionesRecientes: z.array(texto64).max(10),
  progreso: z.strictObject({
    modulosCompletados: z.array(z.number().int().min(1).max(6)),
    puntajeTotal: z.number(),
    logros: z.array(z.string()),
  }),
});

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('store contextoPedagogico: valores iniciales y toPayload', () => {
  it('arranca en el módulo 1, sección inicial, pregrado y sin nada seleccionado', () => {
    const payload = useContextoStore().toPayload();
    expect(payload).toEqual({
      modulo: 1,
      seccion: 'inicio',
      nivel: 'pregrado',
      tiempoEnSeccionSeg: 0,
      interaccionesRecientes: [],
      progreso: { modulosCompletados: [], puntajeTotal: 0, logros: [] },
    });
    // Las claves opcionales vacías no viajan en el payload.
    expect('actividadActual' in payload).toBe(false);
    expect('estructuraSeleccionada' in payload).toBe(false);
    expect('moleculaSeleccionada' in payload).toBe(false);
    expect(contextoSchema.safeParse(payload).success).toBe(true);
  });

  it('toPayload refleja todo el estado y toma el progreso del store de progreso', () => {
    const ctx = useContextoStore();
    const progreso = useProgresoStore();
    progreso.modulos[0]!.completado = true;
    progreso.modulos[2]!.completado = true;
    progreso.puntajeTotal = 240;
    progreso.logros = ['primer_hueso', 'constructor'];

    ctx.setModulo(3);
    ctx.setSeccion('mecanotransduccion');
    ctx.setActividad({
      id: 'm3_arrastre',
      tipo: 'arrastre-molecular',
      intentos: 2,
      completada: false,
    });
    ctx.setEstructura('osteocito');
    ctx.setMolecula('RANKL');
    ctx.setNivel('posgrado');
    ctx.tickTiempo(45);
    ctx.registrarInteraccion('toco_capa_osteocito');

    const payload: ContextoPedagogico = ctx.toPayload();
    expect(payload).toEqual({
      modulo: 3,
      seccion: 'mecanotransduccion',
      actividadActual: {
        id: 'm3_arrastre',
        tipo: 'arrastre-molecular',
        intentos: 2,
        completada: false,
      },
      estructuraSeleccionada: 'osteocito',
      moleculaSeleccionada: 'RANKL',
      nivel: 'posgrado',
      tiempoEnSeccionSeg: 45,
      interaccionesRecientes: ['toco_capa_osteocito'],
      progreso: {
        modulosCompletados: [1, 3],
        puntajeTotal: 240,
        logros: ['primer_hueso', 'constructor'],
      },
    });
    expect(contextoSchema.safeParse(payload).success).toBe(true);
  });

  it('toPayload devuelve copias: mutarlas no altera el store', () => {
    const ctx = useContextoStore();
    ctx.registrarInteraccion('a');
    const payload = ctx.toPayload();
    payload.interaccionesRecientes.push('intruso');
    payload.progreso.logros.push('falso');
    expect(ctx.interaccionesRecientes).toEqual(['a']);
    expect(useProgresoStore().logros).toEqual([]);
  });

  it('el JSON serializado no contiene claves undefined', () => {
    const ctx = useContextoStore();
    ctx.setEstructura('condilo');
    ctx.setEstructura(undefined);
    expect(Object.keys(JSON.parse(JSON.stringify(ctx.toPayload())))).not.toContain(
      'estructuraSeleccionada',
    );
  });
});

describe('store contextoPedagogico: interacciones recientes (máximo 10)', () => {
  it('conserva solo las 10 últimas y descarta las más antiguas', () => {
    const ctx = useContextoStore();
    for (let i = 1; i <= 15; i++) ctx.registrarInteraccion(`evento_${i}`);
    expect(ctx.interaccionesRecientes).toHaveLength(10);
    expect(ctx.interaccionesRecientes[0]).toBe('evento_6');
    expect(ctx.interaccionesRecientes[9]).toBe('evento_15');
    expect(ctx.toPayload().interaccionesRecientes).toHaveLength(10);
  });

  it('exactamente 10 no descarta nada; el 11 descarta el primero', () => {
    const ctx = useContextoStore();
    for (let i = 1; i <= 10; i++) ctx.registrarInteraccion(`e${i}`);
    expect(ctx.interaccionesRecientes[0]).toBe('e1');
    ctx.registrarInteraccion('e11');
    expect(ctx.interaccionesRecientes[0]).toBe('e2');
  });

  it('ignora eventos vacíos y recorta a 64 caracteres (límite del contrato)', () => {
    const ctx = useContextoStore();
    ctx.registrarInteraccion('   ');
    ctx.registrarInteraccion('x'.repeat(200));
    expect(ctx.interaccionesRecientes).toHaveLength(1);
    expect(ctx.interaccionesRecientes[0]).toHaveLength(64);
    expect(contextoSchema.safeParse(ctx.toPayload()).success).toBe(true);
  });
});

describe('store contextoPedagogico: acciones', () => {
  it('setModulo a otro módulo reinicia sección, tiempo y selección; al mismo módulo no', () => {
    const ctx = useContextoStore();
    ctx.setModulo(2);
    ctx.setSeccion('osteoblastos');
    ctx.setEstructura('osteoblasto');
    ctx.tickTiempo(30);

    ctx.setModulo(2);
    expect(ctx.seccion).toBe('osteoblastos');
    expect(ctx.tiempoEnSeccionSeg).toBe(30);

    ctx.setModulo(5);
    expect(ctx.modulo).toBe(5);
    expect(ctx.seccion).toBe('inicio');
    expect(ctx.tiempoEnSeccionSeg).toBe(0);
    expect(ctx.estructuraSeleccionada).toBeUndefined();
  });

  it('setSeccion a otra sección reinicia tiempo y selección, pero conserva las interacciones', () => {
    const ctx = useContextoStore();
    ctx.setSeccion('a');
    ctx.tickTiempo(10);
    ctx.setMolecula('OPG');
    ctx.registrarInteraccion('algo');
    ctx.setSeccion('a');
    expect(ctx.tiempoEnSeccionSeg).toBe(10);
    ctx.setSeccion('b');
    expect(ctx.tiempoEnSeccionSeg).toBe(0);
    expect(ctx.moleculaSeleccionada).toBeUndefined();
    expect(ctx.interaccionesRecientes).toEqual(['algo']);
  });

  it('setSeccion vacía vuelve a la sección inicial y recorta a 64', () => {
    const ctx = useContextoStore();
    ctx.setSeccion('   ');
    expect(ctx.seccion).toBe('inicio');
    ctx.setSeccion('s'.repeat(100));
    expect(ctx.seccion).toHaveLength(64);
  });

  it('setEstructura y setMolecula aceptan undefined para limpiar', () => {
    const ctx = useContextoStore();
    ctx.setEstructura('condilo');
    ctx.setMolecula('BMP-2');
    expect(ctx.toPayload().estructuraSeleccionada).toBe('condilo');
    expect(ctx.toPayload().moleculaSeleccionada).toBe('BMP-2');
    ctx.setEstructura(undefined);
    ctx.setMolecula(undefined);
    expect(ctx.estructuraSeleccionada).toBeUndefined();
    expect(ctx.moleculaSeleccionada).toBeUndefined();
  });

  it('tickTiempo suma segundos enteros y descarta valores no válidos', () => {
    const ctx = useContextoStore();
    ctx.tickTiempo();
    ctx.tickTiempo(4);
    ctx.tickTiempo(2.9);
    ctx.tickTiempo(-5);
    ctx.tickTiempo(0);
    ctx.tickTiempo(Number.NaN);
    expect(ctx.tiempoEnSeccionSeg).toBe(1 + 4 + 2);
    expect(Number.isInteger(ctx.toPayload().tiempoEnSeccionSeg)).toBe(true);
  });

  it('setNivel cambia el nivel', () => {
    const ctx = useContextoStore();
    ctx.setNivel('posgrado');
    expect(ctx.toPayload().nivel).toBe('posgrado');
  });

  it('reset vuelve al estado inicial', () => {
    const ctx = useContextoStore();
    ctx.setModulo(6);
    ctx.setSeccion('x');
    ctx.setNivel('posgrado');
    ctx.setEstructura('y');
    ctx.registrarInteraccion('z');
    ctx.tickTiempo(9);
    ctx.reset();
    expect(ctx.toPayload()).toEqual({
      modulo: 1,
      seccion: 'inicio',
      nivel: 'pregrado',
      tiempoEnSeccionSeg: 0,
      interaccionesRecientes: [],
      progreso: { modulosCompletados: [], puntajeTotal: 0, logros: [] },
    });
  });
});
