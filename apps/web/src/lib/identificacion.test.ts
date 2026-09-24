import { describe, expect, it } from 'vitest';
import {
  TIPOS_IDENTIFICACION,
  TIPO_POR_DEFECTO,
  esSoloNumerico,
  esTipoIdentificacion,
  etiquetaDeTipo,
  normalizarNombre,
  normalizarNumero,
  validarNombre,
  validarNumero,
} from './identificacion';

describe('tipos de identificación', () => {
  it('son exactamente los 7 del contrato, con su etiqueta', () => {
    expect(TIPOS_IDENTIFICACION.map((t) => [t.codigo, t.etiqueta])).toEqual([
      ['CC', 'Cédula de ciudadanía'],
      ['TI', 'Tarjeta de identidad'],
      ['CE', 'Cédula de extranjería'],
      ['PA', 'Pasaporte'],
      ['RC', 'Registro civil'],
      ['PEP', 'Permiso especial de permanencia'],
      ['PPT', 'Permiso por protección temporal'],
    ]);
  });

  it('reconoce códigos válidos y rechaza el resto', () => {
    expect(esTipoIdentificacion('PPT')).toBe(true);
    expect(esTipoIdentificacion('cc')).toBe(false);
    expect(esTipoIdentificacion('DNI')).toBe(false);
    expect(esTipoIdentificacion(undefined)).toBe(false);
  });

  it('abre con CC y solo el pasaporte admite letras en el teclado', () => {
    expect(TIPO_POR_DEFECTO).toBe('CC');
    expect(etiquetaDeTipo('PA')).toBe('Pasaporte');
    expect(esSoloNumerico('CC')).toBe(true);
    expect(esSoloNumerico('PA')).toBe(false);
  });
});

describe('normalizarNumero', () => {
  it.each([
    ['1.023.456-789', '1023456789'],
    ['  1 023 456 789 ', '1023456789'],
    ['ab-123.456', 'AB123456'],
    ['a1b2c3d4', 'A1B2C3D4'],
    ['', ''],
  ])('%j -> %j', (entrada, esperado) => {
    expect(normalizarNumero(entrada)).toBe(esperado);
  });
});

describe('validarNumero', () => {
  it('acepta y devuelve el número normalizado', () => {
    expect(validarNumero('1.023.456-789')).toEqual({ ok: true, valor: '1023456789' });
    expect(validarNumero('ab 1234')).toEqual({ ok: true, valor: 'AB1234' });
  });

  it('acepta los límites 4 y 20 caracteres', () => {
    expect(validarNumero('1234')).toEqual({ ok: true, valor: '1234' });
    const veinte = '1'.repeat(20);
    expect(validarNumero(veinte)).toEqual({ ok: true, valor: veinte });
  });

  it('rechaza vacío, corto, largo y caracteres no permitidos', () => {
    const vacio = validarNumero('   ');
    expect(vacio.ok).toBe(false);
    if (!vacio.ok) expect(vacio.error).toMatch(/Escribe tu número/);

    const corto = validarNumero('123');
    expect(corto.ok).toBe(false);
    if (!corto.ok) expect(corto.error).toMatch(/muy corto/);

    const largo = validarNumero('1'.repeat(21));
    expect(largo.ok).toBe(false);
    if (!largo.ok) expect(largo.error).toMatch(/muy largo/);

    for (const malo of ['12#45', 'ñ1234', '12_34', '1234!']) {
      const r = validarNumero(malo);
      expect(r.ok, malo).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/solo letras y números/);
    }
  });
});

describe('normalizarNombre y validarNombre', () => {
  it('recorta y colapsa espacios internos sin tocar mayúsculas ni acentos', () => {
    expect(normalizarNombre('  María   José  ')).toBe('María José');
    expect(validarNombre('  María   José  ')).toEqual({ ok: true, valor: 'María José' });
  });

  it('acepta acentos, ñ, apóstrofes y guiones', () => {
    for (const nombre of ["O'Brien", 'Peña-Núñez', 'Ángela', 'D’Alessandro']) {
      expect(validarNombre(nombre)).toEqual({ ok: true, valor: nombre });
    }
  });

  it('rechaza vacío o solo espacios, con el campo en el mensaje', () => {
    const r = validarNombre('   ', 'apellido');
    expect(r).toEqual({ ok: false, error: 'Escribe tu apellido.' });
  });

  it('rechaza caracteres de control (NUL, tabulación, salto de línea, escape)', () => {
    for (const malo of ['Ana\u0000', 'Ana\tPérez', 'Ana\nPérez', '\u001bAna', 'A\u007fna']) {
      const r = validarNombre(malo);
      expect(r.ok, JSON.stringify(malo)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/caracteres no permitidos/);
    }
  });

  it('permite 80 caracteres y rechaza 81 (cuenta puntos de código, no unidades UTF-16)', () => {
    expect(validarNombre('a'.repeat(80)).ok).toBe(true);
    const largo = validarNombre('a'.repeat(81));
    expect(largo.ok).toBe(false);
    if (!largo.ok) expect(largo.error).toMatch(/hasta 80/);
    // 80 caracteres astrales (2 unidades UTF-16 cada uno) siguen siendo 80 para el servidor.
    expect(validarNombre('😀'.repeat(80)).ok).toBe(true);
    expect(validarNombre('😀'.repeat(81)).ok).toBe(false);
  });

  it('el límite se mide DESPUÉS de colapsar espacios', () => {
    const conEspacios = 'a'.repeat(40) + '     ' + 'b'.repeat(39); // 40 + 1 + 39 = 80
    expect(validarNombre(conEspacios).ok).toBe(true);
  });
});
