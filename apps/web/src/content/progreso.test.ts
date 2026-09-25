import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROGRESO_INTERVALO_MIN_MS } from './constantes';
import { crearEmisorProgreso } from './progreso';

describe('crearEmisorProgreso', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('la primera emisión sale enseguida y las siguientes se agrupan en una con el último valor', () => {
    const enviar = vi.fn();
    const emisor = crearEmisorProgreso<number>(enviar);
    emisor.emitir(1);
    expect(enviar.mock.calls).toEqual([[1]]);
    emisor.emitir(2);
    emisor.emitir(3);
    emisor.emitir(4);
    expect(enviar).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(PROGRESO_INTERVALO_MIN_MS);
    expect(enviar.mock.calls).toEqual([[1], [4]]);
  });

  it('nunca emite dos veces con menos de 300 ms de diferencia', () => {
    const marcas: number[] = [];
    const emisor = crearEmisorProgreso<number>(() => marcas.push(Date.now()));
    for (let i = 0; i < 50; i++) {
      emisor.emitir(i);
      vi.advanceTimersByTime(37);
    }
    vi.advanceTimersByTime(1000);
    expect(marcas.length).toBeGreaterThan(3);
    for (let i = 1; i < marcas.length; i++) {
      expect(marcas[i]! - marcas[i - 1]!).toBeGreaterThanOrEqual(PROGRESO_INTERVALO_MIN_MS);
    }
  });

  it('sale enseguida si ya pasó el intervalo desde la última emisión', () => {
    const enviar = vi.fn();
    const emisor = crearEmisorProgreso<number>(enviar);
    emisor.emitir(1);
    vi.advanceTimersByTime(PROGRESO_INTERVALO_MIN_MS + 1);
    emisor.emitir(2);
    expect(enviar.mock.calls).toEqual([[1], [2]]);
  });

  it('cerrar() cancela el progreso pendiente: no sale DESPUÉS de completada', () => {
    const enviar = vi.fn();
    const emisor = crearEmisorProgreso<number>(enviar);
    emisor.emitir(1);
    emisor.emitir(2); // pendiente
    emisor.cerrar(); // se emite "completada" aquí
    vi.advanceTimersByTime(PROGRESO_INTERVALO_MIN_MS * 5);
    expect(enviar.mock.calls).toEqual([[1]]);
    expect(emisor.cerrado).toBe(true);
    // Cerrado, no emite más.
    emisor.emitir(3);
    vi.advanceTimersByTime(1000);
    expect(enviar.mock.calls).toEqual([[1]]);
  });

  it('reabrir() permite otro intento y vuelve a emitir a la primera', () => {
    const enviar = vi.fn();
    const emisor = crearEmisorProgreso<number>(enviar);
    emisor.emitir(1);
    emisor.cerrar();
    emisor.reabrir();
    emisor.emitir(9);
    expect(enviar.mock.calls).toEqual([[1], [9]]);
  });

  it('vaciar() al desmontar emite el último pendiente si no está cerrado, y no si lo está', () => {
    const abierto = vi.fn();
    const a = crearEmisorProgreso<number>(abierto);
    a.emitir(1);
    a.emitir(2);
    a.vaciar();
    expect(abierto.mock.calls).toEqual([[1], [2]]);
    vi.advanceTimersByTime(1000);
    expect(abierto).toHaveBeenCalledTimes(2);

    const cerrado = vi.fn();
    const b = crearEmisorProgreso<number>(cerrado);
    b.emitir(1);
    b.emitir(2);
    b.cerrar();
    b.vaciar();
    expect(cerrado.mock.calls).toEqual([[1]]);
  });

  it('un limitador ingenuo (solo retrasa) SÍ emite tras completar: es el fallo que se evita', () => {
    // Control negativo: demuestra que la prueba distingue el comportamiento correcto del errado.
    const salidas: string[] = [];
    let pendiente: number | null = null;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    const ingenuo = (valor: number) => {
      pendiente = valor;
      temporizador ??= setTimeout(() => {
        salidas.push(`progreso:${pendiente}`);
        temporizador = null;
      }, PROGRESO_INTERVALO_MIN_MS);
    };
    ingenuo(1);
    ingenuo(2);
    salidas.push('completada');
    vi.advanceTimersByTime(PROGRESO_INTERVALO_MIN_MS);
    expect(salidas).toEqual(['completada', 'progreso:2']);

    const buenas: string[] = [];
    const emisor = crearEmisorProgreso<number>((v) => buenas.push(`progreso:${v}`));
    emisor.emitir(1);
    emisor.emitir(2);
    emisor.cerrar();
    buenas.push('completada');
    vi.advanceTimersByTime(PROGRESO_INTERVALO_MIN_MS);
    expect(buenas).toEqual(['progreso:1', 'completada']);
  });
});
