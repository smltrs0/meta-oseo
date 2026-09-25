/**
 * Tiempo de estudio y sección actual del módulo (F2-10).
 *
 * Cada segundo con la pestaña visible (y la página activa) suma 1 a `tiempoEnSeccionSeg` del
 * contexto pedagógico y al acumulado que se envía a `PUT /api/progress/{n}` como
 * `tiempo_delta_seg`: cada `INTERVALO_TIEMPO_SEG` segundos, sin pasar de `TIEMPO_DELTA_MAX_SEG`
 * por petición, y también al cambiar de sección o de módulo, al ocultar la pestaña y al salir
 * (con `keepalive`, para que el navegador la termine aunque la página se cierre). Si un envío falla
 * el tiempo NO se pierde: sigue acumulado y se reintenta pasado otro intervalo.
 *
 * `seccion_actual` viaja en el mismo `PUT` cuando cambia.
 */
import { onBeforeUnmount, onMounted, watch } from 'vue';
import type { Ref } from 'vue';
import { INTERVALO_TIEMPO_SEG, TIEMPO_DELTA_MAX_SEG } from '@/config';
import { useActividadesStore } from '@/stores/actividades';
import { useContextoStore } from '@/stores/contextoPedagogico';
import type { CuerpoProgresoModulo } from '@/types/api';

export interface OpcionesTiempoModulo {
  modulo: Ref<number>;
  /** Id de la sección abierta, o `null` mientras no hay una (cargando, error, bloqueado). */
  seccion: Ref<string | null>;
  /** `false` mientras la página no muestra contenido de estudio: no se cuenta ni se envía. */
  activo: Ref<boolean>;
}

export function useTiempoModulo(opciones: OpcionesTiempoModulo): {
  enviarAhora: () => Promise<void>;
} {
  const store = useActividadesStore();
  const contexto = useContextoStore();

  let acumulado = 0;
  let umbral = INTERVALO_TIEMPO_SEG;
  let seccionEnviada: string | null = null;
  let enviando = false;
  let intervalo: ReturnType<typeof setInterval> | undefined;

  async function enviarPara(
    modulo: number,
    seccion: string | null,
    keepalive = false,
  ): Promise<void> {
    if (enviando) return;
    const delta = Math.min(acumulado, TIEMPO_DELTA_MAX_SEG);
    const cambioSeccion = seccion !== null && seccion !== seccionEnviada;
    if (delta <= 0 && !cambioSeccion) return;

    const cuerpo: CuerpoProgresoModulo = { tiempo_delta_seg: delta };
    if (seccion !== null) cuerpo.seccion_actual = seccion;

    enviando = true;
    try {
      const r = await store.enviarProgresoModulo(modulo, cuerpo, { keepalive });
      if (r.ok) {
        acumulado = Math.max(0, acumulado - delta);
        umbral = INTERVALO_TIEMPO_SEG;
        if (seccion !== null) seccionEnviada = seccion;
      } else {
        // Sigue acumulado: se reintenta pasado otro intervalo (sin martillar la API cada segundo).
        umbral = acumulado + INTERVALO_TIEMPO_SEG;
      }
    } finally {
      enviando = false;
    }
  }

  function enviarAhora(keepalive = false): Promise<void> {
    if (!opciones.activo.value) return Promise.resolve();
    return enviarPara(opciones.modulo.value, opciones.seccion.value, keepalive);
  }

  function tick(): void {
    if (!opciones.activo.value || document.visibilityState === 'hidden') return;
    contexto.tickTiempo(1);
    acumulado += 1;
    if (acumulado >= umbral) void enviarAhora();
  }

  function alCambiarVisibilidad(): void {
    if (document.visibilityState === 'hidden') void enviarAhora(true);
  }

  function alSalirDeLaPagina(): void {
    void enviarAhora(true);
  }

  // Cambio de sección: se guarda (con el tiempo acumulado) y el contexto ya reinicia el suyo.
  watch(
    () => opciones.seccion.value,
    () => {
      void enviarAhora();
    },
  );

  // Cambio de módulo: el tiempo acumulado pertenece al módulo anterior.
  watch(
    () => opciones.modulo.value,
    (_nuevo, anterior) => {
      if (opciones.activo.value) {
        // `seccion` ya cambió; el tiempo del módulo anterior se le abona SIN mover su sección.
        void enviarPara(anterior, null, true);
      }
      acumulado = 0;
      umbral = INTERVALO_TIEMPO_SEG;
      seccionEnviada = null;
    },
    { flush: 'sync' },
  );

  onMounted(() => {
    intervalo = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('pagehide', alSalirDeLaPagina);
  });

  onBeforeUnmount(() => {
    clearInterval(intervalo);
    document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    window.removeEventListener('pagehide', alSalirDeLaPagina);
    void enviarAhora(true);
  });

  return { enviarAhora: () => enviarAhora() };
}
