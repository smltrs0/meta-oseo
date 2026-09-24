/**
 * Progreso del estudiante: módulos, puntaje total y logros (GET /api/progress y
 * GET /api/achievements). Lo leen el menú circular, el HUD y el contexto pedagógico.
 *
 * Degrada con gracia: si la API falla (o no hay sesión con token, como en el modo de
 * desarrollo sin backend) el store conserva valores por defecto coherentes (6 módulos
 * sin completar, 0 puntos, catálogo de logros de respaldo) y expone `error` para que la
 * interfaz avise sin bloquearse.
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { TOTAL_MODULOS } from '@/config';
import { catalogoDeRespaldo } from '@/data/logros';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import type { Logro, LogrosResponse, ModuloProgress, ProgresoResponse } from '@/types/api';

function modulosPorDefecto(): ModuloProgress[] {
  return Array.from({ length: TOTAL_MODULOS }, (_, i) => ({
    modulo: i + 1,
    seccion_actual: null,
    completado: false,
    tiempo_total_seg: 0,
    updated_at: null,
  }));
}

export const useProgresoStore = defineStore('progreso', () => {
  /** Siempre 6 elementos, ordenados por número de módulo. */
  const modulos = ref<ModuloProgress[]>(modulosPorDefecto());
  const puntajeTotal = ref(0);
  /** Códigos de los logros obtenidos. */
  const logros = ref<string[]>([]);
  /** Catálogo completo (obtenidos y pendientes), para mostrar nombre y descripción. */
  const catalogoLogros = ref<Logro[]>(catalogoDeRespaldo());

  const loading = ref(false);
  /** `true` tras una carga exitosa de GET /api/progress. */
  const loaded = ref(false);
  /** Mensaje en español si no se pudo cargar el progreso; `null` si todo va bien. */
  const error = ref<string | null>(null);

  /** Números (1 a 6) de los módulos completados. */
  const modulosCompletados = computed(() =>
    modulos.value.filter((m) => m.completado).map((m) => m.modulo),
  );

  /** Primer logro del catálogo que aún no se obtuvo; `null` si ya se obtuvieron todos. */
  const siguienteLogro = computed<Logro | null>(
    () => catalogoLogros.value.find((l) => !logros.value.includes(l.codigo)) ?? null,
  );

  function estaCompletado(numero: number): boolean {
    return modulosCompletados.value.includes(numero);
  }

  // Se incrementa en reset(): una carga que termina después de cerrar sesión no debe
  // escribir los datos del estudiante anterior.
  let generacion = 0;
  let enCurso: Promise<void> | null = null;

  function aplicarProgreso(datos: ProgresoResponse): void {
    // El contrato garantiza 6 módulos, pero se completa lo que falte por si acaso.
    const porNumero = new Map(datos.modulos.map((m) => [m.modulo, m]));
    modulos.value = modulosPorDefecto().map((vacio) => porNumero.get(vacio.modulo) ?? vacio);
    puntajeTotal.value = datos.puntaje_total;
    logros.value = [...datos.logros];
  }

  async function cargarDesdeApi(mia: number): Promise<void> {
    loading.value = true;
    try {
      const [progreso, catalogo] = await Promise.allSettled([
        apiFetch<ProgresoResponse>('/progress'),
        apiFetch<LogrosResponse>('/achievements'),
      ]);
      if (mia !== generacion) return;
      if (progreso.status === 'fulfilled') {
        aplicarProgreso(progreso.value);
        loaded.value = true;
        error.value = null;
      } else {
        error.value =
          'No pudimos cargar tu progreso. Puedes seguir estudiando; lo intentaremos de nuevo.';
      }
      // Si el catálogo falla se conserva el de respaldo: no es motivo de aviso.
      if (catalogo.status === 'fulfilled' && Array.isArray(catalogo.value.logros)) {
        catalogoLogros.value = catalogo.value.logros;
      }
    } finally {
      if (mia === generacion) loading.value = false;
    }
  }

  /**
   * Carga progreso y logros. Sin duplicar peticiones: si ya hay una en curso devuelve esa
   * misma promesa, y si ya se cargó con éxito no vuelve a pedir salvo `force`.
   * Nunca rechaza: los errores quedan en `error`.
   */
  function load(opciones: { force?: boolean } = {}): Promise<void> {
    if (enCurso) return enCurso;
    if (loaded.value && !opciones.force) return Promise.resolve();
    // Sin token no hay a quién pedirle nada (p. ej. modo de desarrollo sin backend).
    if (!useAuthStore().token) return Promise.resolve();

    const mia = generacion;
    const promesa = cargarDesdeApi(mia).finally(() => {
      if (enCurso === promesa) enCurso = null;
    });
    enCurso = promesa;
    return promesa;
  }

  /** Vuelve al estado inicial (al cerrar sesión). */
  function reset(): void {
    generacion++;
    enCurso = null;
    modulos.value = modulosPorDefecto();
    puntajeTotal.value = 0;
    logros.value = [];
    catalogoLogros.value = catalogoDeRespaldo();
    loading.value = false;
    loaded.value = false;
    error.value = null;
  }

  return {
    modulos,
    puntajeTotal,
    logros,
    catalogoLogros,
    loading,
    loaded,
    error,
    modulosCompletados,
    siguienteLogro,
    estaCompletado,
    load,
    reset,
  };
});
