import { describe, expect, it } from 'vitest';
import { muestra, validar } from '@/content/__fixtures__/utiles';
import { moduloPorNumero } from '@/data/modulos';
import {
  decidirAccesoModulo,
  mensajeModuloBloqueado,
  pendientesDeSeccion,
  textoDuracion,
  textoPendientes,
  titulosDeActividades,
} from './acceso';

const modulo = validar(muestra()).modulo!;
const activo = { bloqueoSecuencial: true, progresoConocido: true };

describe('decidirAccesoModulo', () => {
  it('el módulo 1 siempre está abierto', () => {
    expect(decidirAccesoModulo(1, [], activo)).toEqual({ permitido: true });
  });

  it('un módulo se abre cuando el anterior está completado y lleva al primer módulo pendiente si no', () => {
    expect(decidirAccesoModulo(2, [1], activo)).toEqual({ permitido: true });
    const d = decidirAccesoModulo(3, [1], activo);
    expect(d.permitido).toBe(false);
    if (!d.permitido) {
      expect(d.requerido.numero).toBe(2);
      expect(d.destino).toBe(2);
    }
  });

  it('un módulo completado nunca se vuelve a cerrar', () => {
    expect(decidirAccesoModulo(4, [4], activo)).toEqual({ permitido: true });
  });

  it('sin bloqueo o sin progreso conocido no se bloquea a nadie', () => {
    expect(
      decidirAccesoModulo(5, [], { bloqueoSecuencial: false, progresoConocido: true }),
    ).toEqual({ permitido: true });
    expect(
      decidirAccesoModulo(5, [], { bloqueoSecuencial: true, progresoConocido: false }),
    ).toEqual({ permitido: true });
  });

  it('el mensaje dice qué módulo falta', () => {
    const requerido = moduloPorNumero(2)!;
    const texto = mensajeModuloBloqueado(3, requerido);
    expect(texto).toContain('módulo 3');
    expect(texto).toContain('Antes completa el módulo 2');
  });
});

describe('pendientes de una sección', () => {
  const seccion = modulo.secciones[1]!; // funciones: dos obligatorias

  it('lista las obligatorias sin superar y las explica', () => {
    const p = pendientesDeSeccion(seccion, new Set(), {});
    expect(p.map((x) => x.id)).toEqual(['m1_celulas_funciones', 'm1_animacion_remodelado']);
    expect(p[0]?.motivo).toBe('sin_hacer');
    expect(textoPendientes(p)).toContain('completa la actividad obligatoria');
    expect(textoPendientes(p)).toContain('y 1 más de esta sección');
  });

  it('distingue una actividad terminada que no llegó al mínimo de precisión', () => {
    const repaso = modulo.secciones[3]!;
    const p = pendientesDeSeccion(repaso, new Set(['m1_identifica_celulas']), {
      m1_quiz_repaso: { completada: true, mejorPrecision: 0.4 },
    });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ id: 'm1_quiz_repaso', motivo: 'precision', minimoPorcentaje: 60 });
    expect(textoPendientes(p)).toContain('al menos 60 % de acierto');
  });

  it('sin pendientes no dice nada', () => {
    expect(textoPendientes([])).toBe('');
  });

  it('titulosDeActividades traduce ids y deja los desconocidos tal cual', () => {
    const titulos = titulosDeActividades(modulo.secciones, ['m1_capas_hueso', 'no_existe']);
    expect(titulos[0]).not.toBe('m1_capas_hueso');
    expect(titulos[1]).toBe('no_existe');
  });
});

describe('textoDuracion', () => {
  it('escribe minutos y horas', () => {
    expect(textoDuracion(40)).toBe('40 min');
    expect(textoDuracion(60)).toBe('1 h');
    expect(textoDuracion(90)).toBe('1 h 30 min');
  });
});
