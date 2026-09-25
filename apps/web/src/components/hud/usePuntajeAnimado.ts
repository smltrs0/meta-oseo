/**
 * Contador del puntaje con una animación breve (0.6 s) al cambiar, con moderación:
 *  - solo anima cambios que ocurren con datos ya cargados; la carga inicial (0 → 120) o el
 *    cierre de sesión saltan directo al valor, sin cuenta que distraiga;
 *  - con `prefers-reduced-motion` no anima nunca (y ni siquiera se descarga GSAP);
 *  - un cambio nuevo cancela el anterior y arranca desde el valor que se estaba mostrando.
 *
 * El número animado es solo visual: el HUD lo marca `aria-hidden` y anuncia el valor final
 * por otra vía (useAnuncioPuntaje), así el lector de pantalla no oye cada cifra intermedia.
 */
import { onScopeDispose, ref, watch } from 'vue';
import type { Ref } from 'vue';
import { obtenerGsap } from '@/components/menu/gsapPerezoso';
import type { Gsap } from '@/components/menu/gsapPerezoso';

const DURACION_S = 0.6;

export function usePuntajeAnimado(
  puntaje: Readonly<Ref<number>>,
  cargado: Readonly<Ref<boolean>>,
  reducido: Readonly<Ref<boolean>>,
): Readonly<Ref<number>> {
  const mostrado = ref(puntaje.value);
  // Objeto plano que GSAP interpola; el valor entero que se ve va a `mostrado`.
  const estado = { valor: puntaje.value };
  let tween: ReturnType<Gsap['to']> | null = null;

  function detener(): void {
    tween?.kill();
    tween = null;
  }

  watch([puntaje, cargado], ([nuevo, ahoraCargado], [, antesCargado]) => {
    detener();
    // Sin GSAP descargado todavía (se carga aparte) tampoco se anima: salto directo.
    const gsap = obtenerGsap();
    if (!gsap || reducido.value || !antesCargado || !ahoraCargado) {
      estado.valor = nuevo;
      mostrado.value = nuevo;
      return;
    }
    tween = gsap.to(estado, {
      valor: nuevo,
      duration: DURACION_S,
      ease: 'power1.out',
      onUpdate: () => {
        mostrado.value = Math.round(estado.valor);
      },
      onComplete: () => {
        mostrado.value = nuevo;
        tween = null;
      },
    });
  });

  onScopeDispose(detener);
  return mostrado;
}
