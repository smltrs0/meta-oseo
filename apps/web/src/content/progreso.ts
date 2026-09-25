/**
 * Emisor de `progreso` para los componentes de actividad (activities/types.ts).
 *
 * El contrato dice que `progreso` no se emite más de una vez cada 300 ms. Un limitador que
 * solo retrasa ("trailing") tiene un fallo clásico: el último `progreso` sale DESPUÉS de
 * `completada`, la página lo guarda otra vez y, al recargar, se restaura un intento que ya estaba
 * terminado. Este emisor lo evita con tres reglas, que los seis componentes obtienen gratis:
 *  1. La primera emisión sale enseguida y las siguientes se agrupan en una sola, con el último
 *     valor, cuando pasa el intervalo.
 *  2. `cerrar()` (al emitir `completada`) cancela el `progreso` pendiente y descarta los nuevos
 *     hasta `reabrir()` (empieza otro intento).
 *  3. `vaciar()` (al desmontar) emite lo pendiente solo si no está cerrado, y libera el temporizador.
 *
 * Usa `setTimeout` y `Date.now()` globales: con `vi.useFakeTimers()` las pruebas lo controlan.
 */
import { PROGRESO_INTERVALO_MIN_MS } from './constantes';

export interface EmisorProgreso<P> {
  /** Pide emitir `progreso`; respeta el intervalo mínimo. No hace nada si está cerrado. */
  emitir(progreso: P): void;
  /** Se llama justo antes o después de emitir `completada`: cancela lo pendiente y bloquea. */
  cerrar(): void;
  /** Vuelve a permitir emisiones (el estudiante empezó otro intento). */
  reabrir(): void;
  /** Al desmontar: emite el último progreso pendiente (si no está cerrado) y libera el temporizador. */
  vaciar(): void;
  /** ¿Está cerrado? (útil en pruebas). */
  readonly cerrado: boolean;
}

export function crearEmisorProgreso<P>(
  enviar: (progreso: P) => void,
  intervaloMs: number = PROGRESO_INTERVALO_MIN_MS,
): EmisorProgreso<P> {
  let cerrado = false;
  let ultimaEmision = Number.NEGATIVE_INFINITY;
  let pendiente: { valor: P } | null = null;
  let temporizador: ReturnType<typeof setTimeout> | null = null;

  function soltarTemporizador(): void {
    if (temporizador !== null) {
      clearTimeout(temporizador);
      temporizador = null;
    }
  }

  function despachar(valor: P): void {
    ultimaEmision = Date.now();
    enviar(valor);
  }

  return {
    emitir(progreso) {
      if (cerrado) return;
      const espera = ultimaEmision + intervaloMs - Date.now();
      if (espera <= 0 && temporizador === null) {
        pendiente = null;
        despachar(progreso);
        return;
      }
      pendiente = { valor: progreso };
      if (temporizador === null) {
        temporizador = setTimeout(
          () => {
            temporizador = null;
            const p = pendiente;
            pendiente = null;
            if (p && !cerrado) despachar(p.valor);
          },
          Math.max(0, espera),
        );
      }
    },
    cerrar() {
      cerrado = true;
      pendiente = null;
      soltarTemporizador();
    },
    reabrir() {
      cerrado = false;
      ultimaEmision = Number.NEGATIVE_INFINITY;
    },
    vaciar() {
      soltarTemporizador();
      const p = pendiente;
      pendiente = null;
      if (p && !cerrado) despachar(p.valor);
    },
    get cerrado() {
      return cerrado;
    },
  };
}
